#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger}, token, Address, Env};

use pt_token::{PtToken, PtTokenClient};
use marketplace::{NovaireMarketplace, NovaireMarketplaceClient};
use intent_engine::{IntentEngine, IntentEngineClient, CumulativeIntentRecord};

use soroban_sdk::{contract, contractimpl};

#[contract]
pub struct MockIntentEngine;
#[contractimpl]
impl MockIntentEngine {
    pub fn execute_fixed_yield_intent(
        env: Env,
        user: Address,
        usdc_amount: i128,
        min_implied_rate: i128,
        _min_underlying_out: i128,
        _maturity_ledger: u32,
        _yt_sale_percentage: u32,
    ) -> CumulativeIntentRecord {
        let pt_token_addr: Address = env.storage().instance().get(&soroban_sdk::Symbol::new(&env, "pt_token")).unwrap();
        let pt_client = PtTokenClient::new(&env, &pt_token_addr);
        pt_client.mint(&user, &usdc_amount); // Mint PT to user

        CumulativeIntentRecord {
            total_deposited_amount: usdc_amount,
            total_pt_held: usdc_amount,
            total_yt_sold: usdc_amount,
            total_underlying_received: 0,
        }
    }
    
    pub fn set_pt_token_intent(env: Env, pt_token: Address) {
        env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "pt_token"), &pt_token);
    }
}

#[contract]
pub struct MockFactory;
#[contractimpl]
impl MockFactory {
    pub fn latest_epoch(env: Env) -> EpochRecord {
        let maturity_ledger: u32 = env.storage().instance().get(&soroban_sdk::Symbol::new(&env, "next_maturity")).unwrap_or(2000);
        EpochRecord {
            epoch_id: 2,
            maturity_ledger,
            created_ledger: 0,
        }
    }

    pub fn get_epoch_by_maturity(_env: Env, maturity_ledger: u32) -> EpochRecord {
        EpochRecord {
            epoch_id: 1,
            maturity_ledger,
            created_ledger: 0,
        }
    }

    pub fn get_next_epoch(env: Env, _current_epoch_id: u32) -> EpochRecord {
        let maturity_ledger: u32 = env.storage().instance().get(&soroban_sdk::Symbol::new(&env, "next_maturity")).unwrap_or(2000);
        EpochRecord {
            epoch_id: 2,
            maturity_ledger,
            created_ledger: 0,
        }
    }
    
    pub fn set_next_maturity(env: Env, maturity_ledger: u32) {
        env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "next_maturity"), &maturity_ledger);
    }
}

#[contract]
pub struct MockTokenizer;
#[contractimpl]
impl MockTokenizer {
    pub fn redeem_pt(env: Env, to: Address, amount: i128) -> i128 {
        let pt_token_addr: Address = env.storage().instance().get(&soroban_sdk::Symbol::new(&env, "pt_token")).unwrap();
        let pt_client = PtTokenClient::new(&env, &pt_token_addr);
        pt_client.burn(&to, &amount); // Burn PT from user
        amount + 10 // Simulate some yield
    }
    
    pub fn set_pt_token_tokenizer(env: Env, pt_token: Address) {
        env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "pt_token"), &pt_token);
    }
}

