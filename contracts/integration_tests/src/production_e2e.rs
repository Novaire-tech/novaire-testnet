//! Phase 4D: real production-topology E2E test.
//!
//! Unlike `framework::Protocol` (which wires every contract by hand and uses
//! `mock_factory::MockFactory` as a stand-in for `factory::Factory`), this module drives
//! the actual `factory::Factory` contract's `propose_deploy_epoch` / `execute_deploy_epoch`
//! timelocked path. The only stand-in contract anywhere in this module is `MockBlendPool`,
//! filling in for the real Blend Capital lending pool as a yield source.
//!
//! ## Phase 4D: Blocker 2 fixed
//!
//! The previous Phase 4 finding ("`execute_deploy_epoch` cannot deploy a second real epoch
//! under any configuration") was a real Factory bug, not a stale finding: Factory's
//! shared-Rollover wiring check compared `rollover_meta.vault`/`rollover_meta.marketplace`
//! (frozen at Rollover's one-time `initialize`, epoch 1) against the current epoch's
//! freshly-proposed `params.vault`/`params.marketplace`. Vault and Marketplace are
//! epoch-specific — a fresh pair is deployed every epoch, matching every other per-epoch
//! contract — so that comparison could never pass past epoch 1. `rollover::AutonomousRollover`
//! never reads its stored `vault`/`marketplace` fields operationally (confirmed: no
//! `DataKey::Vault`/`DataKey::Marketplace` read anywhere except `metadata()`), so the fix is
//! to drop those two fields from Factory's post-deploy wiring check (`factory/src/lib.rs`,
//! `execute_deploy_epoch`) and keep validating the fields that are genuinely invariant
//! (admin, factory address, underlying token, keeper). No change to `rollover`, `vault`, or
//! `marketplace` production code was needed or made.
//!
//! What is exercised below, against the real, unmodified-except-for-that-fix `Factory`
//! contract: three real epochs deployed end-to-end through the timelocked propose/execute
//! path, sharing one real Rollover while each epoch gets fresh Vault/Marketplace/SyWrapper/
//! Tokenizer/PT/YT/IntentEngine/MaturityEngine; three real users (Alice, Bob, Carol)
//! registering and rolling real positions across those epochs via real `register_rollover`/
//! `execute_rollover`/`exit_rollover` calls, with Rollover resolving each epoch's Tokenizer/
//! PT/IntentEngine dynamically from Factory; and real Factory-lookup-failure rejection on
//! `register_rollover` for an unknown maturity.
#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Env,
};

use factory::{DeployEpochParams, EpochRecord, FactoryClient};
use intent_engine::IntentEngineClient;
use marketplace::NovaireMarketplaceClient;
use pt_token::PtTokenClient;
use rollover::AutonomousRolloverClient;
use sy_wrapper::SyWrapperClient;
use tokenizer::TokenizerClient;
use vault::VaultClient;
use yt_token::YtTokenClient;

use crate::mock_blend_pool::{MockBlendPool, MockBlendPoolClient};

/// Matches `factory::DEPLOY_TIMELOCK_LEDGERS` (private to that crate): the number of
/// ledgers that must elapse between `propose_deploy_epoch` and `execute_deploy_epoch`.
const DEPLOY_TIMELOCK_LEDGERS: u32 = 17_280;
const GRACE_PERIOD_LEDGERS: u32 = 17_280;
const CREATED_LEDGER: u32 = 10;

const BOOTSTRAP_PT: i128 = 1_000_000_000;
const BOOTSTRAP_UNDER: i128 = 999_500_000;

/// One fully-deployed epoch's real contract clients, all resolved from the real
/// `Factory::EpochRecord` returned by `execute_deploy_epoch` — never hand-assembled.
pub struct EpochRig<'a> {
    pub epoch_id: u32,
    pub maturity_ledger: u32,
    pub vault: VaultClient<'a>,
    pub sy_wrapper: SyWrapperClient<'a>,
    pub tokenizer: TokenizerClient<'a>,
    pub pt_token: PtTokenClient<'a>,
    pub yt_token: YtTokenClient<'a>,
    pub marketplace: NovaireMarketplaceClient<'a>,
    pub intent_engine: IntentEngineClient<'a>,
}

