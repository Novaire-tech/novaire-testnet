#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};
use crate::framework::Protocol;

// The test imports the YtToken Client directly to invoke checkpoint_user, 
// bypassing the Tokenizer which only exposes try_claim_yield etc.
use yt_token::YtTokenClient;
use yt_token::DataKey;
use yt_token::NovaireYtError;

#[test]
fn test_l1_checkpoint_user_error_propagation() {
    let protocol = Protocol::new();
    let env = &protocol.env;
    let alice = protocol.create_user();
    
    // Deposit and mint so Alice has a balance
    protocol.mint_mock_usdc(&alice, 1_000_000_000);
    let alice_sy = protocol.deposit(&alice, 1_000_000_000);
    protocol.mint_pt_yt(&alice, alice_sy);
    
    let yt_client = YtTokenClient::new(env, &protocol.yt_token.address);
    
    // 1. Successful checkpointing behaves exactly as before
    let res = yt_client.try_checkpoint_user(&alice);
    assert!(res.is_ok(), "Checkpoint should succeed");

    // 2. Force an error inside internal_checkpoint_user
    // internal_checkpoint_user does: index_delta.checked_mul(balance)
    // We will artificially set balance to i128::MAX and index_delta to 2 to cause MathOverflow.
    
    env.as_contract(&protocol.yt_token.address, || {
        // user_index is already checkpointed at whatever current yield index is.
        // Let's increase global index by 2
        let current: i128 = env.storage().instance().get(&DataKey::YieldIndex).unwrap();
        env.storage().instance().set(&DataKey::YieldIndex, &(current + 2));
        
        // set balance to i128::MAX
        env.storage().persistent().set(&DataKey::Balance(alice.clone()), &i128::MAX);
    });
    
    let err_res = yt_client.try_checkpoint_user(&alice);
    
    // 3. checkpoint_user returns the corresponding NovaireYtError instead of unwrapping/panicking
    match err_res {
        Err(Ok(err)) => {
            // NovaireYtError::MathOverflow is 8
            assert_eq!(err as u32, 8, "Expected MathOverflow error code (8)");
        },
        _ => panic!("Expected MathOverflow typed error, but got {:?}", err_res),
    }
}
