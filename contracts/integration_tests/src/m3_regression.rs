//! Regression tests for M3: Permissionless Epoch Settlement Race Condition
#![cfg(test)]

use crate::framework::{Protocol, MATURITY_LEDGER};
use crate::invariants::InvariantEngine;

// ── Test 1: Normal settlement after maturity ───────────────────────────────────
#[test]
fn test_m3_normal_settlement() {
    let protocol = Protocol::new();
    let user = protocol.create_user();
    
    // Deposit and mint
    protocol.mint_mock_usdc(&user, 100_000_000);
    protocol.deposit(&user, 100_000_000);
    protocol.mint_pt_yt(&user, 50_000_000);
    
    // Advance to maturity
    protocol.advance_ledger(MATURITY_LEDGER);
    
    // Simulate yield on underlying
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 10_000_000);
    
    // Normal admin harvest
    protocol.sy_wrapper.harvest_yield();
    
    let rate_before = protocol.get_exchange_rate();
    
    // Settle
    protocol.settle_epoch();
    
    let rate_after = protocol.get_exchange_rate();
    assert_eq!(rate_before, rate_after, "Rate should be stable after harvest");
    InvariantEngine::assert_everything(&protocol);
}

// ── Test 2: Attacker calls settle_epoch() immediately after maturity ───────────
#[test]
fn test_m3_attacker_early_settlement() {
    let protocol = Protocol::new();
    let user = protocol.create_user();
    let _attacker = protocol.create_user();
    
    // Deposit and mint
    protocol.mint_mock_usdc(&user, 100_000_000);
    protocol.deposit(&user, 100_000_000);
    protocol.mint_pt_yt(&user, 50_000_000);
    
    // Advance to maturity
    protocol.advance_ledger(MATURITY_LEDGER);
    
    // Simulate unharvested yield sitting in SyWrapper
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 10_000_000);
    
    let stale_rate = protocol.get_exchange_rate();
    
    // Attacker settles BEFORE admin harvest
    // Because of the M3 fix, this MUST automatically refresh the rate!
    // We use the tokenizer directly because we want to simulate the attacker
    let _ = protocol.tokenizer.try_settle_epoch();
    
    let refreshed_rate = protocol.get_exchange_rate();
    
    assert!(refreshed_rate > stale_rate, "Settlement must refresh rate and capture yield");
    
    // Admin harvests later
    protocol.sy_wrapper.harvest_yield();
    
    let final_rate = protocol.get_exchange_rate();
    assert_eq!(refreshed_rate, final_rate, "Yield was already captured by settle refresh");
    InvariantEngine::assert_everything(&protocol);
}

// ── Test 3: Large unsolicited donation before settlement ───────────────────────
#[test]
fn test_m3_h5_clamp_preserved() {
    let protocol = Protocol::new();
    let user = protocol.create_user();
    
    // Deposit and mint
    protocol.mint_mock_usdc(&user, 100_000_000);
    protocol.deposit(&user, 100_000_000);
    
    // Advance to maturity
    protocol.advance_ledger(MATURITY_LEDGER);
    
    // Massive unsolicited donation (e.g. 50% of TVL) to attempt rate manipulation
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 50_000_000);
    
    let rate_before = protocol.get_exchange_rate();
    
    // Settle epoch automatically refreshes rate
    protocol.settle_epoch();
    
    let rate_after = protocol.get_exchange_rate();
    
    let max_rate = (rate_before as u128 * 110 / 100) as i128; // 10% clamp
    assert!(rate_after <= max_rate, "H5 donation clamp must still be enforced during settlement refresh");
    InvariantEngine::assert_everything(&protocol);
}

// ── Test 4: Repeated settlement attempts ───────────────────────────────────────
#[test]
fn test_m3_repeated_settlement() {
    let protocol = Protocol::new();
    protocol.advance_ledger(MATURITY_LEDGER);
    
    assert!(protocol.tokenizer.try_settle_epoch().is_ok());
    assert!(protocol.tokenizer.try_settle_epoch().is_err(), "Second settlement must fail");
}

// ── Test 5: Permissionless settlement ──────────────────────────────────────────
#[test]
fn test_m3_permissionless_settlement() {
    let protocol = Protocol::new();
    protocol.advance_ledger(MATURITY_LEDGER);
    
    // Anyone can call settle_epoch on the tokenizer
    assert!(protocol.tokenizer.try_settle_epoch().is_ok());
}

// ── Test 6: Settlement after multiple yield accrual events ─────────────────────
#[test]
fn test_m3_multiple_accruals() {
    let protocol = Protocol::new();
    let user = protocol.create_user();
    
    protocol.mint_mock_usdc(&user, 100_000_000);
    protocol.deposit(&user, 100_000_000);
    
    protocol.advance_ledger(MATURITY_LEDGER / 2);
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 5_000_000); // Accrual 1
    
    protocol.advance_ledger(MATURITY_LEDGER); // Reached maturity
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 5_000_000); // Accrual 2
    
    protocol.settle_epoch();
    let rate = protocol.get_exchange_rate();
    assert!(rate > 1_000_000_000, "Must capture all accruals clamped properly");
}

// ── Test 7: Original M3 Attack Regression ──────────────────────────────────────
#[test]
fn test_m3_original_attack_prevented() {
    let protocol = Protocol::new();
    let user = protocol.create_user();
    
    // User mints PT and YT
    protocol.mint_mock_usdc(&user, 100_000_000);
    let sy_shares = protocol.deposit(&user, 100_000_000);
    let (_pt, _yt) = protocol.mint_pt_yt(&user, sy_shares);
    
    // Advance to maturity
    protocol.advance_ledger(MATURITY_LEDGER);
    
    // Large yield accrues but admin has NOT harvested
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 9_000_000);
    
    // Attacker instantly settles to lock stale rate
    protocol.settle_epoch();
    
    // Admin harvests later
    protocol.sy_wrapper.harvest_yield();
    
    // Now user claims yield
    let claimable = protocol.claim_yield(&user);
    
    // In original M3 attack, claimable yield would not include the 9M
    // With the fix, the settlement refresh captures it instantly
    assert!(claimable > 0, "YT holders must receive the final yield chunk");
    InvariantEngine::assert_everything(&protocol);
}
