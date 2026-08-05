#![cfg(test)]

use crate::framework::Protocol;
use crate::invariants::InvariantEngine;

#[test]
fn test_m1_sell_yt_matches_complement_price() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    
    // Setup liquidity
    protocol.mint_mock_usdc(&alice, 200_000_000);
    let alice_sy = protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, alice_sy);
    protocol.add_liquidity(&alice, 50_000_000, 40_000_000);
    
    let yt_amount = 10_000_000;
    
    let pt_price = protocol.marketplace.get_pt_price();
    let expected_yt_price = 1_000_000_000_i128 - pt_price;
    
    let expected_underlying_raw = (yt_amount * expected_yt_price) / 1_000_000_000;
    let expected_underlying_out = (expected_underlying_raw * 995) / 1000;
    
    let usdc_balance_before = protocol.underlying_token.balance(&alice);
    let _ = protocol.marketplace.swap_yt_for_underlying(&alice, &yt_amount, &0);
    let usdc_balance_after = protocol.underlying_token.balance(&alice);
    
    let actual_out = usdc_balance_after - usdc_balance_before;
    
    assert_eq!(actual_out, expected_underlying_out, "Underlying out mismatch");
    assert!(actual_out > 0, "Should have received underlying");
    InvariantEngine::assert_everything(&protocol);
}

#[test]
fn test_m1_buy_yt_matches_complement_price() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    
    protocol.mint_mock_usdc(&alice, 200_000_000);
    let alice_sy = protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, alice_sy);
    protocol.add_liquidity(&alice, 50_000_000, 40_000_000);
    let _ = protocol.marketplace.swap_yt_for_underlying(&alice, &50_000_000, &0);
    
    let usdc_in = 10_000_000;
    
    let pt_price = protocol.marketplace.get_pt_price();
    let expected_yt_price = 1_000_000_000_i128 - pt_price;
    
    let expected_yt_raw = (usdc_in * 1_000_000_000) / expected_yt_price;
    let expected_yt_out = (expected_yt_raw * 995) / 1000;
    
    let yt_balance_before = protocol.yt_token.balance(&alice);
    let _ = protocol.marketplace.swap_underlying_for_yt(&alice, &usdc_in, &0);
    let yt_balance_after = protocol.yt_token.balance(&alice);
    
    let actual_out = yt_balance_after - yt_balance_before;
    
    assert_eq!(actual_out, expected_yt_out, "YT out mismatch");
    InvariantEngine::assert_everything(&protocol);
}

#[test]
fn test_m1_no_virtual_pt_movement() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    
    protocol.mint_mock_usdc(&alice, 200_000_000);
    let alice_sy = protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, alice_sy);
    protocol.add_liquidity(&alice, 50_000_000, 40_000_000);
    let _ = protocol.marketplace.swap_yt_for_underlying(&alice, &50_000_000, &0);
    
    let (pt_res_before, _, _) = protocol.marketplace.get_reserves();
    
    let usdc_in = 5_000_000;
    let _ = protocol.marketplace.swap_underlying_for_yt(&alice, &usdc_in, &0);
    
    let (pt_res_after_buy, _, _) = protocol.marketplace.get_reserves();
    assert_eq!(pt_res_before, pt_res_after_buy, "PT reserves changed during buy YT!");
    
    let yt_in = 5_000_000;
    let _ = protocol.marketplace.swap_yt_for_underlying(&alice, &yt_in, &0);
    
    let (pt_res_after_sell, _, _) = protocol.marketplace.get_reserves();
    assert_eq!(pt_res_before, pt_res_after_sell, "PT reserves changed during sell YT!");
    
    InvariantEngine::assert_everything(&protocol);
}

#[test]
fn test_m1_round_trip_no_free_profit() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    
    protocol.mint_mock_usdc(&alice, 200_000_000);
    let alice_sy = protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, alice_sy);
    protocol.add_liquidity(&alice, 50_000_000, 40_000_000);
    let _ = protocol.marketplace.swap_yt_for_underlying(&alice, &50_000_000, &0);
    
    let bob = protocol.create_user();
    protocol.mint_mock_usdc(&bob, 100_000_000);
    let bob_initial = protocol.underlying_token.balance(&bob);
    
    let _ = protocol.marketplace.swap_underlying_for_yt(&bob, &10_000_000, &0);
    let bob_yt = protocol.yt_token.balance(&bob);
    let _ = protocol.marketplace.swap_yt_for_underlying(&bob, &bob_yt, &0);
    
    let bob_final = protocol.underlying_token.balance(&bob);
    assert!(bob_final < bob_initial, "Round trip produced free profit!");
    InvariantEngine::assert_everything(&protocol);
}

#[test]
fn test_m1_price_identity() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    
    protocol.mint_mock_usdc(&alice, 200_000_000);
    let alice_sy = protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, alice_sy);
    protocol.add_liquidity(&alice, 50_000_000, 40_000_000);
    
    let pt_price = protocol.marketplace.get_pt_price();
    let implied_yt_price = 1_000_000_000_i128 - pt_price;
    
    assert_eq!(pt_price + implied_yt_price, 1_000_000_000);
}

