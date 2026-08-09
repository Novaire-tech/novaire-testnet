#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger},
    token, Address, Env,
};

use intent_engine::{CumulativeIntentRecord, IntentEngineClient};
use pt_token::{PtToken, PtTokenClient};

use soroban_sdk::{contract, contractimpl};

#[contract]
pub struct MockIntentEngine;
#[contractimpl]
impl MockIntentEngine {
    pub fn execute_fixed_yield_intent(
        env: Env,
        user: Address,
        usdc_amount: i128,
        _min_implied_rate: i128,
        _min_underlying_out: i128,
        _yt_sale_percentage: u32,
    ) -> CumulativeIntentRecord {
        let pt_token_addr: Address = env
            .storage()
            .instance()
            .get(&soroban_sdk::Symbol::new(&env, "pt_token"))
            .unwrap();
        let pt_client = PtTokenClient::new(&env, &pt_token_addr);
        pt_client.mint(&user, &usdc_amount); // Mint PT to user

        CumulativeIntentRecord {
            total_deposited_amount: usdc_amount,
            total_pt_held: usdc_amount,
            total_yt_sold: usdc_amount,
            total_underlying_received: 0,
        }
    }

    pub fn set_pt_token_intent(env: Env, pt_token: Address) {
        env.storage()
            .instance()
            .set(&soroban_sdk::Symbol::new(&env, "pt_token"), &pt_token);
    }

    pub fn get_user_intent(env: Env, user: Address) -> CumulativeIntentRecord {
        env.storage()
            .persistent()
            .get(&(soroban_sdk::Symbol::new(&env, "cum"), user))
            .unwrap_or(CumulativeIntentRecord {
                total_deposited_amount: 0,
                total_pt_held: 0,
                total_yt_sold: 0,
                total_underlying_received: 0,
            })
    }
}

/// Real epochs are distinct maturities with their own Tokenizer/IntentEngine/PT
/// token contracts, so this mock keys a full `RolloverEpochView` per `maturity_ledger`
/// (via `set_epoch`) rather than one mutable global slot - otherwise a "current
/// epoch" lookup could accidentally see a "next epoch" mutation, masking exactly
/// the per-epoch resolution bugs this refactor exists to prevent.
#[contract]
pub struct MockFactory;
#[contractimpl]
impl MockFactory {
    pub fn latest_epoch_view(env: Env) -> RolloverEpochView {
        Self::next_epoch_view(env, 0)
    }

    pub fn epoch_view_by_maturity(env: Env, maturity_ledger: u32) -> RolloverEpochView {
        env.storage()
            .instance()
            .get(&(soroban_sdk::Symbol::new(&env, "ep"), maturity_ledger))
            .unwrap()
    }

    pub fn next_epoch_view(env: Env, _current_epoch_id: u32) -> RolloverEpochView {
        let next_maturity: u32 = env
            .storage()
            .instance()
            .get(&soroban_sdk::Symbol::new(&env, "next_maturity"))
            .unwrap_or(2000);
        Self::epoch_view_by_maturity(env, next_maturity)
    }

    pub fn set_next_maturity(env: Env, maturity_ledger: u32) {
        env.storage().instance().set(
            &soroban_sdk::Symbol::new(&env, "next_maturity"),
            &maturity_ledger,
        );
    }

    pub fn set_epoch(
        env: Env,
        maturity_ledger: u32,
        pt_token: Address,
        tokenizer: Address,
        intent_engine: Address,
    ) {
        let record = RolloverEpochView {
            epoch_id: maturity_ledger,
            maturity_ledger,
            pt_token,
            tokenizer,
            intent_engine,
        };
        env.storage().instance().set(
            &(soroban_sdk::Symbol::new(&env, "ep"), maturity_ledger),
            &record,
        );
    }
}

#[contract]
pub struct MockTokenizer;
#[contractimpl]
impl MockTokenizer {
    pub fn redeem_pt(env: Env, to: Address, amount: i128) -> i128 {
        let pt_token_addr: Address = env
            .storage()
            .instance()
            .get(&soroban_sdk::Symbol::new(&env, "pt_token"))
            .unwrap();
        let pt_client = PtTokenClient::new(&env, &pt_token_addr);
        pt_client.burn(&to, &amount); // Burn PT from user
        amount + 10 // Simulate some yield
    }

    pub fn set_pt_token_tokenizer(env: Env, pt_token: Address) {
        env.storage()
            .instance()
            .set(&soroban_sdk::Symbol::new(&env, "pt_token"), &pt_token);
    }
}

