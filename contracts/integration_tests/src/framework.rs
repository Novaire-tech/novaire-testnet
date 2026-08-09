//! Protocol test framework — extended with all contract helpers
//! needed for the 7-phase comprehensive simulation.

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Env,
};

use intent_engine::IntentEngineClient;
use marketplace::NovaireMarketplaceClient;
use maturity_engine::MaturityEngineClient;
use pt_token::PtTokenClient;
use rollover::AutonomousRolloverClient;
use sy_wrapper::SyWrapperClient;
use tokenizer::TokenizerClient;
use vault::VaultClient;
use yt_token::YtTokenClient;

use crate::mock_blend_pool::{MockBlendPool, MockBlendPoolClient};
use crate::mock_factory::{MockFactory, MockFactoryClient};

pub const SCALE: i128 = 1_000_000_000;
pub const BOOTSTRAP_PT: i128 = 1_000_000_000;
pub const BOOTSTRAP_UNDER: i128 = 999_500_000;
pub const MATURITY_LEDGER: u32 = 1_000;
pub const CREATED_LEDGER: u32 = 10;

pub struct Protocol<'a> {
    pub env: Env,
    pub admin: Address,
    pub keeper: Address,
    pub underlying_token: token::TokenClient<'a>,
    pub underlying_admin: token::StellarAssetClient<'a>,
    pub vault: VaultClient<'a>,
    pub sy_wrapper: SyWrapperClient<'a>,
    pub tokenizer: TokenizerClient<'a>,
    pub pt_token: PtTokenClient<'a>,
    pub yt_token: YtTokenClient<'a>,
    pub marketplace: NovaireMarketplaceClient<'a>,
    pub intent_engine: IntentEngineClient<'a>,
    pub rollover: AutonomousRolloverClient<'a>,
    pub maturity_engine: MaturityEngineClient<'a>,
    pub maturity_ledger: u32,
    pub blend_pool: MockBlendPoolClient<'a>,
}

impl<'a> Default for Protocol<'a> {
    fn default() -> Self {
        Self::new()
    }
}

