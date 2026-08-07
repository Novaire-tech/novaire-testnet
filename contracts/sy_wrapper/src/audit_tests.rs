#![cfg(test)]

use super::*;
use soroban_sdk::{
    contract, contracttype, contractimpl,
    testutils::Address as _,
    token, Address, Env, Map,
};

// ==========================================
// MOCK BLEND POOL
// ==========================================
//
// Minimal stand-in for the real Blend Capital Pool contract, implementing just enough of
// its `submit` / `get_positions` surface (see the `BlendPool` trait and `Request` /
// `Positions` types in lib.rs) for sy_wrapper's integration to be exercised in tests: a
// single-asset, non-collateralized Supply/Withdraw ledger, keyed by the calling contract's
// address, with a test-only `simulate_yield` hook to model interest accruing on a
// supplied position (as real Blend interest accrual would, via a rising b_rate).

#[contracttype]
#[derive(Clone)]
enum PoolDataKey {
    Underlying,
    Supply(Address),
}

#[contract]
pub struct MockBlendPool;

#[contractimpl]
impl MockBlendPool {
    pub fn init(env: Env, underlying: Address) {
        env.storage().instance().set(&PoolDataKey::Underlying, &underlying);
    }

    pub fn submit(env: Env, from: Address, spender: Address, to: Address, requests: Vec<Request>) -> Positions {
        let underlying: Address = env.storage().instance().get(&PoolDataKey::Underlying).unwrap();
        let token_client = token::Client::new(&env, &underlying);
        let this = env.current_contract_address();

        let mut supply: i128 = env.storage().instance()
            .get(&PoolDataKey::Supply(from.clone()))
            .unwrap_or(0);

        for req in requests.iter() {
            if req.request_type == 0 {
                // Supply: pull underlying from `spender` (who must have approved this pool)
                // into the pool, and credit `from`'s tracked supply.
                token_client.transfer_from(&this, &spender, &this, &req.amount);
                supply += req.amount;
            } else if req.request_type == 1 {
                // Withdraw: pay `to` out of the pool's own balance, debiting `from`'s supply.
                let amt = if req.amount > supply { supply } else { req.amount };
                token_client.transfer(&this, &to, &amt);
                supply -= amt;
            }
        }

        env.storage().instance().set(&PoolDataKey::Supply(from), &supply);
        Self::positions_for(&env, supply)
    }

    pub fn get_positions(env: Env, address: Address) -> Positions {
        let supply: i128 = env.storage().instance()
            .get(&PoolDataKey::Supply(address))
            .unwrap_or(0);
        Self::positions_for(&env, supply)
    }

    /// Test-only: simulates interest accruing on `depositor`'s supplied position by
    /// crediting `extra` underlying units directly to their tracked supply. The caller is
    /// responsible for also minting the matching underlying into the pool's own balance
    /// (mirroring real Blend, where accrued interest is backed by borrower repayments)
    /// so a subsequent Withdraw can actually be paid out.
    pub fn simulate_yield(env: Env, depositor: Address, extra: i128) {
        let mut supply: i128 = env.storage().instance()
            .get(&PoolDataKey::Supply(depositor.clone()))
            .unwrap_or(0);
        supply += extra;
        env.storage().instance().set(&PoolDataKey::Supply(depositor), &supply);
    }

    fn positions_for(env: &Env, supply: i128) -> Positions {
        let mut supply_map = Map::new(env);
        if supply > 0 {
            // Reserve index is arbitrary here (see the `Positions` doc comment in lib.rs) -
            // sy_wrapper sums every entry rather than looking up a specific key.
            supply_map.set(1u32, supply);
        }
        Positions {
            collateral: Map::new(env),
            liabilities: Map::new(env),
            supply: supply_map,
        }
    }
}

// ==========================================
// MOCK YIELD VAULT FOR INTEGRATION
// ==========================================

#[contract]
pub struct MockYieldVault;

#[contractimpl]
impl MockYieldVault {
    pub fn deposit_into_sy(env: Env, sy: Address, user: Address, amount: i128) -> i128 {
        user.require_auth();
        let sy_client = SyWrapperClient::new(&env, &sy);
        sy_client.deposit(&user, &amount)
    }

    pub fn withdraw_from_sy(env: Env, sy: Address, user: Address, shares: i128) -> i128 {
        user.require_auth();
        let sy_client = SyWrapperClient::new(&env, &sy);
        sy_client.withdraw(&user, &shares)
    }
}

// ==========================================
// SETUP UTILITIES
// ==========================================

