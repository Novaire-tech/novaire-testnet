//! Regression tests for M2: Historical YT Crediting
#![cfg(test)]

use crate::framework::{Protocol, MATURITY_LEDGER};
use crate::invariants::InvariantEngine;

// ── Test 1: Mint at epoch genesis (no historical credit) ───────────────────────
#[test]
fn test_m2_mint_at_genesis() {
    let protocol = Protocol::new();
    let minter = protocol.create_user();
    
    protocol.mint_mock_usdc(&minter, 100_000_000);
    protocol.deposit(&minter, 100_000_000);
    
    // Rate is 1.0. 
    protocol.mint_pt_yt(&minter, 50_000_000);
    
    // Check accrued yield is zero
    let claimable = protocol.yt_token.claimable_yield(&minter);
    assert_eq!(claimable, 0, "No historical yield should be credited at genesis");
    
    InvariantEngine::assert_everything(&protocol);
}

// ── Test 2: Late mint after exchange rate growth ───────────────────────────────
#[test]
fn test_m2_late_mint() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    let bob = protocol.create_user();
    
    // Alice mints at genesis
    protocol.mint_mock_usdc(&alice, 100_000_000);
    protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, 50_000_000); // 50M SY shares
    
    // Generate yield
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 10_000_000);
    
    // Refresh rate to see the new exchange rate
    protocol.sy_wrapper.refresh_rate();
    let current_rate = protocol.sy_wrapper.get_exchange_rate();
    assert!(current_rate > 1_000_000_000, "Rate must increase");
    
    // Bob late mints
    protocol.mint_mock_usdc(&bob, 100_000_000);
    protocol.deposit(&bob, 100_000_000);
    
    let bob_sy = 50_000_000;
    protocol.mint_pt_yt(&bob, bob_sy); // 50M SY shares
    
    // Bob should immediately have claimable yield equal to historical yield
    let bob_claimable = protocol.yt_token.claimable_yield(&bob);
    let expected_historical = bob_sy * (current_rate - 1_000_000_000) / 1_000_000_000;
    
    assert!(bob_claimable > 0, "Bob must receive historical credit");
    assert_eq!(bob_claimable, expected_historical, "Historical credit must exactly equal lost value");
    
    InvariantEngine::assert_everything(&protocol);
}

// ── Test 3: Multiple late minters entering at different exchange rates ─────────
#[test]
fn test_m2_multiple_late_minters() {
    let protocol = Protocol::new();
    let p1 = protocol.create_user();
    let p2 = protocol.create_user();
    
    // Initial rate = 1.0
    protocol.mint_mock_usdc(&p1, 100_000_000);
    protocol.deposit(&p1, 100_000_000);
    
    // Rate grows
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 10_000_000);
    protocol.sy_wrapper.refresh_rate();
    
    // P1 mints at rate 1
    protocol.mint_pt_yt(&p1, 20_000_000);
    
    // Rate grows again
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 10_000_000);
    protocol.sy_wrapper.refresh_rate();
    
    // P2 mints at rate 2
    protocol.mint_mock_usdc(&p2, 100_000_000);
    protocol.deposit(&p2, 100_000_000);
    protocol.mint_pt_yt(&p2, 30_000_000);
    
    let p2_claimable = protocol.yt_token.claimable_yield(&p2);
    let current_rate = protocol.sy_wrapper.get_exchange_rate();
    let expected_p2 = 30_000_000 * (current_rate - 1_000_000_000) / 1_000_000_000;
    
    assert_eq!(p2_claimable, expected_p2, "P2 should receive exact historical credit for current rate");
    
    InvariantEngine::assert_everything(&protocol);
}

// ── Test 4: Existing holder minting additional YT ──────────────────────────────
#[test]
fn test_m2_existing_holder_double_mint() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    
    protocol.mint_mock_usdc(&alice, 200_000_000);
    protocol.deposit(&alice, 200_000_000);
    
    // Alice mints 50M at genesis
    protocol.mint_pt_yt(&alice, 50_000_000);
    
    // Rate grows
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 10_000_000);
    protocol.sy_wrapper.refresh_rate();
    let mid_rate = protocol.sy_wrapper.get_exchange_rate();
    
    // Alice mints another 50M late
    protocol.mint_pt_yt(&alice, 50_000_000);
    
    let claimable_after_second = protocol.yt_token.claimable_yield(&alice);
    
    // Alice should have:
    // Yield from first 50M: 50M * (mid_rate - 1.0)
    // Historical credit for second 50M: 50M * (mid_rate - 1.0)
    let expected = (50_000_000 * (mid_rate - 1_000_000_000) / 1_000_000_000) * 2;
    assert_eq!(claimable_after_second, expected, "Alice should have exact yield with no double counting");
    
    // Rate grows again
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 10_000_000);
    protocol.sy_wrapper.refresh_rate();
    let final_rate = protocol.sy_wrapper.get_exchange_rate();
    
    let claimable_final = protocol.yt_token.claimable_yield(&alice);
    
    // Both tranches now earn future yield from mid_rate to final_rate
    let expected_final = expected + (100_000_000 * (final_rate - mid_rate) / 1_000_000_000);
    assert_eq!(claimable_final, expected_final, "Alice should earn correct future yield on full balance");
    
    InvariantEngine::assert_everything(&protocol);
}