pub struct ProdRig<'a> {
    pub env: Env,
    pub admin: Address,
    pub keeper: Address,
    pub underlying: token::TokenClient<'a>,
    pub underlying_admin: token::StellarAssetClient<'a>,
    pub factory: FactoryClient<'a>,
    pub blend_pool_addr: Address,
    pub epochs: std::vec::Vec<EpochRig<'a>>,
}

impl<'a> ProdRig<'a> {
    fn base(
        env: &Env,
    ) -> (
        Address,
        Address,
        token::TokenClient<'a>,
        token::StellarAssetClient<'a>,
        Address,
        FactoryClient<'a>,
    ) {
        let admin = Address::generate(env);
        let keeper = Address::generate(env);

        let underlying_admin_addr = Address::generate(env);
        let underlying_addr = env
            .register_stellar_asset_contract_v2(underlying_admin_addr)
            .address();
        let underlying = token::TokenClient::new(env, &underlying_addr);
        let underlying_admin = token::StellarAssetClient::new(env, &underlying_addr);

        let blend_pool_addr = env.register(MockBlendPool, ());
        MockBlendPoolClient::new(env, &blend_pool_addr).init(&underlying_addr);

        let factory_addr = env.register(factory::Factory, ());
        let factory_client = FactoryClient::new(env, &factory_addr);
        factory_client.initialize(&admin, &1);

        (
            admin,
            keeper,
            underlying,
            underlying_admin,
            blend_pool_addr,
            factory_client,
        )
    }

    fn new_env() -> Env {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_LEDGER,
            timestamp: 0,
            ..env.ledger().get()
        });
        // Deploying an epoch advances the ledger by the real Factory deploy timelock
        // (17,280 ledgers), and a multi-epoch scenario advances further still past later
        // epochs' maturities/grace periods; without raising the test env's entry-TTL
        // floors, freshly-registered-but-not-yet-touched contract instances archive
        // before later calls can reach them.
        env.ledger()
            .set_max_entry_ttl(DEPLOY_TIMELOCK_LEDGERS * 200);
        env.ledger()
            .set_min_persistent_entry_ttl(DEPLOY_TIMELOCK_LEDGERS * 50 + 500);
        env.ledger()
            .set_min_temp_entry_ttl(DEPLOY_TIMELOCK_LEDGERS * 50 + 500);
        env
    }

    /// Deploys a single real epoch (fresh Vault/SyWrapper/PT/YT/Tokenizer/Marketplace/
    /// IntentEngine/MaturityEngine/Rollover) end-to-end through Factory's real timelocked
    /// propose/execute path.
    pub fn new_single_epoch(maturity_ledger: u32) -> Self {
        let env = Self::new_env();
        let (admin, keeper, underlying, underlying_admin, blend_pool_addr, factory_client) =
            Self::base(&env);

        let rollover_addr = env.register(rollover::AutonomousRollover, ());
        let record = deploy_one_epoch(
            &env,
            &factory_client,
            &keeper,
            &underlying.address,
            &blend_pool_addr,
            &rollover_addr,
            maturity_ledger,
        );
        let epoch = epoch_rig(&env, &record);

        ProdRig {
            env,
            admin,
            keeper,
            underlying,
            underlying_admin,
            factory: factory_client,
            blend_pool_addr,
            epochs: std::vec![epoch],
        }
    }

    /// Deploys `maturity_ledgers.len()` real epochs, each with fresh Vault/SyWrapper/PT/YT/
    /// Tokenizer/Marketplace/IntentEngine/MaturityEngine, all sharing one real Rollover
    /// (initialized once on epoch 1, reused thereafter — Factory's shared-Rollover wiring
    /// check on every later epoch's `execute_deploy_epoch` call). Adjacent epochs are linked
    /// via `Factory::link_epochs` so `execute_rollover` can discover the next epoch.
    pub fn new_multi_epoch(maturity_ledgers: &[u32]) -> Self {
        let env = Self::new_env();
        let (admin, keeper, underlying, underlying_admin, blend_pool_addr, factory_client) =
            Self::base(&env);

        let rollover_addr = env.register(rollover::AutonomousRollover, ());
        let mut epochs = std::vec::Vec::new();
        for &maturity_ledger in maturity_ledgers {
            let record = deploy_one_epoch(
                &env,
                &factory_client,
                &keeper,
                &underlying.address,
                &blend_pool_addr,
                &rollover_addr,
                maturity_ledger,
            );
            epochs.push(epoch_rig(&env, &record));
        }
        for w in 0..epochs.len().saturating_sub(1) {
            factory_client.link_epochs(&epochs[w].epoch_id, &epochs[w + 1].epoch_id);
        }

        ProdRig {
            env,
            admin,
            keeper,
            underlying,
            underlying_admin,
            factory: factory_client,
            blend_pool_addr,
            epochs,
        }
    }

    pub fn create_user(&self) -> Address {
        Address::generate(&self.env)
    }

    pub fn mint_underlying(&self, user: &Address, amount: i128) {
        self.underlying_admin.mint(user, &amount);
    }

    pub fn mint_pt(&self, idx: usize, user: &Address, usdc: i128) -> i128 {
        self.mint_underlying(user, usdc);
        let shares = self.epochs[idx].vault.deposit(user, &usdc);
        let (pt, _yt) = self.epochs[idx].tokenizer.mint_pt_yt(user, &shares);
        pt
    }

    pub fn bootstrap_marketplace(&self, idx: usize) {
        let provider = self.create_user();
        self.mint_underlying(&provider, BOOTSTRAP_UNDER * 2 + BOOTSTRAP_PT * 2);
        let shares = self.epochs[idx]
            .vault
            .deposit(&provider, &(BOOTSTRAP_PT * 2));
        self.epochs[idx].tokenizer.mint_pt_yt(&provider, &shares);
        self.epochs[idx]
            .marketplace
            .add_liquidity(&provider, &BOOTSTRAP_PT, &BOOTSTRAP_UNDER);
    }

    pub fn advance_to(&self, seq: u32) {
        self.env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: seq,
            timestamp: 0,
            ..self.env.ledger().get()
        });
    }
}