fn setup_env() -> (Env, Address, Address, AutonomousRolloverClient<'static>, PtTokenClient<'static>, token::StellarAssetClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();

    let admin = Address::generate(&env);
    let keeper = Address::generate(&env);
    let token_admin = Address::generate(&env);
    
    let underlying_token = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
    let token_admin_client = token::StellarAssetClient::new(&env, &underlying_token);

    let tokenizer_contract_id = env.register(MockTokenizer, ());
    let intent_engine_contract_id = env.register(MockIntentEngine, ());

    let pt_contract_id = env.register(PtToken, ());
    let pt_client = PtTokenClient::new(&env, &pt_contract_id);
    pt_client.initialize(&admin, &tokenizer_contract_id);
    
    env.as_contract(&tokenizer_contract_id, || {
        env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "pt_token"), &pt_contract_id);
    });
    env.as_contract(&intent_engine_contract_id, || {
        env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "pt_token"), &pt_contract_id);
    });

    let factory_contract_id = env.register(MockFactory, ());

    let rollover_contract_id = env.register(AutonomousRollover, ());
    let rollover_client = AutonomousRolloverClient::new(&env, &rollover_contract_id);
    rollover_client.initialize(
        &admin,
        &tokenizer_contract_id,
        &Address::generate(&env), // vault
        &Address::generate(&env), // marketplace
        &intent_engine_contract_id,
        &keeper,
        &pt_contract_id,
        &underlying_token,
        &factory_contract_id,
        &17280
    );

    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 0,
        ..env.ledger().get()
    });

    (env, keeper, underlying_token, rollover_client, pt_client, token_admin_client, intent_engine_contract_id, factory_contract_id)
}

#[test]
fn test_register_and_execute_rollover() {
    let (env, _, _, rollover, pt_client, token_admin, intent_engine_contract_id, factory_contract_id) = setup_env();
    
    let user = Address::generate(&env);
    
    // User gets 2000 USDC, wraps it to PT
    token_admin.mint(&user, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);

    // Give Intent Engine a valid twap. The market needs liquidity.
    // We already added 1M PT and 1M U liquidity. TWAP is 1.
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &100, &0);

    let initial_pt = pt_client.balance(&user);
    assert!(initial_pt > 0);

    // 1. Register rollover
    rollover.register_rollover(&user, &initial_pt, &1000, &0, &0);
    
    assert_eq!(pt_client.balance(&user), 0); // Contract took PT

    let position = rollover.get_position(&user);
    assert!(position.active);
    assert_eq!(position.pt_balance, initial_pt);
    assert_eq!(position.current_epoch_maturity, 1000);

    // Advance ledger to maturity
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..env.ledger().get()
    });

    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);
    mock_factory_client.set_next_maturity(&2000);

    // 2. Execute rollover
    rollover.execute_rollover(&user);

    let updated_pos = rollover.get_position(&user);
    assert_eq!(updated_pos.current_epoch_maturity, 2000);
    assert!(updated_pos.pt_balance > 0);
    assert_eq!(updated_pos.protocol_yield_earned, 0);
    assert_eq!(updated_pos.realized_pnl, 10);
}

#[test]
fn test_exit_rollover() {
    let (env, _, _, rollover, pt_client, token_admin, intent_engine_contract_id, _) = setup_env();
    let user = Address::generate(&env);
    token_admin.mint(&user, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &100, &0);

    let initial_pt = pt_client.balance(&user);
    rollover.register_rollover(&user, &initial_pt, &1000, &0, &0);

    rollover.exit_rollover(&user);

    assert_eq!(pt_client.balance(&user), initial_pt);
    let pos = rollover.try_get_position(&user);
    assert!(pos.is_err()); // Position deleted
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_next_epoch_not_set() {
    let (env, _, _, rollover, pt_client, token_admin, intent_engine_contract_id, factory_contract_id) = setup_env();
    let user = Address::generate(&env);
    token_admin.mint(&user, &2000);

    let intent_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_client.execute_fixed_yield_intent(&user, &1000, &0, &1000, &100, &0);

    let initial_pt = pt_client.balance(&user);
    rollover.register_rollover(&user, &initial_pt, &1000, &0, &0); 

    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);
    mock_factory_client.set_next_maturity(&2000);

    env.ledger().set(soroban_sdk::testutils::LedgerInfo { sequence_number: 1001, ..env.ledger().get() });
    rollover.execute_rollover(&user); // successful roll
    
    // next epoch maturity hasn't advanced, so latest epoch maturity <= current_ledger!
    env.ledger().set(soroban_sdk::testutils::LedgerInfo { sequence_number: 2001, ..env.ledger().get() });
    rollover.execute_rollover(&user); // fails because next_epoch is now 2000 which is <= 2001
}