// ── Test 7: No vault shares remain trapped ─────────────────────────────────────
#[test]
fn test_m2_no_trapped_shares() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    let bob = protocol.create_user();
    
    // Genesis mint
    protocol.mint_mock_usdc(&alice, 100_000_000);
    protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, 50_000_000);
    
    // Generate yield
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 10_000_000);
    
    // Late mint
    protocol.mint_mock_usdc(&bob, 100_000_000);
    protocol.deposit(&bob, 100_000_000);
    protocol.mint_pt_yt(&bob, 50_000_000);
    
    // Settle
    protocol.advance_ledger(MATURITY_LEDGER + 1);
    protocol.tokenizer.settle_epoch();
    
    // Redeem everything
    protocol.tokenizer.claim_yield(&alice);
    protocol.tokenizer.claim_yield(&bob);
    
    protocol.tokenizer.redeem_pt(&alice, &50_000_000);
    protocol.tokenizer.redeem_pt(&bob, &50_000_000);
    
    // Tokenizer should have absolutely zero Vault Shares left (allowing for tiny rounding dust < 10)
    let tokenizer_shares = protocol.vault.balance_of(&protocol.tokenizer.address);
    assert!(tokenizer_shares < 10, "No vault shares should be permanently trapped in Tokenizer (except minimal rounding dust)");
    
    InvariantEngine::assert_everything(&protocol);
}

// ── Test 1: Claim → Mint → Claim Again ──────────────────────────────────────────
#[test]
fn test_m2_claim_mint_claim() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    
    // Genesis mint
    protocol.mint_mock_usdc(&alice, 100_000_000);
    protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, 50_000_000);
    
    // Accrue yield
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 10_000_000);
    protocol.sy_wrapper.refresh_rate(); // <--- FIX
    
    // Claim first tranche of yield
    let claim_1 = protocol.tokenizer.claim_yield(&alice);
    assert!(claim_1 > 0, "Alice should have claimed yield");
    
    let claimable_after_claim = protocol.yt_token.claimable_yield(&alice);
    assert_eq!(claimable_after_claim, 0, "Claimable yield should be cleared");
    
    // Accrue more yield
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 10_000_000);
    protocol.sy_wrapper.refresh_rate();
    let current_rate = protocol.sy_wrapper.get_exchange_rate();
    
    // Mint additional PT/YT
    protocol.mint_mock_usdc(&alice, 100_000_000);
    protocol.deposit(&alice, 100_000_000);
    let new_sy = 50_000_000;
    protocol.mint_pt_yt(&alice, new_sy);
    
    let claimable_after_second_mint = protocol.yt_token.claimable_yield(&alice);
    
    // Historical credit should apply ONLY to the new mint
    let expected_historical = new_sy * (current_rate - 1_000_000_000) / 1_000_000_000;
    
    // She also earned some future yield on her OLD 50M between the first claim and the second mint
    assert!(claimable_after_second_mint >= expected_historical);
    
    // Accrue more yield
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 10_000_000);
    protocol.sy_wrapper.refresh_rate();
    
    // Claim again
    let claim_2 = protocol.tokenizer.claim_yield(&alice);
    assert!(claim_2 > 0, "Alice should claim again");
    
    InvariantEngine::assert_everything(&protocol);
}

