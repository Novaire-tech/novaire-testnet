//! End-to-End Lifecycle Scenarios — realistic user journeys across contracts.

use crate::framework::{Protocol, SCALE, MATURITY_LEDGER};
use crate::invariants::InvariantEngine;

// ── Scenario 1: Simple deposit ────────────────────────────────────────────────
#[test]
fn scenario_simple_deposit() {
    let protocol = Protocol::new();
    let user = protocol.create_user();
    protocol.mint_mock_usdc(&user, 100_000);
    protocol.deposit(&user, 50_000);
    InvariantEngine::assert_everything(&protocol);
}

// ── Scenario 2: Mint PT/YT ────────────────────────────────────────────────────
#[test]
fn scenario_mint_pt_yt() {
    let protocol = Protocol::new();
    let user = protocol.create_user();
    protocol.mint_mock_usdc(&user, 100_000);
    protocol.deposit(&user, 50_000);
    protocol.mint_pt_yt(&user, 30_000);
    InvariantEngine::assert_everything(&protocol);
}

// ── Scenario 3: Full lifecycle — deposit → mint → trade → redeem ──────────────
#[test]
fn scenario_full_lifecycle() {
    let protocol = Protocol::new();

    // Bootstrap marketplace
    let lp = protocol.create_user();
    protocol.bootstrap_marketplace(&lp);
    protocol.advance_ledger(1);

    // User A: long PT (fixed yield)
    let user_a = protocol.create_user();
    protocol.mint_mock_usdc(&user_a, 500_000_000);
    protocol.deposit(&user_a, 300_000_000);
    protocol.mint_pt_yt(&user_a, 200_000_000);
    InvariantEngine::assert_everything(&protocol);

    // User A swaps some underlying for more PT
    protocol.mint_mock_usdc(&user_a, 10_000_000);
    protocol.try_swap_u_for_pt(&user_a, 10_000_000);
    InvariantEngine::assert_everything(&protocol);

    // User B: yield speculation
    let user_b = protocol.create_user();
    protocol.mint_mock_usdc(&user_b, 100_000_000);
    protocol.execute_yield_speculation_intent(&user_b, 50_000_000, 1);
    InvariantEngine::assert_everything(&protocol);

    // Advance 20% through epoch
    protocol.advance_ledger(MATURITY_LEDGER / 5);

    // Claim yield
    protocol.try_claim_yield(&user_a);
    InvariantEngine::assert_everything(&protocol);

    // Advance to maturity
    protocol.set_ledger(MATURITY_LEDGER + 1);
    protocol.settle_epoch();

    // Redeem PT
    let pt_bal = protocol.pt_token.balance(&user_a);
    if pt_bal > 0 {
        let redeemed = protocol.redeem_pt(&user_a, pt_bal);
        assert!(redeemed > 0, "Full lifecycle: PT redemption must return underlying");
    }

    InvariantEngine::assert_everything(&protocol);
    println!("  ✅ Full lifecycle scenario complete");
}

// ── Scenario 4: Rollover registration and custody check ───────────────────────
#[test]
fn scenario_rollover_custody() {
    let protocol = Protocol::new();

    // Setup: user mints PT then registers rollover
    let user = protocol.create_user();
    protocol.mint_mock_usdc(&user, 50_000_000);
    protocol.deposit(&user, 50_000_000);
    protocol.mint_pt_yt(&user, 30_000_000);

    let pt_bal = protocol.pt_token.balance(&user);
    assert!(pt_bal > 0, "Rollover scenario: user must have PT");

    // Register rollover
    let rollover_amt = pt_bal / 2;
    protocol.register_rollover(&user, rollover_amt, 100, 0);

    // INV-9: Rollover contract PT custody
    let actual_pt  = protocol.pt_token.balance(&protocol.rollover.address);
    assert!(actual_pt > 0,
        "Rollover custody: actual PT must be > 0");

    InvariantEngine::assert_everything(&protocol);

    // Exit rollover
    protocol.exit_rollover(&user);
    let actual_pt_after  = protocol.pt_token.balance(&protocol.rollover.address);
    assert_eq!(actual_pt_after, 0,
        "Post-exit custody mismatch: actual={actual_pt_after}");

    InvariantEngine::assert_everything(&protocol);
    println!("  ✅ Rollover custody scenario complete");
}