fn setup_env() -> (
    Env,
    Address,
    Address,
    AutonomousRolloverClient<'static>,
    PtTokenClient<'static>,
    token::StellarAssetClient<'static>,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();

    let admin = Address::generate(&env);
    let keeper = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let underlying_token = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_admin_client = token::StellarAssetClient::new(&env, &underlying_token);

    let tokenizer_contract_id = env.register(MockTokenizer, ());
    let intent_engine_contract_id = env.register(MockIntentEngine, ());

    let pt_contract_id = env.register(PtToken, ());
    let pt_client = PtTokenClient::new(&env, &pt_contract_id);
    pt_client.initialize(&admin, &tokenizer_contract_id);

    env.as_contract(&tokenizer_contract_id, || {
        env.storage()
            .instance()
            .set(&soroban_sdk::Symbol::new(&env, "pt_token"), &pt_contract_id);
    });
    env.as_contract(&intent_engine_contract_id, || {
        env.storage()
            .instance()
            .set(&soroban_sdk::Symbol::new(&env, "pt_token"), &pt_contract_id);
    });

    let factory_contract_id = env.register(MockFactory, ());
    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);
    mock_factory_client.set_epoch(
        &1000,
        &pt_contract_id,
        &tokenizer_contract_id,
        &intent_engine_contract_id,
    );

    let rollover_contract_id = env.register(AutonomousRollover, ());
    let rollover_client = AutonomousRolloverClient::new(&env, &rollover_contract_id);
    rollover_client.initialize(
        &admin,
        &tokenizer_contract_id,
        &Address::generate(&env), // vault
        &Address::generate(&env), // marketplace
        &intent_engine_contract_id,
        &keeper,
        &pt_contract_id,
        &underlying_token,
        &factory_contract_id,
        &17280,
    );

    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 0,
        ..env.ledger().get()
    });

    (
        env,
        keeper,
        underlying_token,
        rollover_client,
        pt_client,
        token_admin_client,
        intent_engine_contract_id,
        factory_contract_id,
    )
}

#[test]
fn test_register_and_execute_rollover() {
    let (
        env,
        _,
        _,
        rollover,
        pt_client,
        token_admin,
        intent_engine_contract_id,
        factory_contract_id,
    ) = setup_env();

    let user = Address::generate(&env);

    // User gets 2000 USDC, wraps it to PT
    token_admin.mint(&user, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);

    // Give Intent Engine a valid twap. The market needs liquidity.
    // We already added 1M PT and 1M U liquidity. TWAP is 1.
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &0);

    let initial_pt = pt_client.balance(&user);
    assert!(initial_pt > 0);

    // 1. Register rollover
    rollover.register_rollover(&user, &initial_pt, &1000, &0, &0);

    assert_eq!(pt_client.balance(&user), 0); // Contract took PT

    let position = rollover.get_position(&user);
    assert!(position.active);
    assert_eq!(position.pt_balance, initial_pt);
    assert_eq!(position.current_epoch_maturity, 1000);

    // Advance ledger to maturity
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..env.ledger().get()
    });

    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);
    mock_factory_client.set_next_maturity(&2000);
    mock_factory_client.set_epoch(
        &2000,
        &pt_client.address,
        &pt_client.metadata().tokenizer,
        &intent_engine_contract_id,
    );

    // 2. Execute rollover
    rollover.execute_rollover(&user);

    let updated_pos = rollover.get_position(&user);
    assert_eq!(updated_pos.current_epoch_maturity, 2000);
    assert!(updated_pos.pt_balance > 0);
    assert_eq!(updated_pos.protocol_yield_earned, 0);
    assert_eq!(updated_pos.realized_pnl, 10);
}

#[test]
fn test_exit_rollover() {
    let (env, _, _, rollover, pt_client, token_admin, intent_engine_contract_id, _) = setup_env();
    let user = Address::generate(&env);
    token_admin.mint(&user, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &0);

    let initial_pt = pt_client.balance(&user);
    rollover.register_rollover(&user, &initial_pt, &1000, &0, &0);

    rollover.exit_rollover(&user);

    assert_eq!(pt_client.balance(&user), initial_pt);
    let pos = rollover.try_get_position(&user);
    assert!(pos.is_err()); // Position deleted
}

#[test]
fn test_register_rollover_rejects_double_registration() {
    let (env, _, _, rollover, pt_client, token_admin, intent_engine_contract_id, _) = setup_env();
    let user = Address::generate(&env);
    token_admin.mint(&user, &4000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &0);
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &0);

    let total_pt = pt_client.balance(&user);
    let first_amount = total_pt / 2;
    let second_amount = total_pt - first_amount;

    // First registration succeeds and custodies `first_amount` PT.
    rollover.register_rollover(&user, &first_amount, &1000, &0, &0);
    assert_eq!(pt_client.balance(&user), second_amount);

    // A second registration while the first position is still active must be
    // rejected, not silently overwrite the stored position and orphan the
    // already-custodied PT.
    let result = rollover.try_register_rollover(&user, &second_amount, &1000, &0, &0);
    assert!(result.is_err());

    // The user's remaining PT was never pulled in by the rejected call, and
    // the original position is untouched.
    assert_eq!(pt_client.balance(&user), second_amount);
    let position = rollover.get_position(&user);
    assert_eq!(position.pt_balance, first_amount);

    // The user can still recover their original funds in full.
    rollover.exit_rollover(&user);
    assert_eq!(pt_client.balance(&user), total_pt);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_next_epoch_not_set() {
    let (
        env,
        _,
        _,
        rollover,
        pt_client,
        token_admin,
        intent_engine_contract_id,
        factory_contract_id,
    ) = setup_env();
    let user = Address::generate(&env);
    token_admin.mint(&user, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &0);

    let initial_pt = pt_client.balance(&user);
    rollover.register_rollover(&user, &initial_pt, &1000, &0, &0);

    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);
    mock_factory_client.set_next_maturity(&2000);
    mock_factory_client.set_epoch(
        &2000,
        &pt_client.address,
        &pt_client.metadata().tokenizer,
        &intent_engine_contract_id,
    );

    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..env.ledger().get()
    });
    rollover.execute_rollover(&user); // successful roll

    // next epoch maturity hasn't advanced, so latest epoch maturity <= current_ledger!
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 2001,
        ..env.ledger().get()
    });
    rollover.execute_rollover(&user); // fails because next_epoch is now 2000 which is <= 2001
}