impl<'a> Protocol<'a> {
    pub fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_LEDGER,
            timestamp: 0,
            ..env.ledger().get()
        });

        let admin = Address::generate(&env);
        let keeper = Address::generate(&env);

        let underlying_token_admin = Address::generate(&env);
        let underlying_token_addr = env
            .register_stellar_asset_contract_v2(underlying_token_admin)
            .address();
        let underlying_token = token::TokenClient::new(&env, &underlying_token_addr);
        let underlying_admin = token::StellarAssetClient::new(&env, &underlying_token_addr);

        let vault_addr = env.register(vault::Vault, ());
        let vault = VaultClient::new(&env, &vault_addr);
        let sy_wrapper_addr = env.register(sy_wrapper::SyWrapper, ());
        let sy_wrapper = SyWrapperClient::new(&env, &sy_wrapper_addr);
        let pt_token_addr = env.register(pt_token::PtToken, ());
        let pt_token = PtTokenClient::new(&env, &pt_token_addr);
        let yt_token_addr = env.register(yt_token::YtToken, ());
        let yt_token = YtTokenClient::new(&env, &yt_token_addr);
        let tokenizer_addr = env.register(tokenizer::Tokenizer, ());
        let tokenizer = TokenizerClient::new(&env, &tokenizer_addr);
        let marketplace_addr = env.register(marketplace::NovaireMarketplace, ());
        let marketplace = NovaireMarketplaceClient::new(&env, &marketplace_addr);
        let intent_engine_addr = env.register(intent_engine::IntentEngine, ());
        let intent_engine = IntentEngineClient::new(&env, &intent_engine_addr);
        let rollover_addr = env.register(rollover::AutonomousRollover, ());
        let rollover = AutonomousRolloverClient::new(&env, &rollover_addr);
        let maturity_engine_addr = env.register(maturity_engine::MaturityEngine, ());
        let maturity_engine = MaturityEngineClient::new(&env, &maturity_engine_addr);

        let blend_pool_addr = env.register(MockBlendPool, ());
        let blend_pool = MockBlendPoolClient::new(&env, &blend_pool_addr);
        blend_pool.init(&underlying_token_addr);

        // H-2: `rollover::register_rollover` now resolves each position's PT
        // contract via `Factory::get_epoch_by_maturity` rather than a single
        // mutable global slot (see `mock_factory`'s doc comment), so it needs a
        // real (if minimal) contract behind the `factory` address passed to
        // `rollover.initialize` below.
        let factory_addr = env.register(MockFactory, ());
        let factory = MockFactoryClient::new(&env, &factory_addr);
        factory.init(&pt_token_addr, &MATURITY_LEDGER);

        sy_wrapper.initialize(&admin, &underlying_token_addr, &blend_pool_addr);
        vault.initialize(&admin, &sy_wrapper_addr, &underlying_token_addr);
        pt_token.initialize(&admin, &tokenizer_addr);

        maturity_engine.initialize(&admin);
        let maturity_epoch_id = maturity_engine.open_epoch(&MATURITY_LEDGER);

        yt_token.initialize(
            &admin,
            &tokenizer_addr,
            &MATURITY_LEDGER,
            &sy_wrapper_addr,
            &maturity_engine_addr,
            &maturity_epoch_id,
        );
        tokenizer.initialize(
            &admin,
            &vault_addr,
            &pt_token_addr,
            &yt_token_addr,
            &sy_wrapper_addr,
            &MATURITY_LEDGER,
            &maturity_engine_addr,
            &maturity_epoch_id,
        );
        marketplace.initialize(
            &admin,
            &pt_token_addr,
            &yt_token_addr,
            &underlying_token_addr,
            &sy_wrapper_addr,
            &tokenizer_addr,
            &MATURITY_LEDGER,
            &maturity_engine_addr,
            &maturity_epoch_id,
        );
        intent_engine.initialize(
            &admin,
            &vault_addr,
            &tokenizer_addr,
            &marketplace_addr,
            &sy_wrapper_addr,
            &underlying_token_addr,
            &pt_token_addr,
            &yt_token_addr,
        );
        rollover.initialize(
            &admin,
            &tokenizer_addr,
            &vault_addr,
            &marketplace_addr,
            &intent_engine_addr,
            &keeper,
            &pt_token_addr,
            &underlying_token_addr,
            &factory_addr,
            &17_280,
        );

        Protocol {
            env,
            admin,
            keeper,
            underlying_token,
            underlying_admin,
            vault,
            sy_wrapper,
            tokenizer,
            pt_token,
            yt_token,
            marketplace,
            intent_engine,
            rollover,
            maturity_engine,
            maturity_ledger: MATURITY_LEDGER,
            blend_pool,
        }
    }

    pub fn create_user(&self) -> Address {
        Address::generate(&self.env)
    }

    pub fn mint_mock_usdc(&self, user: &Address, amount: i128) {
        self.underlying_admin.mint(user, &amount);
    }

    pub fn generate_yield(&self, amount: i128) {
        // Deposited funds are immediately supplied into the Blend pool, so yield must
        // accrue *inside the pool's tracked position for sy_wrapper*, not as a direct
        // token mint to sy_wrapper's own (now largely idle) balance. Mint the matching
        // underlying into the pool's own balance (mirroring real Blend, where accrued
        // interest is backed by borrower repayments) so a subsequent withdraw can still
        // be paid out, and bump sy_wrapper's tracked supplied position by the same amount.
        let sy_addr = self.sy_wrapper.address.clone();
        let pool_addr = self.blend_pool.address.clone();
        self.underlying_admin.mint(&pool_addr, &amount);
        self.blend_pool.simulate_yield(&sy_addr, &amount);
        self.sy_wrapper.harvest_yield();
    }

    pub fn advance_ledger(&self, n: u32) {
        let s = self.env.ledger().sequence();
        self.env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: s + n,
            timestamp: 0,
            ..self.env.ledger().get()
        });
    }

    pub fn set_ledger(&self, seq: u32) {
        self.env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: seq,
            timestamp: 0,
            ..self.env.ledger().get()
        });
    }

    pub fn current_ledger(&self) -> u32 {
        self.env.ledger().sequence()
    }

    // ── Vault ─────────────────────────────────────────────────────────────────
    pub fn deposit(&self, user: &Address, amount: i128) -> i128 {
        self.vault.deposit(user, &amount)
    }
    pub fn try_deposit(&self, user: &Address, amount: i128) {
        let _ = self.vault.try_deposit(user, &amount);
    }
    pub fn withdraw(&self, user: &Address, shares: i128) -> i128 {
        self.vault.withdraw(user, &shares)
    }
    pub fn try_withdraw(&self, user: &Address, shares: i128) {
        let _ = self.vault.try_withdraw(user, &shares);
    }
    pub fn transfer_vault_shares(&self, from: &Address, to: &Address, shares: i128) {
        self.vault.transfer_shares(from, to, &shares);
    }

    // ── Tokenizer ─────────────────────────────────────────────────────────────
    pub fn mint_pt_yt(&self, user: &Address, sy_shares: i128) -> (i128, i128) {
        self.tokenizer.mint_pt_yt(user, &sy_shares)
    }
    pub fn try_mint_pt_yt(&self, user: &Address, sy_shares: i128) {
        let _ = self.tokenizer.try_mint_pt_yt(user, &sy_shares);
    }
    pub fn claim_yield(&self, user: &Address) -> i128 {
        self.tokenizer.claim_yield(user)
    }
    pub fn try_claim_yield(&self, user: &Address) {
        let _ = self.tokenizer.try_claim_yield(user);
    }
    pub fn settle_epoch(&self) {
        let _ = self.tokenizer.try_settle_epoch();
    }
    pub fn redeem_pt(&self, user: &Address, pt: i128) -> i128 {
        self.tokenizer.redeem_pt(user, &pt)
    }
    pub fn try_redeem_pt(&self, user: &Address, pt: i128) {
        let _ = self.tokenizer.try_redeem_pt(user, &pt);
    }

    // ── Marketplace ───────────────────────────────────────────────────────────
    pub fn bootstrap_marketplace(&self, provider: &Address) -> i128 {
        self.underlying_admin
            .mint(provider, &(BOOTSTRAP_UNDER * 2 + BOOTSTRAP_PT * 2));

        // Fix: Mint PT and YT through tokenizer to maintain invariant
        let minted_shares = self.vault.deposit(provider, &(BOOTSTRAP_PT * 2));
        self.tokenizer
            .try_mint_pt_yt(provider, &minted_shares)
            .unwrap()
            .unwrap();

        self.marketplace
            .add_liquidity(provider, &BOOTSTRAP_PT, &BOOTSTRAP_UNDER)
    }

    pub fn add_liquidity(&self, user: &Address, pt: i128, under: i128) -> i128 {
        self.marketplace.add_liquidity(user, &pt, &under)
    }
    pub fn try_add_liquidity(&self, user: &Address, pt: i128, under: i128) {
        let _ = self.marketplace.try_add_liquidity(user, &pt, &under);
    }
    pub fn remove_liquidity(&self, user: &Address, lp: i128) -> (i128, i128, i128) {
        self.marketplace.remove_liquidity(user, &lp)
    }
    pub fn try_remove_liquidity(&self, user: &Address, lp: i128) {
        let _ = self.marketplace.try_remove_liquidity(user, &lp);
    }
    pub fn swap_underlying_for_pt(&self, user: &Address, amt: i128, min_out: i128) -> i128 {
        self.marketplace
            .swap_underlying_for_pt(user, &amt, &min_out)
    }
    pub fn try_swap_u_for_pt(&self, user: &Address, amt: i128) {
        let _ = self.marketplace.try_swap_underlying_for_pt(user, &amt, &1);
    }
    pub fn swap_pt_for_underlying(&self, user: &Address, pt: i128, min_out: i128) -> i128 {
        self.marketplace.swap_pt_for_underlying(user, &pt, &min_out)
    }
    pub fn try_swap_pt_for_u(&self, user: &Address, pt: i128) {
        let _ = self.marketplace.try_swap_pt_for_underlying(user, &pt, &1);
    }
    pub fn get_pt_price(&self) -> i128 {
        self.marketplace.get_pt_price()
    }
    pub fn get_twap(&self) -> i128 {
        self.marketplace.get_twap_rate()
    }
    pub fn get_reserves(&self) -> (i128, i128, i128) {
        self.marketplace.get_reserves()
    }
    pub fn claim_amm_yield(&self) {
        let _ = self.marketplace.try_claim_amm_yield();
    }

    // ── Intent Engine ─────────────────────────────────────────────────────────
    pub fn execute_fixed_yield_intent(
        &self,
        user: &Address,
        usdc: i128,
        min_rate: i128,
        yt_pct: u32,
    ) {
        let _ = self
            .intent_engine
            .try_execute_fixed_yield_intent(user, &usdc, &min_rate, &1, &yt_pct);
    }
    pub fn execute_yield_speculation_intent(&self, user: &Address, usdc: i128, min_yt: i128) {
        let _ = self
            .intent_engine
            .try_execute_yield_speculation_intent(user, &usdc, &min_yt, &1);
    }

    // ── Rollover ──────────────────────────────────────────────────────────────
    pub fn register_rollover(&self, user: &Address, pt: i128, min_rate: i128, min_out: i128) {
        let _ = self.rollover.try_register_rollover(
            user,
            &pt,
            &self.maturity_ledger,
            &min_rate,
            &min_out,
        );
    }
    pub fn execute_rollover(&self, user: &Address) {
        let _ = self.rollover.try_execute_rollover(user);
    }
    pub fn exit_rollover(&self, user: &Address) {
        let _ = self.rollover.try_exit_rollover(user);
    }

    pub fn get_exchange_rate(&self) -> i128 {
        self.sy_wrapper.get_exchange_rate()
    }
}