struct AuditSetup {
    env: Env,
    admin: Address,
    user1: Address,
    user2: Address,
    user3: Address,
    yield_source: Address,
    pool_client: MockBlendPoolClient<'static>,
    token_admin_client: token::StellarAssetClient<'static>,
    token_client: token::Client<'static>,
    token_contract: Address,
    contract_id: Address,
    client: SyWrapperClient<'static>,
    vault_id: Address,
}

fn setup() -> AuditSetup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_client = token::Client::new(&env, &token_contract);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_contract);

    let pool_id = env.register(MockBlendPool, ());
    let pool_client = MockBlendPoolClient::new(&env, &pool_id);
    pool_client.init(&token_contract);
    let yield_source = pool_id;

    let contract_id = env.register(SyWrapper, ());
    let client = SyWrapperClient::new(&env, &contract_id);
    client.initialize(&admin, &token_contract, &yield_source);

    let vault_id = env.register(MockYieldVault, ());

    AuditSetup {
        env,
        admin,
        user1,
        user2,
        user3,
        yield_source,
        pool_client,
        token_admin_client,
        token_client,
        token_contract,
        contract_id,
        client,
        vault_id,
    }
}

/// Simulates Blend lending yield accruing on the sy_wrapper's supplied position (see the
/// analogous helper in test.rs for details).
fn simulate_pool_yield(s: &AuditSetup, amount: i128) {
    s.token_admin_client.mint(&s.yield_source, &amount);
    s.pool_client.simulate_yield(&s.contract_id, &amount);
}

fn assert_invariant_total_shares_sum(s: &AuditSetup, u1_shares: i128, u2_shares: i128, u3_shares: i128) {
    let expected = u1_shares + u2_shares + u3_shares;
    assert_eq!(s.client.total_shares(), expected, "Invariant violation: total shares sum mismatch");
}

fn assert_invariant_rate_monotonicity(s: &AuditSetup, previous_rate: i128) {
    assert!(s.client.get_exchange_rate() >= previous_rate, "Invariant violation: rate decreased");
}

// ==========================================
// 1. PROTOCOL INVARIANTS & 2. MULTI-USER
// ==========================================

#[test]
fn test_invariant_accounting_across_complex_transitions() {
    let s = setup();
    
    // User 1 deposits 20k (1k locked) -> 19k shares
    s.token_admin_client.mint(&s.user1, &20_000);
    let u1_s1 = s.client.deposit(&s.user1, &20_000);
    assert_eq!(u1_s1, 19_000);
    assert_invariant_total_shares_sum(&s, u1_s1, 0, 1000); // 1000 dead shares

    // Yield accrues: 10% of 20k = 2k
    simulate_pool_yield(&s, 2_000);
    s.client.harvest_yield(); // Rate becomes 1.1
    
    // User 2 deposits 11k -> gets 10k shares (11k * 1 / 1.1)
    s.token_admin_client.mint(&s.user2, &11_000);
    let u2_s1 = s.client.deposit(&s.user2, &11_000);
    assert_eq!(u2_s1, 10_000); 
    assert_invariant_total_shares_sum(&s, u1_s1, u2_s1, 1000);

    // Yield accrues: 10% of 33k (20k + 2k + 11k) = 3.3k
    simulate_pool_yield(&s, 3_300);
    s.client.harvest_yield(); // Rate becomes 36.3k / 30k = 1.21
    
    // User 3 deposits 12.1k -> gets 10k shares (12.1k * 1 / 1.21)
    s.token_admin_client.mint(&s.user3, &12_100);
    let u3_s1 = s.client.deposit(&s.user3, &12_100);
    assert_eq!(u3_s1, 10_000);
    assert_invariant_total_shares_sum(&s, u1_s1, u2_s1, u3_s1 + 1000);

    // Withdrawals (Rate is 1.21)
    let u1_out = s.client.withdraw(&s.user1, &u1_s1);
    assert_eq!(u1_out, 22_990); // 19k shares * 1.21
    assert_invariant_total_shares_sum(&s, 0, u2_s1, u3_s1 + 1000);

    let u2_out = s.client.withdraw(&s.user2, &u2_s1);
    assert_eq!(u2_out, 12_100); // 10k shares * 1.21
    assert_invariant_total_shares_sum(&s, 0, 0, u3_s1 + 1000);

    let u3_out = s.client.withdraw(&s.user3, &u3_s1);
    assert_eq!(u3_out, 12_100);
    assert_invariant_total_shares_sum(&s, 0, 0, 1000);

    assert_eq!(s.client.total_shares(), 1000); // Only dead shares left
}