#[test]
fn test_rollover_position_ttl_extended_on_write() {
    let (env, _, _, rollover, pt_client, token_admin, intent_engine_contract_id, _) = setup_env();
    let user = Address::generate(&env);
    token_admin.mint(&user, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &0);
    let initial_pt = pt_client.balance(&user);

    rollover.register_rollover(&user, &initial_pt, &1000, &0, &0);

    let key = DataKey::RolloverPositions(user.clone());
    let ttl = env.as_contract(&rollover.address, || {
        env.storage().persistent().get_ttl(&key)
    });

    // Freshly written positions must be bumped out to (near) the full extend-to
    // window, not left at the ledger's default minimum persistent TTL.
    assert!(ttl >= PERSISTENT_BUMP_AMOUNT - 1);
}

#[test]
fn test_rollover_position_survives_long_maturity_gap() {
    let (env, _, _, rollover, pt_client, token_admin, intent_engine_contract_id, _) = setup_env();
    let user = Address::generate(&env);
    token_admin.mint(&user, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &0);
    let initial_pt = pt_client.balance(&user);

    rollover.register_rollover(&user, &initial_pt, &1000, &0, &0);

    // Jump far past the persistent lifetime threshold (e.g. a multi-month
    // fixed-rate maturity) without touching the position in between.
    let far_future_ledger = 1 + PERSISTENT_LIFETIME_THRESHOLD + 1000;
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: far_future_ledger,
        ..env.ledger().get()
    });

    // The position must still be readable and unchanged: TTL management must
    // not alter stored data, only how long it survives.
    let position = rollover.get_position(&user);
    assert!(position.active);
    assert_eq!(position.pt_balance, initial_pt);

    // Reading it re-bumps the TTL for the next stretch of inactivity.
    let key = DataKey::RolloverPositions(user.clone());
    let ttl = env.as_contract(&rollover.address, || {
        env.storage().persistent().get_ttl(&key)
    });
    assert!(ttl >= PERSISTENT_BUMP_AMOUNT - 1);
}

#[test]
fn test_pt_custody_matches_tracked_total_across_lifecycle() {
    let (
        env,
        _,
        _,
        rollover,
        pt_client,
        token_admin,
        intent_engine_contract_id,
        factory_contract_id,
    ) = setup_env();
    let user = Address::generate(&env);
    token_admin.mint(&user, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &0);
    let initial_pt = pt_client.balance(&user);

    // After register: actual on-chain PT custody must equal tracked total_pt_held.
    rollover.register_rollover(&user, &initial_pt, &1000, &0, &0);
    assert_eq!(
        pt_client.balance(&rollover.address),
        rollover.total_pt_held()
    );

    // After a roll: custody and tracked total move together.
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..env.ledger().get()
    });
    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);
    mock_factory_client.set_next_maturity(&2000);
    mock_factory_client.set_epoch(
        &2000,
        &pt_client.address,
        &pt_client.metadata().tokenizer,
        &intent_engine_contract_id,
    );
    rollover.execute_rollover(&user);
    assert_eq!(
        pt_client.balance(&rollover.address),
        rollover.total_pt_held()
    );

    // After exit: both drain back to zero together.
    rollover.exit_rollover(&user);
    assert_eq!(pt_client.balance(&rollover.address), 0);
    assert_eq!(rollover.total_pt_held(), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn test_invariant_catches_pt_custody_mismatch() {
    let (env, _, _, rollover, pt_client, token_admin, intent_engine_contract_id, _) = setup_env();
    let user = Address::generate(&env);
    token_admin.mint(&user, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &0);
    let initial_pt = pt_client.balance(&user);

    rollover.register_rollover(&user, &initial_pt, &1000, &0, &0);

    // Simulate PT silently entering custody out-of-band (e.g. a bug elsewhere
    // crediting the contract's PT balance without updating total_pt_held).
    pt_client.mint(&rollover.address, &1);

    // The next state-changing call must trip the independent PT custody
    // invariant rather than silently accept the drifted balance.
    rollover.exit_rollover(&user);
}

// ==========================================
// H-2: position-scoped PT custody (no global mutable PT pointer)
// ==========================================

/// User A registers for epoch N; User B executes their own rollover into
/// epoch N+1 (rotating the PT token their own position uses); User A then
/// exits and must get back their epoch-N PT, not whatever token User B's
/// roll last touched. Before the fix this all shared one global
/// `DataKey::PtToken` slot, so B's `execute_rollover` would silently point
/// A's still-pending position at the wrong PT contract.
#[test]
fn test_h2_one_users_execute_does_not_trap_another_users_pt() {
    let (
        env,
        _,
        _,
        rollover,
        pt_client,
        token_admin,
        intent_engine_contract_id,
        factory_contract_id,
    ) = setup_env();
    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);

    // Both A and B register PT for the same epoch (maturity 1000), using the
    // same PT contract that's live for that epoch.
    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    token_admin.mint(&user_a, &2000);
    token_admin.mint(&user_b, &2000);

    intent_client.execute_fixed_yield_intent(&user_a, &1000, &0, &1000, &0);
    intent_client.execute_fixed_yield_intent(&user_b, &1000, &0, &1000, &0);
    let a_pt = pt_client.balance(&user_a);
    let b_pt = pt_client.balance(&user_b);

    rollover.register_rollover(&user_a, &a_pt, &1000, &0, &0);
    rollover.register_rollover(&user_b, &b_pt, &1000, &0, &0);

    let a_pt_token_at_register = rollover.get_position(&user_a).pt_token;

    // Advance past maturity and let a NEW epoch's PT contract come into play
    // for whoever rolls forward - the factory now returns a fresh PT token as
    // the "next epoch" one.
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..env.ledger().get()
    });
    mock_factory_client.set_next_maturity(&2000);

    // Simulate the next epoch minting its own fresh PT contract (this mock
    // factory serves a single `pt_token` slot for every method, so swap it
    // here to model rotation - real Blend/Novaire epochs always mint a new
    // PT token contract per epoch). The mock intent engine is what mints the
    // NEXT epoch's PT to the caller during `execute_rollover`'s roll, so its
    // `pt_token` slot is what needs to move; the mock tokenizer's slot stays
    // on the OLD PT contract, since that's what actually gets redeemed/burned.
    let pt2_contract_id = env.register(PtToken, ());
    let admin_addr = pt_client.metadata().admin;
    let tokenizer_addr = pt_client.metadata().tokenizer;
    PtTokenClient::new(&env, &pt2_contract_id).initialize(&admin_addr, &tokenizer_addr);
    env.as_contract(&intent_engine_contract_id, || {
        env.storage().instance().set(
            &soroban_sdk::Symbol::new(&env, "pt_token"),
            &pt2_contract_id,
        );
    });
    mock_factory_client.set_epoch(
        &2000,
        &pt2_contract_id,
        &tokenizer_addr,
        &intent_engine_contract_id,
    );

    // B rolls forward first. This used to overwrite the single global
    // `DataKey::PtToken` slot to the new epoch's PT contract.
    rollover.execute_rollover(&user_b);
    let b_pos_after = rollover.get_position(&user_b);
    assert_ne!(
        b_pos_after.pt_token, a_pt_token_at_register,
        "sanity: B's roll moved to a different PT contract than A's original one"
    );

    // A's position must be completely unaffected by B's roll: still pointing
    // at the original epoch's PT contract, still with its original balance.
    let a_pos_before_exit = rollover.get_position(&user_a);
    assert_eq!(a_pos_before_exit.pt_token, a_pt_token_at_register);
    assert_eq!(a_pos_before_exit.pt_balance, a_pt);

    // A exits and must receive back their original epoch-N PT, not trapped
    // and not paid out from the wrong (epoch N+1) PT contract.
    rollover.exit_rollover(&user_a);
    assert_eq!(pt_client.balance(&user_a), a_pt);
}