// ── Test 2: Multiple refresh_rate() Calls Before Mint ────────────────────────
#[test]
fn test_m2_multiple_refreshes_before_mint() {
    let protocol = Protocol::new();
    let bob = protocol.create_user();
    
    let alice = protocol.create_user();
    protocol.mint_mock_usdc(&alice, 100_000_000);
    protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, 50_000_000);
    
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 10_000_000);
    protocol.sy_wrapper.refresh_rate();
    
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 15_000_000);
    protocol.sy_wrapper.refresh_rate();
    
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 5_000_000);
    protocol.sy_wrapper.refresh_rate();
    
    let latest_rate = protocol.sy_wrapper.get_exchange_rate();
    
    // Late mint
    protocol.mint_mock_usdc(&bob, 100_000_000);
    protocol.deposit(&bob, 100_000_000);
    let bob_sy = 50_000_000;
    protocol.mint_pt_yt(&bob, bob_sy);
    
    let bob_claimable = protocol.yt_token.claimable_yield(&bob);
    let expected_historical = bob_sy * (latest_rate - 1_000_000_000) / 1_000_000_000;
    
    // Use diff logic to avoid rounding failure
    assert!((bob_claimable - expected_historical).abs() <= 5, "Historical credit must use the latest exchange rate");
    
    // Accrue more and settle
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 20_000_000);
    protocol.advance_ledger(MATURITY_LEDGER + 1);
    protocol.tokenizer.settle_epoch();
    
    let settlement_rate = protocol.sy_wrapper.get_exchange_rate();
    let bob_final_claimable = protocol.yt_token.claimable_yield(&bob);
    
    let future_yield = bob_sy * (settlement_rate - latest_rate) / 1_000_000_000;
    let expected_total = expected_historical + future_yield;
    assert!((bob_final_claimable - expected_total).abs() <= 5, "Total returned value must equal historical + future");
    
    InvariantEngine::assert_everything(&protocol);
}

// ── Test 3: Minimal Mint / Rounding ───────────────────────────────────────────
#[test]
fn test_m2_minimal_mint_rounding() {
    let protocol = Protocol::new();
    let minter = protocol.create_user();
    
    let base = protocol.create_user();
    protocol.mint_mock_usdc(&base, 100_000_000);
    protocol.deposit(&base, 100_000_000);
    protocol.mint_pt_yt(&base, 50_000_000);
    
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, 1);
    protocol.sy_wrapper.refresh_rate();
    let rate = protocol.sy_wrapper.get_exchange_rate();
    
    // Late mint exactly 1 SY share
    protocol.mint_mock_usdc(&minter, 100);
    protocol.deposit(&minter, 100);
    protocol.mint_pt_yt(&minter, 1); // <--- exactly 1 SY share
    
    let claimable = protocol.yt_token.claimable_yield(&minter);
    let expected = (rate - 1_000_000_000) / 1_000_000_000;
    
    assert_eq!(claimable, expected, "Minimal mint should not underflow or crash");
    assert!(claimable >= 0, "Claimable should never be negative");
    
    InvariantEngine::assert_everything(&protocol);
}

// ── Test 4: Large Value Stress Test ───────────────────────────────────────────
#[test]
fn test_m2_large_value_stress() {
    let protocol = Protocol::new();
    let whale = protocol.create_user();
    
    // 1 quadrillion
    let massive_amount = 1_000_000_000_000_000;
    protocol.mint_mock_usdc(&whale, massive_amount * 2);
    protocol.deposit(&whale, massive_amount * 2);
    
    // Yield
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, massive_amount / 2);
    protocol.sy_wrapper.refresh_rate();
    
    let rate = protocol.sy_wrapper.get_exchange_rate();
    
    // Mint massive amount
    protocol.mint_pt_yt(&whale, massive_amount);
    
    let claimable = protocol.yt_token.claimable_yield(&whale);
    let expected = massive_amount * (rate - 1_000_000_000) / 1_000_000_000;
    
    assert!((claimable - expected).abs() <= 5, "Large value math must not overflow");
    
    // Accrue more
    protocol.mint_mock_usdc(&protocol.sy_wrapper.address, massive_amount / 2);
    
    protocol.advance_ledger(MATURITY_LEDGER + 1);
    protocol.tokenizer.settle_epoch();
    
    let claim_amount = protocol.tokenizer.claim_yield(&whale);
    let final_rate = protocol.sy_wrapper.get_exchange_rate();
    let total_expected = massive_amount * (final_rate - 1_000_000_000) / 1_000_000_000;
    
    let diff = (claim_amount - total_expected).abs();
    assert!(diff <= 10, "Claimed amount should match expected total within rounding limits");
    
    protocol.tokenizer.redeem_pt(&whale, &massive_amount);
    
    let tokenizer_shares = protocol.vault.balance_of(&protocol.tokenizer.address);
    assert!(tokenizer_shares < 10, "No vault shares should be permanently trapped in Tokenizer");
    
    InvariantEngine::assert_everything(&protocol);
}