// ── Scenario 5: PT converges toward face value near maturity ──────────────────
#[test]
fn scenario_pt_converges_near_maturity() {
    let protocol = Protocol::new();
    let lp = protocol.create_user();
    protocol.bootstrap_marketplace(&lp);

    // At 10% of epoch (early)
    protocol.advance_ledger(MATURITY_LEDGER / 10);
    let spot_early = protocol.get_pt_price();

    // At 90% of epoch (near maturity)
    protocol.set_ledger(MATURITY_LEDGER - MATURITY_LEDGER / 10);
    let spot_late = protocol.get_pt_price();

    // Near-maturity price must be closer to SCALE than early price
    let dist_early = (SCALE - spot_early).abs();
    let dist_late  = (SCALE - spot_late).abs();
    assert!(
        dist_late <= dist_early,
        "PT convergence: early dist={dist_early}, late dist={dist_late} — not converging!"
    );
    assert!(spot_late > 0 && spot_late <= SCALE);
    println!("  ✅ PT converges toward face value: early={spot_early}, late={spot_late}");
}

// ── Scenario 6: Multi-user PT==YT conservation throughout operations ──────────
#[test]
fn scenario_pt_yt_conservation_multi_user() {
    let protocol = Protocol::new();
    let users: Vec<_> = (0..5).map(|_| {
        let u = protocol.create_user();
        protocol.mint_mock_usdc(&u, 50_000_000);
        protocol.deposit(&u, 40_000_000);
        u
    }).collect();

    // Each user mints a different amount
    for (i, u) in users.iter().enumerate() {
        let mint_amt = 5_000_000 + i as i128 * 1_000_000;
        protocol.mint_pt_yt(u, mint_amt);
        // Immediately verify PT==YT
        let state = protocol.tokenizer.get_epoch_state();
        if state == 1 {
            let pt_supply = protocol.pt_token.total_supply();
            let yt_supply = protocol.yt_token.total_supply();
            assert_eq!(pt_supply, yt_supply,
                "PT/YT mismatch after user {i} mint: pt={pt_supply}, yt={yt_supply}");
        }
    }
    InvariantEngine::assert_everything(&protocol);
    println!("  ✅ PT==YT conservation holds for all 5 users");
}

// ── Scenario 7: Intent Engine zero-balance guarantee ─────────────────────────
#[test]
fn scenario_intent_engine_zero_balance() {
    let protocol = Protocol::new();
    let lp = protocol.create_user();
    protocol.bootstrap_marketplace(&lp);
    protocol.advance_ledger(1);

    let user = protocol.create_user();
    protocol.mint_mock_usdc(&user, 200_000_000);

    // Fixed yield intent
    protocol.execute_fixed_yield_intent(&user, 50_000_000, 1, 100);
    // Check IE has zero balance
    let pt_held  = protocol.pt_token.balance(&protocol.intent_engine.address);
    let yt_held  = protocol.yt_token.balance(&protocol.intent_engine.address);
    let und_held = protocol.underlying_token.balance(&protocol.intent_engine.address);
    assert_eq!(pt_held,  0, "IE holds PT={pt_held} after fixed yield intent");
    assert_eq!(yt_held,  0, "IE holds YT={yt_held} after fixed yield intent");
    assert_eq!(und_held, 0, "IE holds underlying={und_held} after fixed yield intent");

    // Yield speculation intent
    protocol.execute_yield_speculation_intent(&user, 50_000_000, 1);
    let pt_held2  = protocol.pt_token.balance(&protocol.intent_engine.address);
    let yt_held2  = protocol.yt_token.balance(&protocol.intent_engine.address);
    let und_held2 = protocol.underlying_token.balance(&protocol.intent_engine.address);
    assert_eq!(pt_held2,  0, "IE holds PT={pt_held2} after speculation intent");
    assert_eq!(yt_held2,  0, "IE holds YT={yt_held2} after speculation intent");
    assert_eq!(und_held2, 0, "IE holds underlying={und_held2} after speculation intent");

    InvariantEngine::assert_everything(&protocol);
    println!("  ✅ Intent Engine zero-balance guarantee holds for both intent types");
}

// ── Scenario 7: Forced Rollover Slippage Protection ───────────────────────
#[test]
fn scenario_forced_rollover_slippage_protection() {
    let protocol = Protocol::new();

    let user = protocol.create_user();
    protocol.mint_mock_usdc(&user, 50_000_000);
    protocol.deposit(&user, 50_000_000);
    protocol.mint_pt_yt(&user, 30_000_000);

    let pt_bal = protocol.pt_token.balance(&user);
    assert!(pt_bal > 0, "User must have PT");

    // Register rollover with an impossibly high min_underlying_out (5M USDC output expected from ~30M PT, which is ~3M USDC max)
    let impossible_min_out = 5_000_000_000_000;
    protocol.register_rollover(&user, pt_bal, 100, impossible_min_out);

    // Fast forward to next epoch maturity
    protocol.advance_ledger(1000);

    // Attempt to execute rollover; this should FAIL due to slippage
    let result = protocol.rollover.try_execute_rollover(&user);
    assert!(result.is_err(), "Rollover should fail when minimum output requirement cannot be met");
    println!("  ✅ Forced Rollover slippage protection scenario complete");
}