/// Multi-user, multi-epoch, staggered execution: A and B register for epoch
/// N, C registers directly for epoch N+1, D for epoch N+2. Rolls execute out
/// of order. No position may ever read or be paid out of another position's
/// PT contract, and each exit returns exactly that position's own tracked
/// balance in its own token.
#[test]
fn test_h2_multi_user_multi_epoch_no_cross_contamination() {
    let (
        env,
        _,
        _,
        rollover,
        pt_client_epoch_n,
        token_admin,
        intent_engine_contract_id,
        factory_contract_id,
    ) = setup_env();
    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    token_admin.mint(&user_a, &2000);
    token_admin.mint(&user_b, &2000);

    // A and B both register against epoch N (maturity 1000).
    intent_client.execute_fixed_yield_intent(&user_a, &1000, &0, &1000, &0);
    intent_client.execute_fixed_yield_intent(&user_b, &1000, &0, &1000, &0);
    let a_pt = pt_client_epoch_n.balance(&user_a);
    let b_pt = pt_client_epoch_n.balance(&user_b);
    rollover.register_rollover(&user_a, &a_pt, &1000, &0, &0);
    rollover.register_rollover(&user_b, &b_pt, &1000, &0, &0);

    let epoch_n_pt_token = rollover.get_position(&user_a).pt_token;
    assert_eq!(rollover.get_position(&user_b).pt_token, epoch_n_pt_token);

    // Move to epoch N+1 and roll A forward first (staggered execution).
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..env.ledger().get()
    });
    mock_factory_client.set_next_maturity(&2000);

    // Simulate the new epoch's fresh PT contract (see the analogous setup in
    // `test_h2_one_users_execute_does_not_trap_another_users_pt` for why only
    // the intent engine's `pt_token` slot moves).
    let pt2_contract_id = env.register(PtToken, ());
    let admin_addr = pt_client_epoch_n.metadata().admin;
    let tokenizer_addr = pt_client_epoch_n.metadata().tokenizer;
    PtTokenClient::new(&env, &pt2_contract_id).initialize(&admin_addr, &tokenizer_addr);
    env.as_contract(&intent_engine_contract_id, || {
        env.storage().instance().set(
            &soroban_sdk::Symbol::new(&env, "pt_token"),
            &pt2_contract_id,
        );
    });
    mock_factory_client.set_epoch(
        &2000,
        &pt2_contract_id,
        &tokenizer_addr,
        &intent_engine_contract_id,
    );

    rollover.execute_rollover(&user_a);
    let epoch_n1_pt_token = rollover.get_position(&user_a).pt_token;
    assert_ne!(epoch_n1_pt_token, epoch_n_pt_token);

    // B still hasn't rolled - still epoch N, still the original PT contract.
    let b_pos = rollover.get_position(&user_b);
    assert_eq!(b_pos.pt_token, epoch_n_pt_token);
    assert_eq!(b_pos.pt_balance, b_pt);

    // Now roll B forward too, into the SAME next epoch's PT contract as A.
    rollover.execute_rollover(&user_b);
    let b_pos_after = rollover.get_position(&user_b);
    assert_eq!(b_pos_after.pt_token, epoch_n1_pt_token);

    // Per-token tracked custody must equal actual on-chain balances for both
    // the vacated epoch-N contract (now 0) and the epoch-N+1 contract (both
    // A's and B's new balances).
    assert_eq!(rollover.total_pt_held_for_token(&epoch_n_pt_token), 0);
    let pt_client_epoch_n1 = PtTokenClient::new(&env, &epoch_n1_pt_token);
    assert_eq!(
        pt_client_epoch_n1.balance(&rollover.address),
        rollover.total_pt_held_for_token(&epoch_n1_pt_token)
    );

    // Both positions can independently exit and get back exactly their own
    // tracked balance in the correct (shared, in this case) PT contract.
    let a_balance_before_exit = rollover.get_position(&user_a).pt_balance;
    let b_balance_before_exit = rollover.get_position(&user_b).pt_balance;
    rollover.exit_rollover(&user_a);
    rollover.exit_rollover(&user_b);
    assert_eq!(pt_client_epoch_n1.balance(&user_a), a_balance_before_exit);
    assert_eq!(pt_client_epoch_n1.balance(&user_b), b_balance_before_exit);
}