#[test]
fn test_invariants_during_back_to_back_deposits_withdraws() {
    let s = setup();
    s.token_admin_client.mint(&s.user1, &100_000);
    
    // Repeated cycle to check precision drift
    // First deposit must be > 1000
    let mut shares = 0;
    shares += s.client.deposit(&s.user1, &2_000); // 1000 user shares + 1000 dead
    for _ in 0..9 {
        shares += s.client.deposit(&s.user1, &1_000);
    }
    assert_eq!(shares, 10_000);
    assert_eq!(s.client.total_shares(), 11_000);

    let withdrawn = s.client.withdraw(&s.user1, &10_000);
    assert_eq!(withdrawn, 10_000);
    assert_eq!(s.client.total_shares(), 1000); // 1000 dead remain
}

// ==========================================
// 3. RANDOMIZED STRESS TESTS
// ==========================================

#[test]
fn test_stress_randomized_operations() {
    let s = setup();
    s.token_admin_client.mint(&s.user1, &1_000_000_000);

    let mut current_rate = 1_000_000_000;
    let mut u1_shares = 0;

    let operations = [
        ("deposit", 12345, 0), // min threshold cleared here
        ("yield", 0, 1000), // < 10% of 12345
        ("deposit", 999, 0),
        ("withdraw", 500, 0),
        ("deposit", 88888, 0),
        ("yield", 0, 8000), // < 10%
        ("withdraw", 1000, 0),
        ("yield", 0, 9000), // < 10%
        ("deposit", 1000, 0),
        ("withdraw", 10, 0),
    ];

    for (op, val, yield_val) in operations {
        if op == "deposit" {
            u1_shares += s.client.deposit(&s.user1, &val);
        } else if op == "withdraw" {
            let _out = s.client.withdraw(&s.user1, &val);
            u1_shares -= val;
        } else if op == "yield" {
            if yield_val > 0 {
                simulate_pool_yield(&s, yield_val);
            }
            s.client.harvest_yield();
        }

        let new_rate = s.client.get_exchange_rate();
        assert_invariant_rate_monotonicity(&s, current_rate);
        current_rate = new_rate;
    }

    assert_eq!(s.client.total_shares(), u1_shares + 1000); // user shares + dead shares
}

// ==========================================
// 4. MARK_LOSS / DUST / TINY / MAX / EMPTY-TREASURY EDGE CASES
// ==========================================

#[test]
fn test_mark_loss_no_loss_returns_zero() {
    let s = setup();
    s.token_admin_client.mint(&s.user1, &10_000);
    s.client.deposit(&s.user1, &10_000);

    // Actual pool balance still matches tracked total_underlying exactly.
    let loss = s.client.mark_loss();
    assert_eq!(loss, 0);
    assert_eq!(s.client.total_shares(), 9_000 + 1000);
}

#[test]
fn test_mark_loss_dust_loss() {
    let s = setup();
    s.token_admin_client.mint(&s.user1, &10_000);
    s.client.deposit(&s.user1, &10_000);

    // Simulate the pool losing a single unit of underlying (e.g. rounding dust).
    s.pool_client.simulate_yield(&s.contract_id, &-1);

    let loss = s.client.mark_loss();
    assert_eq!(loss, 1);
    // Repeating with no further drift reports no additional loss.
    assert_eq!(s.client.mark_loss(), 0);
}

#[test]
fn test_mark_loss_repeated_calls_are_idempotent_between_losses() {
    let s = setup();
    s.token_admin_client.mint(&s.user1, &100_000);
    s.client.deposit(&s.user1, &100_000);

    s.pool_client.simulate_yield(&s.contract_id, &-10_000);
    let loss1 = s.client.mark_loss();
    assert_eq!(loss1, 10_000);

    // Calling again immediately with no further balance drift must be a no-op.
    let loss2 = s.client.mark_loss();
    assert_eq!(loss2, 0);

    // A second, independent loss event is tracked correctly on top of the first.
    s.pool_client.simulate_yield(&s.contract_id, &-5_000);
    let loss3 = s.client.mark_loss();
    assert_eq!(loss3, 5_000);
}

#[test]
fn test_mark_loss_total_loss_to_zero_balance() {
    let s = setup();
    s.token_admin_client.mint(&s.user1, &10_000);
    s.client.deposit(&s.user1, &10_000);

    // Wipe out the entire pool position.
    s.pool_client.simulate_yield(&s.contract_id, &-10_000);

    let loss = s.client.mark_loss();
    assert_eq!(loss, 10_000);
    assert_eq!(s.client.get_exchange_rate(), 0);
}