// ── Scenario 8: H4 Fix - Yield is not transferred upon YT Transfer ────────────
#[test]
fn scenario_h4_yt_yield_transfer() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    let bob = protocol.create_user();

    // 1. Alice deposits and mints
    protocol.mint_mock_usdc(&alice, 100_000);
    protocol.deposit(&alice, 100_000);
    protocol.mint_pt_yt(&alice, 50_000);

    // Initial yield should be 0
    let alice_yield_init = protocol.yt_token.claimable_yield(&alice);
    assert_eq!(alice_yield_init, 0);

    // 2. Protocol accrues yield (e.g. 10% on the 100k)
    protocol.generate_yield(10_000); // 10k yield

    // Alice should now have 5k yield claimable (she owns 50k out of 100k SY)
    let alice_yield_mid = protocol.yt_token.claimable_yield(&alice);
    assert!(alice_yield_mid > 0);
    assert_eq!(alice_yield_mid, 5_000);

    // 3. Alice transfers all YT to Bob
    let alice_yt = protocol.yt_token.balance(&alice);
    protocol.yt_token.transfer(&alice, &bob, &alice_yt);

    // 4. Bob should NOT receive Alice's accrued yield!
    // Since transfer forces an index update, Alice's accrued yield gets locked to her,
    // and Bob starts at the new index.
    let bob_yield_after_transfer = protocol.yt_token.claimable_yield(&bob);
    assert_eq!(bob_yield_after_transfer, 0, "Bob should not receive yield accrued before the transfer");

    let alice_yield_after_transfer = protocol.yt_token.claimable_yield(&alice);
    assert_eq!(alice_yield_after_transfer, alice_yield_mid, "Alice must retain her accrued yield");

    // 5. Claim the yield to prove it
    let alice_balance_before = protocol.underlying_token.balance(&alice);
    protocol.claim_yield(&alice);
    let alice_balance_after = protocol.underlying_token.balance(&alice);
    let diff = ((alice_balance_after - alice_balance_before) - alice_yield_mid).abs();
    assert!(diff <= 1, "Yield claimed should match expected within 1 unit of rounding");
    println!("  ✅ H4 YT yield misassignment scenario complete");
}

// ── Regression Test 1: Partial Transfer ────────────
#[test]
fn scenario_h4_partial_transfer() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    let bob = protocol.create_user();

    protocol.mint_mock_usdc(&alice, 100_000);
    let sy_shares = protocol.deposit(&alice, 100_000);
    protocol.mint_pt_yt(&alice, sy_shares);

    protocol.generate_yield(10_000);

    let alice_yield_mid = protocol.yt_token.claimable_yield(&alice);
    
    protocol.yt_token.transfer(&alice, &bob, &30_000);

    let bob_yield = protocol.yt_token.claimable_yield(&bob);
    assert_eq!(bob_yield, 0, "Bob should not receive Alice's historical yield");

    let alice_yield_after = protocol.yt_token.claimable_yield(&alice);
    assert_eq!(alice_yield_after, alice_yield_mid, "Alice retains accrued yield on entire position prior to transfer");
    
    let alice_balance_before = protocol.underlying_token.balance(&alice);
    protocol.claim_yield(&alice);
    let alice_balance_after = protocol.underlying_token.balance(&alice);
    let diff = ((alice_balance_after - alice_balance_before) - alice_yield_mid).abs();
    assert!(diff <= 1);
    
    let bob_res = protocol.tokenizer.try_claim_yield(&bob);
    assert!(bob_res.is_err(), "Claim should revert since yield is 0");
}

// ── Regression Test 2: transfer_from ────────────
#[test]
fn scenario_h4_transfer_from() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    let bob = protocol.create_user();
    let charlie = protocol.create_user();

    protocol.mint_mock_usdc(&alice, 100_000);
    let sy_shares = protocol.deposit(&alice, 100_000);
    protocol.mint_pt_yt(&alice, sy_shares);

    protocol.generate_yield(10_000);
    let alice_yield_mid = protocol.yt_token.claimable_yield(&alice);

    protocol.yt_token.approve(&alice, &charlie, &sy_shares, &2000000);
    protocol.yt_token.transfer_from(&charlie, &alice, &bob, &sy_shares);

    let bob_yield = protocol.yt_token.claimable_yield(&bob);
    assert_eq!(bob_yield, 0, "Bob should not receive yield accrued before ownership transfer");

    let alice_yield_after = protocol.yt_token.claimable_yield(&alice);
    assert_eq!(alice_yield_after, alice_yield_mid, "Alice retains yield even after delegated transfer");
}