fn epoch_rig<'a>(env: &Env, record: &EpochRecord) -> EpochRig<'a> {
    EpochRig {
        epoch_id: record.epoch_id,
        maturity_ledger: record.maturity_ledger,
        vault: VaultClient::new(env, &record.vault),
        sy_wrapper: SyWrapperClient::new(env, &record.sy_wrapper),
        tokenizer: TokenizerClient::new(env, &record.tokenizer),
        pt_token: PtTokenClient::new(env, &record.pt_token),
        yt_token: YtTokenClient::new(env, &record.yt_token),
        marketplace: NovaireMarketplaceClient::new(env, &record.marketplace),
        intent_engine: IntentEngineClient::new(env, &record.intent_engine),
    }
}

#[allow(clippy::too_many_arguments)]
fn deploy_one_epoch(
    env: &Env,
    factory_client: &FactoryClient,
    keeper: &Address,
    underlying_addr: &Address,
    blend_pool_addr: &Address,
    rollover_addr: &Address,
    maturity_ledger: u32,
) -> EpochRecord {
    let vault_addr = env.register(vault::Vault, ());
    let sy_wrapper_addr = env.register(sy_wrapper::SyWrapper, ());
    let pt_token_addr = env.register(pt_token::PtToken, ());
    let yt_token_addr = env.register(yt_token::YtToken, ());
    let tokenizer_addr = env.register(tokenizer::Tokenizer, ());
    let marketplace_addr = env.register(marketplace::NovaireMarketplace, ());
    let intent_engine_addr = env.register(intent_engine::IntentEngine, ());
    let maturity_engine_addr = env.register(maturity_engine::MaturityEngine, ());

    let params = DeployEpochParams {
        maturity_ledger,
        underlying_token: underlying_addr.clone(),
        sy_wrapper: sy_wrapper_addr,
        vault: vault_addr,
        blend_pool: blend_pool_addr.clone(),
        pt_token: pt_token_addr,
        yt_token: yt_token_addr,
        tokenizer: tokenizer_addr,
        marketplace: marketplace_addr,
        intent_engine: intent_engine_addr,
        rollover_engine: rollover_addr.clone(),
        keeper: keeper.clone(),
        grace_period_ledgers: GRACE_PERIOD_LEDGERS,
        maturity_engine: maturity_engine_addr,
    };

    // Real timelocked propose/execute path — no manual storage mutation, no MockFactory.
    factory_client.propose_deploy_epoch(&params);
    let cur = env.ledger().sequence();
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: cur + DEPLOY_TIMELOCK_LEDGERS + 1,
        timestamp: 0,
        ..env.ledger().get()
    });
    let epoch_id = factory_client.execute_deploy_epoch();
    factory_client.get_epoch(&epoch_id)
}