#[test]
fn test_deposit_tiny_amount_above_minimum() {
    let s = setup();
    // Minimum first deposit is > 1000; 1001 is the smallest tiny amount that clears it.
    s.token_admin_client.mint(&s.user1, &1001);
    let shares = s.client.deposit(&s.user1, &1001);
    assert_eq!(shares, 1);
    assert_eq!(s.client.total_shares(), 1001);
}

#[test]
fn test_deposit_at_minimum_threshold_rejected() {
    let s = setup();
    s.token_admin_client.mint(&s.user1, &1000);
    let res = s.client.try_deposit(&s.user1, &1000);
    assert!(res.is_err());
}

#[test]
fn test_deposit_and_withdraw_max_value() {
    let s = setup();
    let max_amount: i128 = 1_000_000_000_000_000_000; // large but headroom for scaling math
    s.token_admin_client.mint(&s.user1, &max_amount);

    let shares = s.client.deposit(&s.user1, &max_amount);
    assert_eq!(shares, max_amount - 1000);

    let out = s.client.withdraw(&s.user1, &shares);
    assert_eq!(out, max_amount - 1000);
}

#[test]
fn test_withdraw_from_empty_treasury_fails() {
    let s = setup();
    // No deposits have ever been made: the contract holds no underlying at all.
    let res = s.client.try_withdraw(&s.user1, &1);
    assert!(res.is_err());
}

#[test]
fn test_withdraw_zero_shares_rejected() {
    let s = setup();
    s.token_admin_client.mint(&s.user1, &10_000);
    s.client.deposit(&s.user1, &10_000);

    let res = s.client.try_withdraw(&s.user1, &0);
    assert!(res.is_err());
}

#[test]
fn test_deposit_zero_amount_rejected() {
    let s = setup();
    let res = s.client.try_deposit(&s.user1, &0);
    assert!(res.is_err());
}

// ==========================================
// 5. ADVERSARIAL / DISHONEST YIELD-SOURCE SCENARIOS
// ==========================================
//
// `sy_wrapper` fully trusts the yield source's reported position value (see
// SECURITY.md "Known Risks" #1), bounded only by `refresh_rate`'s 10%-per-call
// increase ratchet and the fact that the recorded rate can never decrease on
// its own. These tests drive that trust boundary with a pool that lies about
// its reported supply independently of what it actually holds, to verify the
// ratchet is the real backstop it's documented to be.

/// A `MockBlendPool` variant whose `get_positions` reports an arbitrary,
/// directly-set supply that has no relationship to the real underlying the
/// pool actually holds — modeling a compromised or buggy external yield
/// source that misreports its position, honestly or maliciously.
///
/// Nested in its own module: `#[contractimpl]` generates fixed-name items
/// (e.g. `__submit`, `__get_positions`) at the enclosing module scope, which
/// collide with `MockBlendPool`'s own `submit`/`get_positions` if defined
/// side by side — the module boundary is what disambiguates them, since
/// `sy_wrapper`'s `BlendPoolClient` still invokes cross-contract calls by the
/// unqualified entrypoint name (`submit`, `get_positions`) regardless of
/// which Rust module the impl lives in.
mod dishonest_pool {
    use super::*;

    #[contract]
    pub struct DishonestBlendPool;

    #[contractimpl]
    impl DishonestBlendPool {
        pub fn set_reported_supply(env: Env, address: Address, supply: i128) {
            env.storage().instance().set(&PoolDataKey::Supply(address), &supply);
        }

        pub fn get_positions(env: Env, address: Address) -> Positions {
            let supply: i128 = env.storage().instance()
                .get(&PoolDataKey::Supply(address))
                .unwrap_or(0);
            let mut supply_map = Map::new(&env);
            if supply > 0 {
                supply_map.set(1u32, supply);
            }
            Positions {
                collateral: Map::new(&env),
                liabilities: Map::new(&env),
                supply: supply_map,
            }
        }

        // Only ever needs to accept the deposit's Supply request; a dishonest
        // pool doesn't need to model Withdraw for these tests since they
        // never withdraw.
        pub fn submit(env: Env, from: Address, spender: Address, _to: Address, requests: Vec<Request>) -> Positions {
            let underlying: Address = env.storage().instance().get(&PoolDataKey::Underlying).unwrap();
            let token_client = token::Client::new(&env, &underlying);
            let this = env.current_contract_address();
            for req in requests.iter() {
                if req.request_type == 0 {
                    token_client.transfer_from(&this, &spender, &this, &req.amount);
                }
            }
            Self::get_positions(env, from)
        }