#[test]
fn test_ro02_execute_rollover_does_not_affect_other_positions_pt_token() {
    // RO-02 regression: two positions A and B register into the same epoch. A executes a
    // rollover into epoch N+1 (acquiring a NEW PT token contract); B then exits, still in
    // epoch N. Pre-fix, both `execute_rollover` and `exit_rollover` resolved PT token via a
    // single global `DataKey::PtToken` key, so A's roll would silently repoint B's exit at
    // A's new PT token - corrupting B's redemption. Post-fix, each position resolves and
    // stores its OWN PT token, so A's roll must leave B's exit completely unaffected.
    let (
        env,
        _,
        _,
        rollover,
        pt_client,
        token_admin,
        intent_engine_contract_id,
        factory_contract_id,
    ) = setup_env();

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    token_admin.mint(&user_a, &2000);
    token_admin.mint(&user_b, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user_a, &1000, &0, &1000, &0);
    intent_client.execute_fixed_yield_intent(&user_b, &1000, &0, &1000, &0);

    let a_pt = pt_client.balance(&user_a);
    let b_pt = pt_client.balance(&user_b);

    rollover.register_rollover(&user_a, &a_pt, &1000, &0, &0);
    rollover.register_rollover(&user_b, &b_pt, &1000, &0, &0);

    let b_pt_token_at_register = rollover.get_position(&user_b).pt_token;

    // Advance past maturity and deploy a fresh PT token contract for epoch N+1.
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..env.ledger().get()
    });
    let pt2_id = env.register(PtToken, ());
    PtTokenClient::new(&env, &pt2_id).initialize(&Address::generate(&env), &rollover.address);
    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);
    mock_factory_client.set_next_maturity(&2000);
    mock_factory_client.set_epoch(
        &2000,
        &pt2_id,
        &pt_client.metadata().tokenizer,
        &intent_engine_contract_id,
    );
    let intent_engine_client = MockIntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_engine_client.set_pt_token_intent(&pt2_id);

    // A rolls forward onto the new epoch's PT token.
    rollover.execute_rollover(&user_a);
    let a_position = rollover.get_position(&user_a);
    assert_eq!(a_position.pt_token, pt2_id);

    // B, untouched by A's roll, must still resolve to the ORIGINAL PT token from
    // registration - not A's new one - and must be able to exit successfully against it.
    let b_position_before_exit = rollover.get_position(&user_b);
    assert_eq!(b_position_before_exit.pt_token, b_pt_token_at_register);
    assert_ne!(
        b_position_before_exit.pt_token, pt2_id,
        "B's PT token must not have been contaminated by A's rollover to the new epoch"
    );

    rollover.exit_rollover(&user_b);
    assert_eq!(pt_client.balance(&user_b), b_pt);
}