// ============================================================================
// What genuinely works against the real, unmodified Factory contract
// ============================================================================

#[test]
fn test_real_factory_deploys_one_epoch_with_full_real_wiring() {
    let rig = ProdRig::new_single_epoch(500_000);
    let e = &rig.epochs[0];
    assert_eq!(e.epoch_id, 1);
    assert_eq!(e.maturity_ledger, 500_000);

    // Factory's own post-deploy wiring-consistency checks (vault_meta, pt_meta, yt_meta,
    // tok_meta, rollover_meta, sy underlying_asset, maturity_engine live_state) all passed
    // for real contracts, or `execute_deploy_epoch` above would have trapped.
    let record = rig.factory.get_epoch(&e.epoch_id);
    assert_eq!(record.vault, e.vault.address);
    assert_eq!(record.tokenizer, e.tokenizer.address);
    assert_eq!(record.pt_token, e.pt_token.address);
    assert_eq!(record.intent_engine, e.intent_engine.address);
    assert!(record.is_active);

    // Real position creation via the real Tokenizer/Vault/PT flow.
    let alice = rig.create_user();
    let alice_pt = rig.mint_pt(0, &alice, 10_000_000_000);
    assert!(alice_pt > 0);
    assert_eq!(e.pt_token.balance(&alice), alice_pt);
    assert_eq!(e.tokenizer.metadata().total_pt_minted, alice_pt);
}

/// Factory lookup failure on `register_rollover`: an unknown maturity means
/// `Factory::get_epoch_by_maturity` traps with `InvalidEpoch` *before* it can construct
/// and return any `EpochRecord` (so incompatibility (1)'s decode panic never triggers
/// here — Factory fails first). `register_rollover` therefore fails atomically: no
/// position created, no PT pulled from the user.
#[test]
fn test_atomicity_factory_lookup_failure_on_register() {
    let rig = ProdRig::new_single_epoch(500_000);
    rig.bootstrap_marketplace(0);

    let erin = rig.create_user();
    let erin_pt = rig.mint_pt(0, &erin, 2_000_000_000);
    let bogus_maturity = 999_999_999;

    let rollover_addr = rig
        .factory
        .get_epoch(&rig.epochs[0].epoch_id)
        .rollover_engine;
    let rollover = AutonomousRolloverClient::new(&rig.env, &rollover_addr);

    let result = rollover.try_register_rollover(&erin, &erin_pt, &bogus_maturity, &0, &0);
    assert!(result.is_err(), "must fail: maturity has no deployed epoch");

    assert_eq!(rig.epochs[0].pt_token.balance(&erin), erin_pt);
    assert!(rollover.try_get_position(&erin).is_err());
}

// ============================================================================
// Phase 4D: real 3-epoch production topology
// ============================================================================