#[test]
fn test_m1_lp_accounting_preserved() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    
    protocol.mint_mock_usdc(&alice, 200_000_000);
    let alice_sy = protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, alice_sy);
    let initial_lp = protocol.add_liquidity(&alice, 50_000_000, 40_000_000);
    std::println!("initial_lp: {}", initial_lp);
    let _ = protocol.marketplace.swap_yt_for_underlying(&alice, &50_000_000, &0);
    
    let bob = protocol.create_user();
    protocol.mint_mock_usdc(&bob, 100_000_000);
    
    let (pt, u, yt) = protocol.marketplace.get_reserves();
    std::println!("Before swap_underlying_for_yt - pt: {}, u: {}, yt: {}", pt, u, yt);
    
    let _ = protocol.marketplace.swap_underlying_for_yt(&bob, &5_000_000, &0);
    let _ = protocol.marketplace.swap_yt_for_underlying(&bob, &5_000_000, &0);
    
    protocol.remove_liquidity(&alice, initial_lp / 2);
    
    InvariantEngine::assert_everything(&protocol);
}

#[test]
fn test_m1_sequential_swaps() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();
    
    protocol.mint_mock_usdc(&alice, 200_000_000);
    let alice_sy = protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, alice_sy);
    protocol.add_liquidity(&alice, 50_000_000, 40_000_000);
    let _ = protocol.marketplace.swap_yt_for_underlying(&alice, &50_000_000, &0);
    
    let bob = protocol.create_user();
    protocol.mint_mock_usdc(&bob, 100_000_000);
    
    protocol.swap_underlying_for_pt(&bob, 5_000_000, 0);
    let _ = protocol.marketplace.swap_underlying_for_yt(&bob, &5_000_000, &0);
    
    let bob_pt = protocol.pt_token.balance(&bob);
    protocol.swap_pt_for_underlying(&bob, bob_pt, 0);
    
    let bob_yt = protocol.yt_token.balance(&bob);
    let _ = protocol.marketplace.swap_yt_for_underlying(&bob, &bob_yt, &0);
    
    InvariantEngine::assert_everything(&protocol);
}

#[test]
fn test_m1_exploit_reproduction_at_epoch_start() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();

    assert_eq!(protocol.env.ledger().sequence(), crate::framework::CREATED_LEDGER);

    // Bootstrap protocol
    protocol.mint_mock_usdc(&alice, 200_000_000);
    let alice_sy = protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, alice_sy);
    protocol.add_liquidity(&alice, 50_000_000, 40_000_000);

    let exploit_amount = 5_000_000;
    let bob = protocol.create_user();
    protocol.mint_mock_usdc(&bob, exploit_amount);
    
    let initial_balance = protocol.underlying_token.balance(&bob);

    std::println!("=== EXPLOIT REPRODUCTION START ===");
    std::println!("Ledger: {}", protocol.env.ledger().sequence());
    std::println!("Initial Underlying: {}", initial_balance);

    let (pt_before, u_before, yt_before) = protocol.marketplace.get_reserves();
    std::println!("Reserves Before Mint - PT: {}, U: {}, YT: {}", pt_before, u_before, yt_before);

    // Mint PT+YT from 5_000_000 underlying
    let bob_sy = protocol.deposit(&bob, exploit_amount);
    protocol.mint_pt_yt(&bob, bob_sy);

    let (pt_after_mint, u_after_mint, yt_after_mint) = protocol.marketplace.get_reserves();
    std::println!("Reserves After Mint - PT: {}, U: {}, YT: {}", pt_after_mint, u_after_mint, yt_after_mint);
    
    std::println!("Ledger before swap PT: {}", protocol.env.ledger().sequence());
    
    let bob_pt = protocol.pt_token.balance(&bob);
    let bob_yt = protocol.yt_token.balance(&bob);
    std::println!("Bob minted PT: {}, YT: {}", bob_pt, bob_yt);

    let pt_proceeds = protocol.marketplace.swap_pt_for_underlying(&bob, &bob_pt, &0);
    std::println!("PT swap proceeds: {}", pt_proceeds);

    let (pt_after_pt_swap, u_after_pt_swap, yt_after_pt_swap) = protocol.marketplace.get_reserves();
    std::println!("Reserves After PT Swap - PT: {}, U: {}, YT: {}", pt_after_pt_swap, u_after_pt_swap, yt_after_pt_swap);

    std::println!("Ledger before swap YT: {}", protocol.env.ledger().sequence());
    let yt_proceeds = protocol.marketplace.swap_yt_for_underlying(&bob, &bob_yt, &0);
    std::println!("YT swap proceeds: {}", yt_proceeds);

    let (pt_after_yt_swap, u_after_yt_swap, yt_after_yt_swap) = protocol.marketplace.get_reserves();
    std::println!("Reserves After YT Swap - PT: {}, U: {}, YT: {}", pt_after_yt_swap, u_after_yt_swap, yt_after_yt_swap);

    let final_balance = protocol.underlying_token.balance(&bob);
    std::println!("Final Underlying: {}", final_balance);
    
    let pnl = final_balance - initial_balance;
    std::println!("Net P&L: {}", pnl);
    std::println!("===================================");
    assert!(pnl <= 0, "Exploit is still profitable! Net P&L: {}", pnl);
}