        pub fn init(env: Env, underlying: Address) {
            env.storage().instance().set(&PoolDataKey::Underlying, &underlying);
        }
    }
}
use dishonest_pool::{DishonestBlendPool, DishonestBlendPoolClient};

fn setup_with_dishonest_pool() -> (AuditSetup, DishonestBlendPoolClient<'static>) {
    let mut s = setup();
    let dishonest_pool_id = s.env.register(DishonestBlendPool, ());
    let dishonest_client = DishonestBlendPoolClient::new(&s.env, &dishonest_pool_id);
    dishonest_client.init(&s.token_contract);

    // `YieldSource` is set once at `initialize` with no rotation function (see
    // SECURITY.md "Known Risks" #1), so exercising a dishonest source means
    // deploying a fresh sy_wrapper wired to it from the start rather than
    // swapping the pool under a live instance.
    let contract_id = s.env.register(SyWrapper, ());
    let client = SyWrapperClient::new(&s.env, &contract_id);
    client.initialize(&s.admin, &s.token_contract, &dishonest_pool_id);
    s.contract_id = contract_id;
    s.client = client;
    s.yield_source = dishonest_pool_id;
    (s, dishonest_client)
}

#[test]
fn test_dishonest_pool_inflated_report_clamped_to_ten_percent_ratchet() {
    // Real deposits establish an honest baseline.
    let (s, dishonest_pool) = setup_with_dishonest_pool();
    s.token_admin_client.mint(&s.user1, &10_000);
    s.client.deposit(&s.user1, &10_000);
    assert_eq!(s.client.get_exchange_rate(), 1_000_000_000);

    // A dishonest/compromised pool now reports 1000x the real position (9,000,000
    // instead of the real 9,000 actually supplied) — no matching underlying was
    // ever minted into the pool to back this. If sy_wrapper trusted this report
    // outright, the exchange rate would instantly jump 1000x.
    dishonest_pool.set_reported_supply(&s.contract_id, &9_000_000);

    let res = s.client.try_refresh_rate();
    assert!(res.is_ok(), "refresh_rate must clamp rather than revert (H5 fix)");

    // The rate-of-change ratchet must cap the increase at 10%, regardless of how
    // large the reported figure is.
    let new_rate = s.client.get_exchange_rate();
    assert_eq!(
        new_rate, 1_100_000_000,
        "a single dishonest report must never move the rate by more than 10%"
    );
}

#[test]
fn test_dishonest_pool_persistent_lying_still_bounded_per_call() {
    // Even if the dishonest pool keeps lying on every single call, repeated
    // `refresh_rate` calls can still only ratchet the rate up 10% per call —
    // there is no way to "catch up" to an inflated figure faster by calling
    // more often within the same ledger state.
    let (s, dishonest_pool) = setup_with_dishonest_pool();
    s.token_admin_client.mint(&s.user1, &10_000);
    s.client.deposit(&s.user1, &10_000);

    dishonest_pool.set_reported_supply(&s.contract_id, &100_000_000);

    let mut prev_rate = s.client.get_exchange_rate();
    for _ in 0..5 {
        s.client.refresh_rate();
        let rate = s.client.get_exchange_rate();
        assert!(rate <= prev_rate * 110 / 100, "rate grew more than 10% in a single call");
        assert!(rate >= prev_rate, "rate must be monotonic non-decreasing");
        prev_rate = rate;
    }
}

#[test]
fn test_dishonest_pool_underreport_does_not_decrease_rate() {
    // A dishonest pool that suddenly under-reports its position (e.g. to mask a
    // theft, or simply a buggy report) must not be able to silently haircut
    // everyone's exchange rate — only the admin-gated `mark_loss` can ever lower
    // `TotalUnderlying`. `refresh_rate` seeing a lower actual balance is a no-op.
    let (s, dishonest_pool) = setup_with_dishonest_pool();
    s.token_admin_client.mint(&s.user1, &10_000);
    s.client.deposit(&s.user1, &10_000);
    let rate_before = s.client.get_exchange_rate();

    dishonest_pool.set_reported_supply(&s.contract_id, &1);

    s.client.refresh_rate();
    assert_eq!(
        s.client.get_exchange_rate(),
        rate_before,
        "refresh_rate must never silently decrease the rate on an under-report"
    );

    // The honest recourse for a real loss remains available and admin-gated.
    let loss = s.client.mark_loss();
    assert!(loss > 0, "mark_loss is the only sanctioned path to record a real loss");
}
