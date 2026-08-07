#![cfg(test)]

use super::*;
use crate::audit_tests::{MockBlendPool, MockBlendPoolClient};
use soroban_sdk::{testutils::Address as _, token, Address, Env};

// --- Setup Helpers ---
struct Setup {
    env: Env,
    admin: Address,
    user1: Address,
    user2: Address,
    user3: Address,
    yield_source: Address,
    pool_client: MockBlendPoolClient<'static>,
    token_admin: Address,
    token_contract: Address,
    token_client: token::Client<'static>,
    token_admin_client: token::StellarAssetClient<'static>,
    contract_id: Address,
    client: SyWrapperClient<'static>,
}

fn setup_test() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_contract = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_client = token::Client::new(&env, &token_contract);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_contract);

    let pool_id = env.register(MockBlendPool, ());
    let pool_client = MockBlendPoolClient::new(&env, &pool_id);
    pool_client.init(&token_contract);
    let yield_source = pool_id;

    let contract_id = env.register(SyWrapper, ());
    let client = SyWrapperClient::new(&env, &contract_id);

    Setup {
        env,
        admin,
        user1,
        user2,
        user3,
        yield_source,
        pool_client,
        token_admin,
        token_contract,
        token_client,
        token_admin_client,
        contract_id,
        client,
    }
}

/// Simulates Blend lending yield accruing on the sy_wrapper's supplied position: mints
/// `amount` of underlying directly into the pool (representing interest paid by
/// borrowers) and credits it to the sy_wrapper's tracked supply so `get_positions` and
/// `refresh_rate` see it.
fn simulate_pool_yield(s: &Setup, amount: i128) {
    s.token_admin_client.mint(&s.yield_source, &amount);
    s.pool_client.simulate_yield(&s.contract_id, &amount);
}

// ==========================================
// 1. Initialization Tests
// ==========================================

#[test]
fn test_l2_underlying_asset_missing_storage_error() {
    let setup = setup_test();

    // Call try_underlying_asset() before initialization
    let res = setup.client.try_underlying_asset();
    assert_eq!(res, Err(Ok(NovaireSyError::StorageMissing)));

    // Initialize the contract
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);

    // Verify underlying_asset() still returns the expected Address
    assert_eq!(setup.client.underlying_asset(), setup.token_contract);
}
// ==========================================

#[test]
fn test_initialize_success() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);

    assert_eq!(setup.client.get_exchange_rate(), EXCHANGE_RATE_SCALAR);
    assert_eq!(setup.client.total_shares(), 0);
    assert_eq!(setup.client.underlying_asset(), setup.token_contract);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_initialize_fails_twice() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);
}

// ==========================================
// 2. Deposit Tests
// ==========================================

#[test]
fn test_normal_deposit() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);

    setup.token_admin_client.mint(&setup.user1, &2000);
    let shares = setup.client.deposit(&setup.user1, &2000);

    assert_eq!(shares, 1000);
    assert_eq!(setup.client.total_shares(), 2000);
    assert_eq!(setup.token_client.balance(&setup.user1), 0);
    // Deposited underlying is immediately supplied to the Blend pool, not held idle.
    assert_eq!(setup.token_client.balance(&setup.contract_id), 0);
    assert_eq!(setup.token_client.balance(&setup.yield_source), 2000);
}

#[test]
fn test_multiple_deposits() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);

    setup.token_admin_client.mint(&setup.user1, &3500);
    setup.client.deposit(&setup.user1, &2000);
    setup.client.deposit(&setup.user1, &1500);

    assert_eq!(setup.client.total_shares(), 3500);
    assert_eq!(setup.token_client.balance(&setup.contract_id), 0);
    assert_eq!(setup.token_client.balance(&setup.yield_source), 3500);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #4)")]
fn test_deposit_zero() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);
    setup.client.deposit(&setup.user1, &0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #13)")]
fn test_deposit_under_minimum() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);
    setup.client.deposit(&setup.user1, &1000);
}

#[test]
fn test_extremely_large_deposits() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);

    let large_amount = i128::MAX / 1_000_000_000 - 1; // max safe amount before overflow in unchecked mul
    setup.token_admin_client.mint(&setup.user1, &large_amount);

    let shares = setup.client.deposit(&setup.user1, &large_amount);
    assert_eq!(shares, large_amount - 1000);
}

// ==========================================
// 3. Withdraw Tests
// ==========================================

#[test]
fn test_partial_withdraw() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);

    setup.token_admin_client.mint(&setup.user1, &2000);
    setup.client.deposit(&setup.user1, &2000);

    let amount = setup.client.withdraw(&setup.user1, &400);
    assert_eq!(amount, 400);
    assert_eq!(setup.client.total_shares(), 1600);
    assert_eq!(setup.token_client.balance(&setup.user1), 400);
    assert_eq!(setup.token_client.balance(&setup.contract_id), 0);
    assert_eq!(setup.token_client.balance(&setup.yield_source), 1600);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #4)")]
fn test_withdraw_zero_shares() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);
    setup.client.withdraw(&setup.user1, &0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_withdraw_more_than_exists() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);

    setup.token_admin_client.mint(&setup.user1, &2000);
    setup.client.deposit(&setup.user1, &2000);

    setup.client.withdraw(&setup.user1, &2001);
}

// ==========================================
// 4. Real Yield Backing Tests
// ==========================================