#[test]
fn test_m1_delayed_yt_sale() {
    let mut protocol = Protocol::new();
    let alice = protocol.create_user();

    // Bootstrap
    protocol.mint_mock_usdc(&alice, 200_000_000);
    let alice_sy = protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, alice_sy);
    protocol.add_liquidity(&alice, 50_000_000, 40_000_000);

    let bob = protocol.create_user();
    let exploit_amount = 5_000_000;
    protocol.mint_mock_usdc(&bob, exploit_amount);
    let initial_balance = protocol.underlying_token.balance(&bob);

    let bob_sy = protocol.deposit(&bob, exploit_amount);
    protocol.mint_pt_yt(&bob, bob_sy);

    let bob_pt = protocol.pt_token.balance(&bob);
    let bob_yt = protocol.yt_token.balance(&bob);

    // Sell PT
    let _ = protocol.marketplace.swap_pt_for_underlying(&bob, &bob_pt, &0);

    // Advance ledgers to let TWAP catch up
    for _ in 0..10 {
        protocol.advance_ledger(1);
    }

    // Sell YT
    let _ = protocol.marketplace.swap_yt_for_underlying(&bob, &bob_yt, &0);

    let final_balance = protocol.underlying_token.balance(&bob);
    let pnl = final_balance - initial_balance;
    
    assert!(pnl <= 0, "Delayed exploit is profitable! Net P&L: {}", pnl);
}

#[test]
fn test_m1_repeat_attack() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();

    protocol.mint_mock_usdc(&alice, 200_000_000);
    let alice_sy = protocol.deposit(&alice, 100_000_000);
    protocol.mint_pt_yt(&alice, alice_sy);
    protocol.add_liquidity(&alice, 50_000_000, 40_000_000);

    let bob = protocol.create_user();
    let exploit_amount = 5_000_000;
    
    // First attack
    protocol.mint_mock_usdc(&bob, exploit_amount);
    let balance_1 = protocol.underlying_token.balance(&bob);
    let bob_sy = protocol.deposit(&bob, exploit_amount);
    protocol.mint_pt_yt(&bob, bob_sy);
    let bob_pt = protocol.pt_token.balance(&bob);
    let bob_yt = protocol.yt_token.balance(&bob);
    let _ = protocol.marketplace.swap_pt_for_underlying(&bob, &bob_pt, &0);
    let _ = protocol.marketplace.swap_yt_for_underlying(&bob, &bob_yt, &0);
    let balance_2 = protocol.underlying_token.balance(&bob);
    let pnl_1 = balance_2 - balance_1;
    assert!(pnl_1 <= 0, "First attack is profitable: {}", pnl_1);

    // Second attack
    let bob_sy_2 = protocol.deposit(&bob, balance_2);
    protocol.mint_pt_yt(&bob, bob_sy_2);
    let bob_pt_2 = protocol.pt_token.balance(&bob);
    let bob_yt_2 = protocol.yt_token.balance(&bob);
    let _ = protocol.marketplace.swap_pt_for_underlying(&bob, &bob_pt_2, &0);
    let _ = protocol.marketplace.swap_yt_for_underlying(&bob, &bob_yt_2, &0);
    let balance_3 = protocol.underlying_token.balance(&bob);
    let pnl_2 = balance_3 - balance_2;
    assert!(pnl_2 <= 0, "Second attack is profitable: {}", pnl_2);
}

#[test]
fn test_m1_large_capital_attack() {
    let protocol = Protocol::new();
    let alice = protocol.create_user();

    // Production bootstrap values
    protocol.bootstrap_marketplace(&alice);

    let bob = protocol.create_user();
    let exploit_amount = 50_000_000; // Large attack size
    protocol.mint_mock_usdc(&bob, exploit_amount);
    
    let initial_balance = protocol.underlying_token.balance(&bob);

    let bob_sy = protocol.deposit(&bob, exploit_amount);
    protocol.mint_pt_yt(&bob, bob_sy);

    let bob_pt = protocol.pt_token.balance(&bob);
    let bob_yt = protocol.yt_token.balance(&bob);

    let _ = protocol.marketplace.swap_pt_for_underlying(&bob, &bob_pt, &0);
    let _ = protocol.marketplace.swap_yt_for_underlying(&bob, &bob_yt, &0);

    let final_balance = protocol.underlying_token.balance(&bob);
    let pnl = final_balance - initial_balance;
    
    assert!(pnl <= 0, "Large capital attack is profitable! Net P&L: {}", pnl);
}
