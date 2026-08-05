#![cfg(test)]

use crate::framework::{Protocol, BOOTSTRAP_PT, BOOTSTRAP_UNDER};
use soroban_sdk::testutils::LedgerInfo;
use soroban_sdk::testutils::Ledger;

#[test]
fn test_m1_production_exploit_matrix() {
    let pt_bootstrap = BOOTSTRAP_PT;
    let u_bootstrap = BOOTSTRAP_UNDER;

    let elapsed_ledgers = [0, 1, 3, 10, 100, 500];
    let attack_sizes = [1_000_000i128, 5_000_000, 10_000_000, 25_000_000, 50_000_000];

    std::println!("=== M1 EXPLOIT MATRIX (TWAP PRICING) ===");
    std::println!("Elapsed | Attack Size | PT Proceeds | YT Proceeds | Net P&L");
    std::println!("---------------------------------------------------------");

    for &elapsed in &elapsed_ledgers {
        for &attack_size in &attack_sizes {
            // Re-initialize a fresh protocol environment for each run to isolate state
            let protocol = Protocol::new();
            
            // Bootstrap marketplace
            let provider = protocol.create_user();
            protocol.bootstrap_marketplace(&provider);

            let current_seq = protocol.env.ledger().sequence();
            protocol.env.ledger().set(LedgerInfo {
                sequence_number: current_seq + elapsed,
                ..protocol.env.ledger().get()
            });

            let attacker = protocol.create_user();
            
            // Mint underlying to attacker for the attack
            protocol.mint_mock_usdc(&attacker, attack_size);
            
            // 1. Deposit & Mint PT/YT
            let minted_shares = protocol.vault.deposit(&attacker, &attack_size);
            let _ = protocol.tokenizer.try_mint_pt_yt(&attacker, &minted_shares);

            // 2. Sell entire PT
            let pt_balance = protocol.pt_token.balance(&attacker);
            let pt_proceeds = if pt_balance > 0 {
                protocol.marketplace.swap_pt_for_underlying(&attacker, &pt_balance, &1)
            } else {
                0
            };

            // 3. Sell entire YT
            let yt_balance = protocol.yt_token.balance(&attacker);
            let yt_proceeds = if yt_balance > 0 {
                protocol.marketplace.swap_yt_for_underlying(&attacker, &yt_balance, &1)
            } else {
                0
            };

            let final_underlying = protocol.underlying_token.balance(&attacker);
            let net_pnl = final_underlying - attack_size;

            std::println!(
                "{:>7} | {:>11} | {:>11} | {:>11} | {:>11}",
                elapsed,
                attack_size,
                pt_proceeds,
                yt_proceeds,
                net_pnl
            );
            
            // Assert that the exploit is mitigated (Net P&L <= 0)
            assert!(
                net_pnl <= 0,
                "Exploit still profitable! Elapsed: {}, Size: {}, Net P&L: {}",
                elapsed, attack_size, net_pnl
            );
        }
    }
}