#[test]
fn test_real_yield_backing() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);

    setup.token_admin_client.mint(&setup.user1, &2000);
    setup.client.deposit(&setup.user1, &2000);

    // Initial state
    assert_eq!(setup.client.get_exchange_rate(), 1_000_000_000);
    assert_eq!(setup.client.total_shares(), 2000);

    // Simulate real yield: interest accrues on the sy_wrapper's Blend pool position (10%)
    simulate_pool_yield(&setup, 200);

    // Call harvest yield
    setup.client.harvest_yield();

    // Exchange rate should be exactly 1.1e9
    assert_eq!(setup.client.get_exchange_rate(), 1_100_000_000);
    assert_eq!(setup.client.total_shares(), 2000);

    // Withdraw 1000 shares
    let amount = setup.client.withdraw(&setup.user1, &1000);

    // User gets 1100 underlying (1000 shares * 1.1 rate)
    assert_eq!(amount, 1100);
    assert_eq!(setup.client.total_shares(), 1000); // 1000 dead shares remain
    assert_eq!(setup.token_client.balance(&setup.user1), 1100);
}

#[test]
fn test_solvency_invariant_holds() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);

    setup.token_admin_client.mint(&setup.user1, &2000);
    setup.token_admin_client.mint(&setup.user2, &1000);

    setup.client.deposit(&setup.user1, &2000); // 1000 user shares + 1000 dead shares

    // Simulate yield: 200 underlying (10%) accrued in the Blend pool
    simulate_pool_yield(&setup, 200);
    setup.client.harvest_yield();
    assert_eq!(setup.client.get_exchange_rate(), 1_100_000_000);

    // User 2 deposits 1100 underlying at rate 1.1 -> gets 1000 shares
    setup.token_admin_client.mint(&setup.user2, &100);
    let user2_shares = setup.client.deposit(&setup.user2, &1100);
    assert_eq!(user2_shares, 1000);

    assert_eq!(setup.client.total_shares(), 3000);
    // All underlying (principal + accrued yield) is either idle in this contract or supplied
    // to the Blend pool. Total backing (idle + pool) should equal what shares are worth.
    let total_backing = setup.token_client.balance(&setup.contract_id)
        + setup.token_client.balance(&setup.yield_source);
    assert_eq!(total_backing, 3300);

    // Solvency Check: Total underlying should equal exactly what shares are worth
    let rate = setup.client.get_exchange_rate();
    let expected_underlying = setup.client.total_shares() * rate / EXCHANGE_RATE_SCALAR;
    assert_eq!(total_backing, expected_underlying);

    // Withdrawals
    assert_eq!(setup.client.withdraw(&setup.user1, &1000), 1100);
    assert_eq!(setup.client.withdraw(&setup.user2, &1000), 1100);

    assert_eq!(setup.client.total_shares(), 1000); // 1000 dead shares remain
    let remaining_backing = setup.token_client.balance(&setup.contract_id)
        + setup.token_client.balance(&setup.yield_source);
    assert_eq!(remaining_backing, 1100); // 1000 dead shares * 1.1 rate
}

#[test]
fn test_yield_cannot_increase_without_underlying_increasing() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);

    setup.token_admin_client.mint(&setup.user1, &2000);
    setup.client.deposit(&setup.user1, &2000);

    let initial_rate = setup.client.get_exchange_rate();

    // Call harvest yield but NO new underlying tokens are added
    setup.client.harvest_yield();

    // Rate MUST remain exactly the same
    assert_eq!(setup.client.get_exchange_rate(), initial_rate);
}

// ==========================================
// 5. Previews
// ==========================================

#[test]
fn test_previews() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);

    assert_eq!(setup.client.preview_deposit(&1000), 1000);
    assert_eq!(setup.client.preview_withdraw(&1000), 1000);

    setup.token_admin_client.mint(&setup.user1, &2000);
    setup.client.deposit(&setup.user1, &2000);

    // Simulate yield: 200 (10%) accrued in the Blend pool
    simulate_pool_yield(&setup, 200);
    setup.client.harvest_yield();
    // rate = 1.1e9

    // 1000 amount -> 1000 * 1e9 / 1.1e9 = 909 shares
    assert_eq!(setup.client.preview_deposit(&1000), 909);
    // 1000 shares -> 1000 * 1.1e9 / 1e9 = 1100 amount
    assert_eq!(setup.client.preview_withdraw(&1000), 1100);
}

// ==========================================
// 6. Security & Remediation Tests
// ==========================================

#[test]
fn test_harvest_yield_donation_clamp() {
    let setup = setup_test();
    setup
        .client
        .initialize(&setup.admin, &setup.token_contract, &setup.yield_source);

    // Initial deposit: 2000
    setup.token_admin_client.mint(&setup.user1, &2000);
    setup.client.deposit(&setup.user1, &2000);

    // Initial rate should be 1.0
    assert_eq!(setup.client.get_exchange_rate(), 1_000_000_000);

    // Unsolicited donation of 20% (400 tokens) accrued in the Blend pool
    simulate_pool_yield(&setup, 400);

    // Harvest yield. The internal actual balance is 2400 (a 20% increase).
    // The contract should clamp it to a 10% increase instead of reverting.
    setup.client.harvest_yield();

    // The exchange rate should be exactly 1.1 (10% increase)
    assert_eq!(setup.client.get_exchange_rate(), 1_100_000_000);

    // There are still 200 unclaimed tokens.
    // Call harvest_yield again. This time it will process up to 10% of the NEW rate.
    // 10% of 1.1 is 1.21. We only need it to go to 1.2.
    setup.client.harvest_yield();

    // Now the rate should be 1.2 (2400 / 2000)
    assert_eq!(setup.client.get_exchange_rate(), 1_200_000_000);
}