#[test]
fn test_ro02_staggered_rollovers_no_pt_token_cross_contamination() {
    // Staggered variant: A rolls to epoch N+1, then (separately) B rolls to epoch N+2. Each
    // position must end up pointing at its OWN epoch's PT token, never at the other's.
    let (
        env,
        _,
        _,
        rollover,
        pt_client,
        token_admin,
        intent_engine_contract_id,
        factory_contract_id,
    ) = setup_env();

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    token_admin.mint(&user_a, &2000);
    token_admin.mint(&user_b, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user_a, &1000, &0, &1000, &0);
    intent_client.execute_fixed_yield_intent(&user_b, &1000, &0, &1000, &0);

    let a_pt = pt_client.balance(&user_a);
    let b_pt = pt_client.balance(&user_b);

    rollover.register_rollover(&user_a, &a_pt, &1000, &0, &0);
    rollover.register_rollover(&user_b, &b_pt, &1000, &0, &0);

    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);
    let intent_engine_client = MockIntentEngineClient::new(&env, &intent_engine_contract_id);

    // --- A rolls to epoch N+1 ---
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..env.ledger().get()
    });
    let pt2_id = env.register(PtToken, ());
    PtTokenClient::new(&env, &pt2_id).initialize(&Address::generate(&env), &rollover.address);
    mock_factory_client.set_next_maturity(&2000);
    mock_factory_client.set_epoch(
        &2000,
        &pt2_id,
        &pt_client.metadata().tokenizer,
        &intent_engine_contract_id,
    );
    intent_engine_client.set_pt_token_intent(&pt2_id);
    rollover.execute_rollover(&user_a);
    assert_eq!(rollover.get_position(&user_a).pt_token, pt2_id);

    // --- B independently rolls to epoch N+2 (a DIFFERENT next epoch than A's) ---
    let pt3_id = env.register(PtToken, ());
    PtTokenClient::new(&env, &pt3_id).initialize(&Address::generate(&env), &rollover.address);
    mock_factory_client.set_next_maturity(&3000);
    mock_factory_client.set_epoch(
        &3000,
        &pt3_id,
        &pt_client.metadata().tokenizer,
        &intent_engine_contract_id,
    );
    intent_engine_client.set_pt_token_intent(&pt3_id);
    rollover.execute_rollover(&user_b);
    let b_position = rollover.get_position(&user_b);
    assert_eq!(b_position.pt_token, pt3_id);

    // A's position must be completely unaffected by B's later roll.
    let a_position = rollover.get_position(&user_a);
    assert_eq!(a_position.pt_token, pt2_id);
    assert_ne!(a_position.pt_token, b_position.pt_token);

    // Custody invariant holds across both distinct PT tokens simultaneously.
    assert_eq!(
        pt_client.balance(&rollover.address), // pt_client is the ORIGINAL (epoch-N) token
        0,
        "epoch-N PT token should be fully drained once both positions have rolled off it"
    );
    let pt2_client = PtTokenClient::new(&env, &pt2_id);
    let pt3_client = PtTokenClient::new(&env, &pt3_id);
    assert_eq!(pt2_client.balance(&rollover.address), a_position.pt_balance);
    assert_eq!(pt3_client.balance(&rollover.address), b_position.pt_balance);
}

#[test]
fn test_execute_rollover_keeper_vs_permissionless_boundary() {
    // `execute_rollover` must require the registered keeper's authorization
    // while inside the post-maturity grace period (inclusive of its exact
    // expiration ledger), and become callable by anyone with no auth at all
    // once that grace period has strictly passed — this is the liveness
    // guarantee described in SECURITY.md's Access Control section. `env.auths()`
    // records every `require_auth()` actually invoked during the prior call,
    // even under `mock_all_auths`, so it lets us observe which branch ran
    // without having to hand-construct the full cross-contract auth tree.
    let (
        env,
        keeper,
        _,
        rollover,
        pt_client,
        token_admin,
        intent_engine_contract_id,
        factory_contract_id,
    ) = setup_env();
    let user = Address::generate(&env);
    token_admin.mint(&user, &6000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);
    let tokenizer_contract_id = pt_client.metadata().tokenizer;

    // grace_period is 17280 ledgers (set in setup_env's `initialize` call).
    let grace_period: u32 = 17280;

    // The mock contracts' instance storage isn't TTL-managed the way the real
    // contracts' is (that's exercised elsewhere, e.g. SEC-02/SEC-07); bump it
    // manually here so the large ledger jumps below (needed to reach
    // `grace_expiration`, which is 17280 ledgers out) don't spuriously archive
    // it and mask the access-control behavior under test.
    let bump_mock_instance_ttl = |addr: &Address| {
        env.as_contract(addr, || {
            env.storage().instance().extend_ttl(150_000, 200_000);
        });
    };
    bump_mock_instance_ttl(&tokenizer_contract_id);
    bump_mock_instance_ttl(&intent_engine_contract_id);
    bump_mock_instance_ttl(&factory_contract_id);

    // A single position is rolled forward through all three phases below —
    // each `execute_rollover` call re-matures the same position onto the next
    // epoch, so there's no need to exit and re-register between phases.
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &0);
    let pt_balance = pt_client.balance(&user);
    rollover.register_rollover(&user, &pt_balance, &1000, &0, &0);

    // --- Inside the grace period: keeper authorization is required. ---
    mock_factory_client.set_next_maturity(&50_000);
    mock_factory_client.set_epoch(
        &50_000,
        &pt_client.address,
        &tokenizer_contract_id,
        &intent_engine_contract_id,
    );
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001, // just past maturity (1000), deep inside grace.
        ..env.ledger().get()
    });
    rollover.execute_rollover(&user); // position now matures at 50_000.
    assert!(
        env.auths().iter().any(|(addr, _)| addr == &keeper),
        "keeper authorization must be requested while inside the grace period"
    );

    // --- Exactly at grace expiration: still keeper-gated (inclusive boundary). ---
    mock_factory_client.set_next_maturity(&100_000);
    mock_factory_client.set_epoch(
        &100_000,
        &pt_client.address,
        &tokenizer_contract_id,
        &intent_engine_contract_id,
    );
    let grace_expiration = 50_000u32.checked_add(grace_period).unwrap();
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: grace_expiration,
        ..env.ledger().get()
    });
    rollover.execute_rollover(&user); // position now matures at 100_000.
    assert!(
        env.auths().iter().any(|(addr, _)| addr == &keeper),
        "keeper authorization must still be requested exactly at grace_expiration"
    );

    // --- One ledger past grace expiration: permissionless, no auth requested. ---
    mock_factory_client.set_next_maturity(&200_000);
    mock_factory_client.set_epoch(
        &200_000,
        &pt_client.address,
        &tokenizer_contract_id,
        &intent_engine_contract_id,
    );
    let next_grace_expiration = 100_000u32.checked_add(grace_period).unwrap();
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: next_grace_expiration + 1,
        ..env.ledger().get()
    });
    rollover.execute_rollover(&user);
    let auths = env.auths();
    assert!(
        !auths.iter().any(|(addr, _)| addr == &keeper),
        "keeper authorization must not be requested (debug: {:?})",
        auths
    );
}

