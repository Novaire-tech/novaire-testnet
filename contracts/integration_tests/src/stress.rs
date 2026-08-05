//! Stress test battery — covers extreme conditions while verifying all invariants.

use crate::framework::{Protocol, SCALE};
use crate::invariants::InvariantEngine;

/// Helper: build a fully bootstrapped protocol with a seeded marketplace.
fn bootstrapped_protocol<'a>() -> Protocol<'a> {
    let p = Protocol::new();
    let lp = p.create_user();
    p.bootstrap_marketplace(&lp);
    p.advance_ledger(1);
    p
}

#[test]
fn stress_test_heavy_load() {
    let p = bootstrapped_protocol();
    let mut users = vec![];

    for _ in 0..100 {
        let u = p.create_user();
        p.mint_mock_usdc(&u, 1_000_000_000);
        users.push(u);
    }

    for i in 0..1000usize {
        p.advance_ledger(1);
        let user   = &users[i % users.len()];
        let amount = ((i as i128 * 100) % 50_000).max(1);

        if i % 3 == 0 {
            p.try_deposit(user, amount);
        } else if i % 3 == 1 {
            p.try_mint_pt_yt(user, amount / 2);
        } else {
            p.try_withdraw(user, amount / 10);
        }

        if i % 100 == 0 {
            InvariantEngine::assert_everything(&p);
        }
    }
    InvariantEngine::assert_everything(&p);
}

#[test]
fn stress_flash_loan_twap_resistance() {
    let p = bootstrapped_protocol();

    // Extra deep liquidity so attacks don't empty the pool
    let lp = p.create_user();
    p.mint_mock_usdc(&lp, 2_000_000_000_000);
    p.pt_token.mint(&lp, &2_000_000_000_000);
    p.try_add_liquidity(&lp, 1_000_000_000_000, 999_500_000_000);
    p.advance_ledger(10);

    // Baseline TWAP after first swap
    let initiator = p.create_user();
    p.mint_mock_usdc(&initiator, 1_000_000);
    p.try_swap_u_for_pt(&initiator, 100_000);
    let twap_baseline = p.get_twap();
    assert!(twap_baseline > 0 && twap_baseline <= SCALE);

    // Flash-loan attack — huge buy then sell
    let attacker = p.create_user();
    p.mint_mock_usdc(&attacker, 500_000_000_000);
    p.pt_token.mint(&attacker, &500_000_000_000);
    p.advance_ledger(1);
    p.try_swap_u_for_pt(&attacker, 200_000_000_000);
    let twap_mid = p.get_twap();
    p.advance_ledger(1);
    p.try_swap_pt_for_u(&attacker, 200_000_000_000);
    let twap_after = p.get_twap();

    // TWAP must not have been destroyed
    assert!(twap_mid  > 0, "Flash-loan: TWAP mid out of range: {twap_mid}");
    assert!(twap_after > 0, "Flash-loan: TWAP after out of range: {twap_after}");

    // EMA dampening: TWAP shift ≤ 50% of baseline (not fully displaced)
    let delta = (twap_after - twap_baseline).abs();
    assert!(
        delta <= twap_baseline / 2,
        "Flash-loan: EMA not dampening — delta={delta}, baseline={twap_baseline}"
    );

    InvariantEngine::assert_everything(&p);
    println!("  ✅ Flash-loan TWAP resistance: delta={delta} (< 50% of baseline {twap_baseline})");
}

#[test]
fn stress_tiny_swaps() {
    let p = bootstrapped_protocol();
    let user = p.create_user();
    p.mint_mock_usdc(&user, 1_000_000);

    for _ in 0..10 {
        p.advance_ledger(1);
        p.try_swap_u_for_pt(&user, 1); // amount = 1 (minimum possible)
    }

    let twap = p.get_twap();
    let spot = p.get_pt_price();
    assert!(twap > 0 && twap <= SCALE, "Tiny swaps: TWAP={twap} out of range");
    assert!(spot > 0 && spot <= SCALE, "Tiny swaps: Spot={spot} out of range");
    InvariantEngine::assert_everything(&p);
    println!("  ✅ Tiny swaps (amount=1): no panic, invariants hold");
}

#[test]
fn stress_large_liquidity_add_remove() {
    let p = bootstrapped_protocol();

    let mega_lp = p.create_user();
    p.mint_mock_usdc(&mega_lp, 100_000_000_000_000);
    p.pt_token.mint(&mega_lp, &100_000_000_000_000);

    // Very large add
    p.try_add_liquidity(&mega_lp, 50_000_000_000_000, 49_975_000_000_000);
    InvariantEngine::assert_everything(&p);

    // Large remove (partial)
    p.try_remove_liquidity(&mega_lp, 10_000_000_000);
    InvariantEngine::assert_everything(&p);

    // Trade into the deep pool
    let trader = p.create_user();
    p.mint_mock_usdc(&trader, 1_000_000_000_000);
    p.advance_ledger(5);
    p.try_swap_u_for_pt(&trader, 500_000_000_000);
    InvariantEngine::assert_everything(&p);
    println!("  ✅ Large liquidity add/remove with deep-pool trade — all invariants hold");
}

#[test]
fn stress_same_ledger_twap_idempotency() {
    let p = bootstrapped_protocol();
    let user = p.create_user();
    p.mint_mock_usdc(&user, 1_000_000_000_000);

    // First swap initializes TWAP
    p.advance_ledger(10);
    p.try_swap_u_for_pt(&user, 1_000_000);
    let twap_1 = p.get_twap();

    // Multiple swaps on the SAME ledger — TWAP must not change
    p.try_swap_u_for_pt(&user, 1_000_000);
    p.try_swap_u_for_pt(&user, 1_000_000);
    p.try_swap_u_for_pt(&user, 1_000_000);
    let twap_2 = p.get_twap();

    assert_eq!(twap_1, twap_2,
        "Same-ledger TWAP idempotency violated: {twap_1} → {twap_2}");
    InvariantEngine::assert_everything(&p);
    println!("  ✅ Same-ledger TWAP idempotency: twap unchanged after multiple swaps");
}

#[test]
fn stress_consecutive_multi_user_mints() {
    let p = bootstrapped_protocol();

    // 50 users each deposit and mint
    for _ in 0..50 {
        let u = p.create_user();
        p.mint_mock_usdc(&u, 20_000_000);
        p.deposit(&u, 20_000_000);
        p.try_mint_pt_yt(&u, 10_000_000);
    }
    InvariantEngine::assert_everything(&p);
    println!("  ✅ 50-user concurrent mint: PT==YT conservation holds");
}
