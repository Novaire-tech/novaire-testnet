use crate::framework::Protocol;
use crate::invariants::InvariantEngine;
use proptest::prelude::*;

#[derive(Clone, Debug)]
pub enum ProtocolAction {
    Deposit { user_idx: usize, amount: i128 },
    Withdraw { user_idx: usize, amount: i128 },
    MintPtYt { user_idx: usize, amount: i128 },
    // TODO: Add Marketplace Trades, Liquidity, Epoch Advancement
}

pub fn run_fuzz_sequence(actions: Vec<ProtocolAction>) {
    let protocol = Protocol::new();
    let mut users = vec![];
    for _ in 0..10 {
        let u = protocol.create_user();
        protocol.mint_mock_usdc(&u, 1_000_000_000);
        users.push(u);
    }

    for action in actions {
        match action {
            ProtocolAction::Deposit { user_idx, amount } => {
                let user = &users[user_idx % users.len()];
                let amt = amount.abs() % 1_000_000;
                if amt > 0 {
                    protocol.try_deposit(user, amt);
                }
            },
            ProtocolAction::Withdraw { user_idx, amount } => {
                let user = &users[user_idx % users.len()];
                let amt = amount.abs() % 1_000_000;
                if amt > 0 {
                    protocol.try_withdraw(user, amt);
                }
            },
            ProtocolAction::MintPtYt { user_idx, amount } => {
                let user = &users[user_idx % users.len()];
                let amt = amount.abs() % 1_000_000;
                if amt > 0 {
                    protocol.try_mint_pt_yt(user, amt);
                }
            }
        }
        InvariantEngine::assert_everything(&protocol);
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(50))]
    #[test]
    fn fuzz_protocol_state_machine(
        actions in prop::collection::vec(
            prop_oneof![
                (0usize..10, 1i128..1_000_000).prop_map(|(u, a)| ProtocolAction::Deposit { user_idx: u, amount: a }),
                (0usize..10, 1i128..1_000_000).prop_map(|(u, a)| ProtocolAction::Withdraw { user_idx: u, amount: a }),
                (0usize..10, 1i128..1_000_000).prop_map(|(u, a)| ProtocolAction::MintPtYt { user_idx: u, amount: a }),
            ],
            1..20
        )
    ) {
        run_fuzz_sequence(actions);
    }
}