// ==========================================
// Core rollover refactor: factory-resolved epoch components
// ==========================================

/// `execute_rollover` must resolve the CURRENT epoch's Tokenizer (for redemption) and the
/// NEXT epoch's IntentEngine (for minting the new PT) fresh from Factory on every call,
/// using genuinely distinct contract instances per epoch - not a cached/pinned address from
/// `initialize` or from a previous roll. The H-2 tests above only ever swap an internal
/// pointer on the SAME mock contract; this test swaps the actual contract address.
#[test]
fn test_execute_rollover_resolves_distinct_epoch_tokenizer_and_intent_engine() {
    let (
        env,
        _,
        _,
        rollover,
        pt_client,
        token_admin,
        intent_engine_contract_id,
        factory_contract_id,
    ) = setup_env();
    let user = Address::generate(&env);
    token_admin.mint(&user, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &0);
    let initial_pt = pt_client.balance(&user);
    rollover.register_rollover(&user, &initial_pt, &1000, &0, &0);

    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);
    let tokenizer_addr = pt_client.metadata().tokenizer;

    // Epoch 2 gets its own, brand-new IntentEngine contract instance (never touched by
    // epoch 1's rolls), which is what mints its PT.
    let pt2_id = env.register(PtToken, ());
    PtTokenClient::new(&env, &pt2_id)
        .initialize(&Address::generate(&env), &Address::generate(&env));
    let intent_engine2_id = env.register(MockIntentEngine, ());
    MockIntentEngineClient::new(&env, &intent_engine2_id).set_pt_token_intent(&pt2_id);

    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..env.ledger().get()
    });
    mock_factory_client.set_next_maturity(&2000);
    mock_factory_client.set_epoch(&2000, &pt2_id, &tokenizer_addr, &intent_engine2_id);

    rollover.execute_rollover(&user);
    let position = rollover.get_position(&user);
    assert_eq!(
        position.pt_token, pt2_id,
        "position must hold the PT minted by the NEXT epoch's own IntentEngine"
    );
    assert_eq!(
        PtTokenClient::new(&env, &pt2_id).balance(&rollover.address),
        position.pt_balance
    );
    // The original epoch-1 IntentEngine must never have been called for this roll.
    assert_eq!(
        intent_client
            .get_user_intent(&rollover.address)
            .total_pt_held,
        0
    );

    // Epoch 3 gets its own, brand-new Tokenizer contract instance, proving redemption
    // resolves the CURRENT epoch's Tokenizer fresh each time rather than reusing epoch 1's
    // (the one captured at `initialize`).
    let tokenizer3_id = env.register(MockTokenizer, ());
    MockTokenizerClient::new(&env, &tokenizer3_id).set_pt_token_tokenizer(&pt2_id);
    let pt3_id = env.register(PtToken, ());
    PtTokenClient::new(&env, &pt3_id)
        .initialize(&Address::generate(&env), &Address::generate(&env));
    let intent_engine3_id = env.register(MockIntentEngine, ());
    MockIntentEngineClient::new(&env, &intent_engine3_id).set_pt_token_intent(&pt3_id);

    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 2001,
        ..env.ledger().get()
    });
    mock_factory_client.set_next_maturity(&3000);
    // Epoch 2's record now points its Tokenizer at the new instance - proving the CURRENT
    // epoch's Tokenizer is re-resolved on this roll, not reused from the previous one.
    mock_factory_client.set_epoch(&2000, &pt2_id, &tokenizer3_id, &intent_engine2_id);
    mock_factory_client.set_epoch(&3000, &pt3_id, &tokenizer3_id, &intent_engine3_id);

    rollover.execute_rollover(&user);
    let position2 = rollover.get_position(&user);
    assert_eq!(position2.pt_token, pt3_id);
    // Proves tokenizer3 (and not epoch 1's tokenizer) actually redeemed/burned the epoch-2 PT.
    assert_eq!(
        PtTokenClient::new(&env, &pt2_id).balance(&rollover.address),
        0
    );
}