/// Real 3-epoch deployment: Vault/Marketplace/SyWrapper/Tokenizer/PT/YT/IntentEngine/
/// MaturityEngine are fresh every epoch; Rollover is the same contract instance across
/// all three.
#[test]
fn test_real_three_epoch_deployment_shares_rollover_fresh_vault_marketplace() {
    let rig = ProdRig::new_multi_epoch(&[500_000, 600_000, 700_000]);
    assert_eq!(rig.epochs.len(), 3);

    let r1 = rig.factory.get_epoch(&rig.epochs[0].epoch_id);
    let r2 = rig.factory.get_epoch(&rig.epochs[1].epoch_id);
    let r3 = rig.factory.get_epoch(&rig.epochs[2].epoch_id);

    assert_eq!(r1.rollover_engine, r2.rollover_engine);
    assert_eq!(r2.rollover_engine, r3.rollover_engine);

    assert_ne!(r1.vault, r2.vault);
    assert_ne!(r2.vault, r3.vault);
    assert_ne!(r1.vault, r3.vault);

    assert_ne!(r1.marketplace, r2.marketplace);
    assert_ne!(r2.marketplace, r3.marketplace);
    assert_ne!(r1.marketplace, r3.marketplace);

    assert_ne!(r1.tokenizer, r2.tokenizer);
    assert_ne!(r1.pt_token, r2.pt_token);
    assert_ne!(r1.intent_engine, r2.intent_engine);
    assert_ne!(r2.tokenizer, r3.tokenizer);
    assert_ne!(r2.pt_token, r3.pt_token);
    assert_ne!(r2.intent_engine, r3.intent_engine);
}

/// Alice and Carol roll their positions forward one epoch each; Bob stays put. Each
/// position's `pt_token` moves independently — no global PT address — and Rollover
/// resolves each epoch's Tokenizer/PT/IntentEngine dynamically from the real Factory.
#[test]
fn test_real_three_epoch_rollover_and_exit_with_isolated_positions() {
    let rig = ProdRig::new_multi_epoch(&[500_000, 600_000, 700_000]);
    rig.bootstrap_marketplace(0);
    rig.bootstrap_marketplace(1);
    rig.bootstrap_marketplace(2);

    let rollover_addr = rig
        .factory
        .get_epoch(&rig.epochs[0].epoch_id)
        .rollover_engine;
    let rollover = AutonomousRolloverClient::new(&rig.env, &rollover_addr);

    let alice = rig.create_user();
    let bob = rig.create_user();
    let carol = rig.create_user();

    // Kept small relative to bootstrap marketplace liquidity: `execute_rollover` sells
    // 100% of the freshly-minted YT through the real AMM curve, whose fee-free proceeds
    // are `yt_in - cost_to_buy_back_paired_PT` — only positive when `yt_in` is a small
    // fraction of pool depth (see `compute_yt_sell_proceeds` in marketplace/src/lib.rs).
    let alice_pt = rig.mint_pt(0, &alice, 200_000);
    let bob_pt = rig.mint_pt(0, &bob, 150_000);

    rollover.register_rollover(&alice, &alice_pt, &rig.epochs[0].maturity_ledger, &0, &0);
    rollover.register_rollover(&bob, &bob_pt, &rig.epochs[0].maturity_ledger, &0, &0);

    // Advance past epoch 1's own maturity + grace period (but before epoch 2 matures, or
    // `execute_rollover` would see the next epoch as already-matured too) so keeper auth is
    // no longer required, then settle epoch 1 so its PT is redeemable.
    rig.advance_to(rig.epochs[0].maturity_ledger + GRACE_PERIOD_LEDGERS + 1);
    rig.epochs[0].tokenizer.settle_epoch();

    // Alice rolls Epoch N -> N+1; Bob deliberately does not.
    rollover.execute_rollover(&alice);

    let alice_pos = rollover.get_position(&alice);
    assert_eq!(alice_pos.pt_token, rig.epochs[1].pt_token.address);
    assert_eq!(
        alice_pos.current_epoch_maturity,
        rig.epochs[1].maturity_ledger
    );

    let bob_pos = rollover.get_position(&bob);
    assert_eq!(bob_pos.pt_token, rig.epochs[0].pt_token.address);
    assert_eq!(
        bob_pos.current_epoch_maturity,
        rig.epochs[0].maturity_ledger
    );

    // Carol enters directly in Epoch N+1, then rolls forward to N+2.
    let carol_pt = rig.mint_pt(1, &carol, 80_000);
    rollover.register_rollover(&carol, &carol_pt, &rig.epochs[1].maturity_ledger, &0, &0);

    rig.advance_to(rig.epochs[1].maturity_ledger + GRACE_PERIOD_LEDGERS + 1);
    rig.epochs[1].tokenizer.settle_epoch();
    rollover.execute_rollover(&carol);

    let carol_pos = rollover.get_position(&carol);
    assert_eq!(carol_pos.pt_token, rig.epochs[2].pt_token.address);
    assert_eq!(
        carol_pos.current_epoch_maturity,
        rig.epochs[2].maturity_ledger
    );

    // Exit all three; each gets back its own position's PT token, not a global address.
    rollover.exit_rollover(&alice);
    rollover.exit_rollover(&bob);
    rollover.exit_rollover(&carol);

    assert!(rollover.try_get_position(&alice).is_err());
    assert!(rollover.try_get_position(&bob).is_err());
    assert!(rollover.try_get_position(&carol).is_err());

    assert_eq!(rig.epochs[1].pt_token.balance(&alice), alice_pos.pt_balance);
    assert_eq!(rig.epochs[0].pt_token.balance(&bob), bob_pt);
    assert_eq!(rig.epochs[2].pt_token.balance(&carol), carol_pos.pt_balance);

    // Custody: Rollover holds nothing left for any of the three PT tokens it touched.
    assert_eq!(
        rollover.total_pt_held_for_token(&rig.epochs[0].pt_token.address),
        0
    );
    assert_eq!(
        rollover.total_pt_held_for_token(&rig.epochs[1].pt_token.address),
        0
    );
    assert_eq!(
        rollover.total_pt_held_for_token(&rig.epochs[2].pt_token.address),
        0
    );
}