// ── Regression Test 3: Multiple Sequential Transfers ────────────
#[test]
fn scenario_h4_multiple_sequential_transfers() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    let bob = protocol.create_user();
    let charlie = protocol.create_user();

    protocol.mint_mock_usdc(&alice, 100_000);
    let sy_shares = protocol.deposit(&alice, 100_000);
    protocol.mint_pt_yt(&alice, sy_shares);

    protocol.generate_yield(10_000);
    let yield_1 = protocol.yt_token.claimable_yield(&alice);

    protocol.yt_token.transfer(&alice, &bob, &sy_shares);

    protocol.generate_yield(10_000);
    let yield_2 = protocol.yt_token.claimable_yield(&bob);

    protocol.yt_token.transfer(&bob, &charlie, &sy_shares);

    protocol.generate_yield(10_000);
    let yield_3 = protocol.yt_token.claimable_yield(&charlie);

    let a_bal_b = protocol.underlying_token.balance(&alice);
    protocol.claim_yield(&alice);
    let a_bal_a = protocol.underlying_token.balance(&alice);
    assert!(((a_bal_a - a_bal_b) - yield_1).abs() <= 1);

    let b_bal_b = protocol.underlying_token.balance(&bob);
    protocol.claim_yield(&bob);
    let b_bal_a = protocol.underlying_token.balance(&bob);
    assert!(((b_bal_a - b_bal_b) - yield_2).abs() <= 1);

    let c_bal_b = protocol.underlying_token.balance(&charlie);
    protocol.claim_yield(&charlie);
    let c_bal_a = protocol.underlying_token.balance(&charlie);
    assert!(((c_bal_a - c_bal_b) - yield_3).abs() <= 1);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn scenario_h4_set_sy_wrapper_auth_rejection() {
    use soroban_sdk::{Env, Address, IntoVal};
    use soroban_sdk::testutils::Address as _;
    
    let env = Env::default();
    let admin = Address::generate(&env);
    let old_sy = Address::generate(&env);
    let new_sy = Address::generate(&env);
    let tokenizer = Address::generate(&env);
    
    let yt_token_addr = env.register(yt_token::YtToken, ());
    let yt_token_client = yt_token::YtTokenClient::new(&env, &yt_token_addr);

    env.mock_auths(&[
        soroban_sdk::testutils::MockAuth {
            address: &admin,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &yt_token_addr,
                fn_name: "initialize",
                args: (&admin, &tokenizer, &1_000u32, &old_sy).into_val(&env),
                sub_invokes: &[],
            },
        }
    ]);
    yt_token_client.initialize(&admin, &tokenizer, &1_000, &old_sy);
    
    // Calling it without mock_auth should panic the test thread
    yt_token_client.set_sy_wrapper(&new_sy);
}

#[test]
fn scenario_h4_set_sy_wrapper_auth_success() {
    use soroban_sdk::{Env, Address, IntoVal};
    use soroban_sdk::testutils::Address as _;
    
    let env = Env::default();
    let admin = Address::generate(&env);
    let old_sy = Address::generate(&env);
    let new_sy = Address::generate(&env);
    let tokenizer = Address::generate(&env);
    
    let yt_token_addr = env.register(yt_token::YtToken, ());
    let yt_token_client = yt_token::YtTokenClient::new(&env, &yt_token_addr);

    env.mock_auths(&[
        soroban_sdk::testutils::MockAuth {
            address: &admin,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &yt_token_addr,
                fn_name: "initialize",
                args: (&admin, &tokenizer, &1_000u32, &old_sy).into_val(&env),
                sub_invokes: &[],
            },
        }
    ]);
    yt_token_client.initialize(&admin, &tokenizer, &1_000, &old_sy);
    
    env.mock_auths(&[
        soroban_sdk::testutils::MockAuth {
            address: &admin,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &yt_token_addr,
                fn_name: "set_sy_wrapper",
                args: (&new_sy,).into_val(&env),
                sub_invokes: &[],
            },
        }
    ]);
    
    yt_token_client.set_sy_wrapper(&new_sy);
}

// ── Regression Test 5: Long Idle Period ────────────
#[test]
fn scenario_h4_long_idle_period() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    let bob = protocol.create_user();

    protocol.mint_mock_usdc(&alice, 100_000);
    let sy_shares = protocol.deposit(&alice, 100_000);
    protocol.mint_pt_yt(&alice, sy_shares);

    protocol.generate_yield(50_000);
    protocol.advance_ledger(100);
    protocol.generate_yield(50_000);

    let alice_yield_mid = protocol.yt_token.claimable_yield(&alice);

    protocol.yt_token.transfer(&alice, &bob, &sy_shares);

    let bob_yield = protocol.yt_token.claimable_yield(&bob);
    assert_eq!(bob_yield, 0);

    let alice_yield_after = protocol.yt_token.claimable_yield(&alice);
    assert_eq!(alice_yield_after, alice_yield_mid);
}
