#![cfg(test)]

use super::*;
use soroban_sdk::{
    contract, contractimpl, contracttype, testutils::Address as _, token, Address, Env, IntoVal,
    Map, TryFromVal,
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
    /// Tracked in bTokens (not underlying) - see `get_reserve`/`BRate` below.
    Supply(Address),
    /// The reserve's `b_rate`, `BLEND_RATE_SCALAR`-scaled. Defaults to
    /// `BLEND_RATE_SCALAR` (1:1) so untouched tests keep their original 1-bToken-per-
    /// underlying-unit behavior exactly.
    BRate,
}

#[contract]
pub struct MockBlendPool;

#[contractimpl]
impl MockBlendPool {
    pub fn init(env: Env, underlying: Address) {
        env.storage()
            .instance()
            .set(&PoolDataKey::Underlying, &underlying);
    }

    fn b_rate(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&PoolDataKey::BRate)
            .unwrap_or(BLEND_RATE_SCALAR)
    }

    /// Test-only: sets the reserve's `b_rate` directly, modeling real Blend interest
    /// accrual (bToken count unchanged, value-per-bToken rises) rather than injecting
    /// extra principal. This is the mechanism `get_reserve`/`pool_supplied_value` actually
    /// read from.
    pub fn set_b_rate(env: Env, new_rate: i128) {
        env.storage().instance().set(&PoolDataKey::BRate, &new_rate);
    }

    pub fn get_reserve(env: Env, asset: Address) -> Reserve {
        Reserve {
            asset,
            config: ReserveConfig {
                index: 0,
                decimals: 7,
                c_factor: 0,
                l_factor: 0,
                util: 0,
                max_util: 0,
                r_base: 0,
                r_one: 0,
                r_two: 0,
                r_three: 0,
                reactivity: 0,
                supply_cap: 0,
                enabled: true,
            },
            data: ReserveData {
                d_rate: Self::b_rate(&env),
                b_rate: Self::b_rate(&env),
                ir_mod: 0,
                b_supply: 0,
                d_supply: 0,
                backstop_credit: 0,
                last_time: env.ledger().timestamp(),
            },
            scalar: 10_000_000,
        }
    }

    pub fn submit(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: Vec<Request>,
    ) -> Positions {
        let underlying: Address = env
            .storage()
            .instance()
            .get(&PoolDataKey::Underlying)
            .unwrap();
        let token_client = token::Client::new(&env, &underlying);
        let this = env.current_contract_address();
        let b_rate = Self::b_rate(&env);

        let mut b_tokens: i128 = env
            .storage()
            .instance()
            .get(&PoolDataKey::Supply(from.clone()))
            .unwrap_or(0);

        for req in requests.iter() {
            if req.request_type == 0 {
                // Supply: pull underlying from `spender` (who must have approved this pool)
                // into the pool, and credit `from`'s tracked bToken balance, converting at
                // the current `b_rate` (floor), mirroring `Reserve::to_b_token` in real
                // Blend.
                token_client.transfer_from(&this, &spender, &this, &req.amount);
                // Fast path at the identity rate avoids an `amount * SCALAR_12`
                // intermediate that would overflow i128 for large-but-valid deposit
                // amounts; at 1:1 the conversion is exact and overflow-free anyway.
                let minted = if b_rate == BLEND_RATE_SCALAR {
                    req.amount
                } else {
                    req.amount * BLEND_RATE_SCALAR / b_rate
                };
                b_tokens += minted;
            } else if req.request_type == 1 {
                // Withdraw: `req.amount` is requested underlying; convert to bTokens
                // (ceil, mirroring `to_b_token_up`), clamp to the available balance, pay
                // out the corresponding underlying (floor, mirroring
                // `to_asset_from_b_token`).
                let requested_b_tokens = if b_rate == BLEND_RATE_SCALAR {
                    req.amount
                } else {
                    (req.amount * BLEND_RATE_SCALAR + b_rate - 1) / b_rate
                };
                let debited_b_tokens = if requested_b_tokens > b_tokens {
                    b_tokens
                } else {
                    requested_b_tokens
                };
                let underlying_out = if b_rate == BLEND_RATE_SCALAR {
                    debited_b_tokens
                } else {
                    debited_b_tokens * b_rate / BLEND_RATE_SCALAR
                };
                token_client.transfer(&this, &to, &underlying_out);
                b_tokens -= debited_b_tokens;
            }
        }

        env.storage()
            .instance()
            .set(&PoolDataKey::Supply(from), &b_tokens);
        Self::positions_for(&env, b_tokens)
    }

    pub fn get_positions(env: Env, address: Address) -> Positions {
        let b_tokens: i128 = env
            .storage()
            .instance()
            .get(&PoolDataKey::Supply(address))
            .unwrap_or(0);
        Self::positions_for(&env, b_tokens)
    }

    /// Test-only legacy/demo hook: directly injects `extra` bTokens into `depositor`'s
    /// tracked supply (i.e. adds principal), rather than raising `b_rate` (which is how
    /// real Blend accrues interest - see `set_b_rate`). Kept only for tests that
    /// pre-date `set_b_rate` and exercise the "extra principal appears" path
    /// specifically; new tests modeling real yield accrual should use `set_b_rate`
    /// instead. The caller is responsible for also minting the matching underlying into
    /// the pool's own balance so a subsequent Withdraw can actually be paid out.
    pub fn simulate_yield(env: Env, depositor: Address, extra: i128) {
        let mut supply: i128 = env
            .storage()
            .instance()
            .get(&PoolDataKey::Supply(depositor.clone()))
            .unwrap_or(0);
        supply += extra;
        env.storage()
            .instance()
            .set(&PoolDataKey::Supply(depositor), &supply);
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

#[allow(dead_code)]
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
    let token_contract = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();
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

fn assert_invariant_total_shares_sum(
    s: &AuditSetup,
    u1_shares: i128,
    u2_shares: i128,
    u3_shares: i128,
) {
    let expected = u1_shares + u2_shares + u3_shares;
    assert_eq!(
        s.client.total_shares(),
        expected,
        "Invariant violation: total shares sum mismatch"
    );
}

fn assert_invariant_rate_monotonicity(s: &AuditSetup, previous_rate: i128) {
    assert!(
        s.client.get_exchange_rate() >= previous_rate,
        "Invariant violation: rate decreased"
    );
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
        ("yield", 0, 1000),    // < 10% of 12345
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
fn test_mark_loss_is_permissionless() {
    // Phase 5: mark_loss only ever pushes TotalUnderlying toward a value read
    // straight from on-chain state, so no caller can lie through it. Anyone
    // should be able to call it, not just the admin.
    let s = setup();
    s.token_admin_client.mint(&s.user1, &10_000);
    s.client.deposit(&s.user1, &10_000);

    s.pool_client.simulate_yield(&s.contract_id, &-1_000);

    // No auths mocked at all for this call - proves it needs no signature.
    s.env.set_auths(&[]);
    let loss = s.client.mark_loss();
    assert_eq!(loss, 1_000);
}

#[test]
fn test_loss01_withdraw_realizes_loss_without_manual_mark_loss() {
    // LOSS-01 regression: deposit, simulate a 20% Blend-pool loss, then withdraw
    // WITHOUT ever calling `mark_loss()` manually. Pre-fix, `withdraw()` read the
    // exchange rate from the stale (pre-loss) `TotalUnderlying`, so the first
    // withdrawer would be paid out at the inflated pre-loss rate - overpaying
    // relative to what's actually recoverable and leaving later withdrawers to
    // eat the shortfall. Post-fix, `withdraw()` realizes the loss atomically
    // (via the same internal logic `mark_loss` uses) before computing payout, so
    // the payout reflects real, current backing.
    let s = setup();
    s.token_admin_client.mint(&s.user1, &100_000);
    let shares = s.client.deposit(&s.user1, &100_000);

    // Simulate a 20% loss in the Blend pool (e.g. bad debt/slashing) - nobody
    // calls `mark_loss()` afterward.
    let pool_balance_before = s.token_client.balance(&s.yield_source);
    let loss_amount = pool_balance_before * 20 / 100;
    s.pool_client.simulate_yield(&s.contract_id, &-loss_amount);

    // The true, current recoverable backing for ALL shares (deposit minus the
    // realized loss, minus the 1000-unit locked minimum).
    let total_underlying_ground_truth = 100_000 - loss_amount;

    let payout = s.client.withdraw(&s.user1, &shares);

    // Payout must reflect the POST-loss backing, not the stale, pre-loss
    // 100_000 total. Pre-fix this assertion fails because withdraw() pays out
    // against the untouched stale rate (effectively ~100_000 worth), draining
    // more than the pool actually has left and starving anyone who withdraws
    // after user1.
    assert!(
        payout <= total_underlying_ground_truth,
        "withdraw paid out {} against only {} of real recoverable backing - stale rate was used",
        payout,
        total_underlying_ground_truth
    );

    // The loss must have been realized as a side effect of withdraw() itself:
    // a subsequent standalone mark_loss() call (on the remaining position) sees
    // no further loss to record for this same drop.
    let residual_loss = s.client.mark_loss();
    assert_eq!(
        residual_loss, 0,
        "withdraw() should have already realized the loss; mark_loss() found more, meaning \
         withdraw's payout was computed against a stale rate"
    );
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
            env.storage()
                .instance()
                .set(&PoolDataKey::Supply(address), &supply);
        }

        pub fn get_positions(env: Env, address: Address) -> Positions {
            let supply: i128 = env
                .storage()
                .instance()
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
        pub fn submit(
            env: Env,
            from: Address,
            spender: Address,
            _to: Address,
            requests: Vec<Request>,
        ) -> Positions {
            let underlying: Address = env
                .storage()
                .instance()
                .get(&PoolDataKey::Underlying)
                .unwrap();
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
            env.storage()
                .instance()
                .set(&PoolDataKey::Underlying, &underlying);
        }

        /// Identity rate: these tests model a pool that misreports `supply`
        /// directly, not one with a dishonest `b_rate`, so `get_reserve` reports
        /// straightforwardly (1 bToken == 1 underlying) and all the deception is
        /// in `set_reported_supply`/`get_positions` above.
        pub fn get_reserve(env: Env, asset: Address) -> Reserve {
            Reserve {
                asset,
                config: ReserveConfig {
                    index: 0,
                    decimals: 7,
                    c_factor: 0,
                    l_factor: 0,
                    util: 0,
                    max_util: 0,
                    r_base: 0,
                    r_one: 0,
                    r_two: 0,
                    r_three: 0,
                    reactivity: 0,
                    supply_cap: 0,
                    enabled: true,
                },
                data: ReserveData {
                    d_rate: BLEND_RATE_SCALAR,
                    b_rate: BLEND_RATE_SCALAR,
                    ir_mod: 0,
                    b_supply: 0,
                    d_supply: 0,
                    backstop_credit: 0,
                    last_time: env.ledger().timestamp(),
                },
                scalar: 10_000_000,
            }
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
    assert!(
        res.is_ok(),
        "refresh_rate must clamp rather than revert (H5 fix)"
    );

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
        assert!(
            rate <= prev_rate * 110 / 100,
            "rate grew more than 10% in a single call"
        );
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
    assert!(
        loss > 0,
        "mark_loss is the only sanctioned path to record a real loss"
    );
}

#[test]
fn test_reserve_type_xdr_roundtrip() {
    let env = Env::default();
    let asset = Address::generate(&env);
    let reserve = Reserve {
        asset: asset.clone(),
        config: ReserveConfig {
            index: 0,
            decimals: 7,
            c_factor: 9_000_000,
            l_factor: 9_000_000,
            util: 8_000_000,
            max_util: 9_500_000,
            r_base: 100_000,
            r_one: 500_000,
            r_two: 1_500_000,
            r_three: 10_000_000,
            reactivity: 2_000,
            supply_cap: 1_000_000_000_000_000,
            enabled: true,
        },
        data: ReserveData {
            d_rate: 1_050_000_000_000,
            b_rate: 1_020_000_000_000,
            ir_mod: 1_000_000,
            b_supply: 5_000_000_000_000,
            d_supply: 3_000_000_000_000,
            backstop_credit: 10_000_000_000,
            last_time: 123_456_789,
        },
        scalar: 10_000_000,
    };

    let val: soroban_sdk::Val = reserve.clone().into_val(&env);
    let decoded: Reserve = Reserve::try_from_val(&env, &val).unwrap();
    assert_eq!(decoded, reserve);
    assert_eq!(decoded.data.b_rate, 1_020_000_000_000);
}

// ==========================================
// STAGE 7 REGRESSION SUITE — b_rate accounting
// ==========================================
//
// These exercise `pool_supplied_value`'s real bToken * b_rate / BLEND_RATE_SCALAR
// conversion (Stage 4) end-to-end through `MockBlendPool::set_b_rate`, distinct from the
// legacy `simulate_yield` principal-injection hook (see its doc comment above, and
// Stage 8's disposition of `scripts/inject_yield.ts`).

/// Scenario 1: a supply with no rate movement at all should leave the exchange rate
/// exactly unchanged across a `harvest_yield` call - `refresh_rate` must not manufacture
/// yield out of nothing.
#[test]
fn test_regression_supply_then_harvest_rate_unchanged() {
    let s = setup();
    s.token_admin_client.mint(&s.user1, &2000);
    s.client.deposit(&s.user1, &2000);

    assert_eq!(s.client.get_exchange_rate(), 1_000_000_000);
    s.client.harvest_yield();
    assert_eq!(s.client.get_exchange_rate(), 1_000_000_000);
}

/// Scenario 2: raising only the reserve's `b_rate` (no change in bToken count, no extra
/// principal deposited) must raise the exchange rate proportionally after harvest - this
/// is the real Blend interest-accrual path Stage 4 fixed `pool_supplied_value` to honor.
#[test]
fn test_regression_b_rate_increase_raises_exchange_rate() {
    let s = setup();
    s.token_admin_client.mint(&s.user1, &2000);
    s.client.deposit(&s.user1, &2000);
    assert_eq!(s.client.get_exchange_rate(), 1_000_000_000);

    // 10% b_rate increase. Real Blend backs this with borrower interest repayments
    // actually held by the pool; mirror that here by minting the matching extra
    // underlying into the pool so a subsequent withdraw can be paid out.
    let new_b_rate = BLEND_RATE_SCALAR * 110 / 100;
    s.pool_client.set_b_rate(&new_b_rate);
    s.token_admin_client.mint(&s.yield_source, &200);

    s.client.harvest_yield();
    assert_eq!(s.client.get_exchange_rate(), 1_100_000_000);
}

/// Scenario 3: with zero token injection into the SY wrapper's own idle balance, a
/// `b_rate`-only increase must still flow through to a larger payout on withdrawal -
/// confirming the yield is real and redeemable, not just a reported number.
#[test]
fn test_regression_b_rate_only_yield_increases_withdrawal() {
    let s = setup();
    s.token_admin_client.mint(&s.user1, &2000);
    s.client.deposit(&s.user1, &2000);

    let new_b_rate = BLEND_RATE_SCALAR * 105 / 100;
    s.pool_client.set_b_rate(&new_b_rate);
    s.token_admin_client.mint(&s.yield_source, &100);
    s.client.harvest_yield();

    let shares = s.client.total_shares();
    let payout = s.client.withdraw(&s.user1, &shares);
    assert!(
        payout > 2000,
        "b_rate-only yield must be redeemable: got {}",
        payout
    );
    assert_eq!(payout, 2100);
}

/// Scenario 4: the legacy `simulate_yield` principal-injection hook is never called in
/// this test - all yield here flows exclusively through real `get_reserve`/`b_rate`
/// accounting, confirming that path alone is sufficient for deposits, accrual, and
/// withdrawal without the demo/legacy mechanism.
#[test]
fn test_regression_real_accounting_works_without_injected_tokens() {
    let s = setup();
    s.token_admin_client.mint(&s.user1, &2000);
    s.token_admin_client.mint(&s.user2, &1100);

    s.client.deposit(&s.user1, &2000);
    // Note: `refresh_rate` clamps any single accrual to a max 10% rate increase (see H5
    // in lib.rs), so a 20% `b_rate` jump is intentionally only half-realized per harvest.
    let new_b_rate = BLEND_RATE_SCALAR * 120 / 100;
    s.pool_client.set_b_rate(&new_b_rate);
    s.token_admin_client.mint(&s.yield_source, &400);
    s.client.harvest_yield();

    assert_eq!(s.client.get_exchange_rate(), 1_100_000_000);

    // A second depositor coming in after the rate has moved must be priced fairly at the
    // freshest rate (Stage 5's deposit-freshness fix), not against a stale one. `deposit`
    // itself calls `refresh_rate` before pricing, which here catches the remainder of the
    // 20% `b_rate` jump the first `harvest_yield` call had only partially ratcheted in
    // (bounded to +10%/call) - true backing is now worth 1.2x, so user2's shares are
    // priced at 1.2e9, not the 1.1e9 snapshot from the earlier harvest.
    let shares_before = s.client.total_shares();
    s.client.deposit(&s.user2, &1100);
    let user2_shares = s.client.total_shares() - shares_before;
    assert_eq!(user2_shares, 916); // floor(1100e9 / 1.2e9)
}

/// Scenario 5: large balances combined with a real rate change must not overflow the
/// checked arithmetic in `pool_supplied_value`/`refresh_rate`.
#[test]
fn test_regression_large_balances_no_overflow() {
    let s = setup();
    let large_amount: i128 = 1_000_000_000_000_000; // 1e15 underlying units
    s.token_admin_client.mint(&s.user1, &large_amount);
    s.client.deposit(&s.user1, &large_amount);

    let new_b_rate = BLEND_RATE_SCALAR * 110 / 100;
    s.pool_client.set_b_rate(&new_b_rate);
    s.token_admin_client
        .mint(&s.yield_source, &(large_amount / 10));

    s.client.harvest_yield();
    let rate = s.client.get_exchange_rate();
    assert_eq!(rate, 1_100_000_000);

    let shares = s.client.total_shares();
    let payout = s.client.withdraw(&s.user1, &shares);
    assert_eq!(payout, large_amount + large_amount / 10);
}

/// Scenario 6: a reserve with zero supplied position (no deposits yet) must be handled
/// gracefully - `pool_supplied_value` should short-circuit to 0 without even attempting a
/// `get_reserve` call, so `harvest_yield`/`get_exchange_rate` work fine on a fresh
/// contract before any deposit has happened.
#[test]
fn test_regression_zero_reserve_graceful_handling() {
    let s = setup();
    assert_eq!(s.client.total_shares(), 0);
    assert_eq!(s.client.get_exchange_rate(), 1_000_000_000);

    // Must not panic even though no Supply request has ever been submitted to the pool,
    // i.e. the pool has no reserve data configured for this asset at all.
    s.client.harvest_yield();
    assert_eq!(s.client.get_exchange_rate(), 1_000_000_000);
}