/// A real `register_rollover`/`execute_rollover` call against a real, successfully-deployed
/// `Factory` epoch succeeds. Factory exposes a dedicated narrow `RolloverEpochView`
/// (`epoch_view_by_maturity`/`next_epoch_view`/`latest_epoch_view`, `factory/src/lib.rs`)
/// instead of forcing Rollover to decode the full 15-field `EpochRecord`.
#[test]
fn test_real_rollover_decodes_real_factory_epoch_view() {
    let rig = ProdRig::new_single_epoch(500_000);
    rig.bootstrap_marketplace(0);

    let alice = rig.create_user();
    let alice_pt = rig.mint_pt(0, &alice, 10_000_000_000);

    let rollover_addr = rig
        .factory
        .get_epoch(&rig.epochs[0].epoch_id)
        .rollover_engine;
    let rollover = AutonomousRolloverClient::new(&rig.env, &rollover_addr);

    rollover.register_rollover(&alice, &alice_pt, &rig.epochs[0].maturity_ledger, &0, &0);

    let position = rollover.get_position(&alice);
    assert!(position.active);
    assert_eq!(position.pt_balance, alice_pt);
    assert_eq!(position.pt_token, rig.epochs[0].pt_token.address);
    assert_eq!(rig.epochs[0].pt_token.balance(&rollover_addr), alice_pt);
}

/// Proves the narrow view's field values themselves are correct against a real Factory,
/// not just that decoding no longer panics.
#[test]
fn test_real_factory_epoch_view_fields_match_full_record() {
    let rig = ProdRig::new_single_epoch(500_000);
    let full = rig.factory.get_epoch(&rig.epochs[0].epoch_id);
    let view = rig.factory.epoch_view_by_maturity(&500_000);

    assert_eq!(view.epoch_id, full.epoch_id);
    assert_eq!(view.maturity_ledger, full.maturity_ledger);
    assert_eq!(view.pt_token, full.pt_token);
    assert_eq!(view.tokenizer, full.tokenizer);
    assert_eq!(view.intent_engine, full.intent_engine);

    let latest = rig.factory.latest_epoch_view();
    assert_eq!(latest, view);
}