/// `execute_rollover` must revert, not silently continue, when a position's stored PT token
/// no longer matches what Factory resolves for that position's current epoch maturity - e.g.
/// data corruption, or a future bug elsewhere that mutates a position's `pt_token` out of
/// step with its `current_epoch_maturity`.
#[test]
#[should_panic(expected = "Error(Contract, #17)")]
fn test_execute_rollover_rejects_pt_token_mismatch() {
    let (env, _, _, rollover, pt_client, token_admin, intent_engine_contract_id, _) = setup_env();
    let user = Address::generate(&env);
    token_admin.mint(&user, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &0);
    let initial_pt = pt_client.balance(&user);
    rollover.register_rollover(&user, &initial_pt, &1000, &0, &0);

    // Corrupt the stored position's PT token so it no longer matches what Factory resolves
    // for maturity 1000 (still `pt_client`'s address).
    let bogus_pt_token = Address::generate(&env);
    env.as_contract(&rollover.address, || {
        let mut position = storage::get_position(&env, &user).unwrap();
        position.pt_token = bogus_pt_token;
        storage::set_position(&env, &user, &position);
    });

    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..env.ledger().get()
    });
    rollover.execute_rollover(&user);
}

/// Alice: N -> N+1 (rolls forward). Bob: stays at N (never rolls). Carol: registers directly
/// into N+1 (never having been in N). All three must independently resolve their own current
/// epoch's Tokenizer/PT and, for Alice, the correct next epoch's IntentEngine/PT - with zero
/// cross-contamination between any of them.
#[test]
fn test_alice_bob_carol_staggered_epochs() {
    let (
        env,
        _,
        _,
        rollover,
        pt_client,
        token_admin,
        intent_engine_contract_id,
        factory_contract_id,
    ) = setup_env();
    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);
    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    let tokenizer_addr = pt_client.metadata().tokenizer;

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);
    token_admin.mint(&alice, &2000);
    token_admin.mint(&bob, &2000);

    // Alice and Bob both mint PT in epoch N (maturity 1000, from `setup_env`).
    intent_client.execute_fixed_yield_intent(&alice, &1000, &0, &1000, &0);
    intent_client.execute_fixed_yield_intent(&bob, &1000, &0, &1000, &0);
    let alice_pt = pt_client.balance(&alice);
    let bob_pt = pt_client.balance(&bob);
    rollover.register_rollover(&alice, &alice_pt, &1000, &0, &0);
    rollover.register_rollover(&bob, &bob_pt, &1000, &0, &0);

    // Epoch N+1 (maturity 2000) gets its own fresh PT contract.
    let pt_n1_id = env.register(PtToken, ());
    PtTokenClient::new(&env, &pt_n1_id)
        .initialize(&Address::generate(&env), &Address::generate(&env));
    env.as_contract(&intent_engine_contract_id, || {
        env.storage()
            .instance()
            .set(&soroban_sdk::Symbol::new(&env, "pt_token"), &pt_n1_id);
    });
    mock_factory_client.set_epoch(
        &2000,
        &pt_n1_id,
        &tokenizer_addr,
        &intent_engine_contract_id,
    );

    // Carol registers directly into epoch N+1, never having touched epoch N.
    token_admin.mint(&carol, &2000);
    let carol_intent = intent_client.execute_fixed_yield_intent(&carol, &1000, &0, &1000, &0);
    let _ = carol_intent;
    let carol_pt = PtTokenClient::new(&env, &pt_n1_id).balance(&carol);
    // Carol's PT was minted directly into `pt_n1_id` since the intent engine's `pt_token`
    // slot now points there; give her something to register with.
    assert!(carol_pt > 0);
    rollover.register_rollover(&carol, &carol_pt, &2000, &0, &0);
    assert_eq!(rollover.get_position(&carol).pt_token, pt_n1_id);
    assert_eq!(rollover.get_position(&carol).current_epoch_maturity, 2000);

    // Alice rolls forward N -> N+1.
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..env.ledger().get()
    });
    mock_factory_client.set_next_maturity(&2000);
    rollover.execute_rollover(&alice);
    let alice_pos = rollover.get_position(&alice);
    assert_eq!(alice_pos.pt_token, pt_n1_id);
    assert_eq!(alice_pos.current_epoch_maturity, 2000);

    // Bob never rolls - still epoch N, still the original PT contract and balance.
    let bob_pos = rollover.get_position(&bob);
    assert_eq!(bob_pos.pt_token, pt_client.address);
    assert_eq!(bob_pos.current_epoch_maturity, 1000);
    assert_eq!(bob_pos.pt_balance, bob_pt);

    // Per-token custody: epoch N holds only Bob's PT; epoch N+1 holds Alice's + Carol's.
    assert_eq!(rollover.total_pt_held_for_token(&pt_client.address), bob_pt);
    assert_eq!(
        rollover.total_pt_held_for_token(&pt_n1_id),
        alice_pos.pt_balance + carol_pt
    );

    // Each of the three can independently exit into exactly their own tracked PT/balance.
    rollover.exit_rollover(&bob);
    assert_eq!(pt_client.balance(&bob), bob_pt);
    rollover.exit_rollover(&alice);
    assert_eq!(
        PtTokenClient::new(&env, &pt_n1_id).balance(&alice),
        alice_pos.pt_balance
    );
    rollover.exit_rollover(&carol);
    assert_eq!(
        PtTokenClient::new(&env, &pt_n1_id).balance(&carol),
        carol_pt
    );
}
