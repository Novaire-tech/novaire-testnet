#![cfg(test)]

use super::*;
use soroban_sdk::{
    contract, contractimpl,
    testutils::Address as _,
    Address, Env,
};

// ==========================================
// MOCK PROTOCOL CONTRACTS
// ==========================================

pub mod mock_sy {
    use super::*;
    use soroban_sdk::Symbol;
    #[contract] pub struct MockSyWrapper;
    #[contractimpl] impl MockSyWrapper { 
        pub fn initialize(env: Env, admin: Address, underlying_token: Address, _vault: Address) {
            env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
            env.storage().instance().set(&Symbol::new(&env, "underlying"), &underlying_token);
        }
        pub fn admin(env: Env) -> Address { env.storage().instance().get(&Symbol::new(&env, "admin")).unwrap() }
        pub fn underlying_asset(env: Env) -> Address { env.storage().instance().get(&Symbol::new(&env, "underlying")).unwrap() }
    }
}
pub mod mock_bad_sy {
    use super::*;
    #[contract] pub struct MockBadSyWrapper;
    #[contractimpl] impl MockBadSyWrapper { 
        pub fn initialize(_env: Env, _admin: Address, _underlying_token: Address, _vault: Address) {}
        pub fn admin(env: Env) -> Address { Address::generate(&env) }
        pub fn underlying_asset(env: Env) -> Address { Address::generate(&env) }
    }
}
pub mod mock_vault {
    use super::*;
    use soroban_sdk::Symbol;
    #[contract] pub struct MockVault;
    #[contractimpl] impl MockVault { 
        pub fn initialize(env: Env, admin: Address, sy_token: Address, underlying_token: Address) {
            let meta = VaultMetadata { admin, pending_admin: None, sy_wrapper: sy_token, underlying: underlying_token, total_vault_shares: 0, is_paused: false, version: 1 };
            env.storage().instance().set(&Symbol::new(&env, "meta"), &meta);
        }
        pub fn metadata(env: Env) -> VaultMetadata { env.storage().instance().get(&Symbol::new(&env, "meta")).unwrap() }
    }
}
pub mod mock_pt {
    use super::*;
    use soroban_sdk::Symbol;
    #[contract] pub struct MockPtToken;
    #[contractimpl] impl MockPtToken { 
        pub fn initialize(env: Env, admin: Address, tokenizer: Address) {
            let meta = PtMetadata { admin, tokenizer, total_supply: 0, is_paused: false, version: 1 };
            env.storage().instance().set(&Symbol::new(&env, "meta"), &meta);
        }
        pub fn metadata(env: Env) -> PtMetadata { env.storage().instance().get(&Symbol::new(&env, "meta")).unwrap() }
    }
}
pub mod mock_yt {
    use super::*;
    use soroban_sdk::Symbol;
    #[contract] pub struct MockYtToken;
    #[contractimpl] impl MockYtToken { 
        pub fn initialize(env: Env, admin: Address, tokenizer: Address, maturity_ledger: u32, sy_wrapper: Address, _maturity_engine: Address, _maturity_epoch_id: u32) {
            let meta = YtMetadata { admin, tokenizer, total_supply: 0, yield_index: 0, maturity_ledger, is_paused: false, is_expired: false, version: 1 };
            env.storage().instance().set(&Symbol::new(&env, "meta"), &meta);
        }
        pub fn metadata(env: Env) -> YtMetadata { env.storage().instance().get(&Symbol::new(&env, "meta")).unwrap() }
    }
}
pub mod mock_tokenizer {
    use super::*;
    use soroban_sdk::Symbol;
    #[contract] pub struct MockTokenizer;
    #[contractimpl] impl MockTokenizer { 
        pub fn initialize(env: Env, admin: Address, vault: Address, pt_token: Address, yt_token: Address, sy_token: Address, maturity_ledger: u32, _maturity_engine: Address, _maturity_epoch_id: u32) {
            let meta = TokenizerMetadata { admin, vault, pt_token, yt_token, sy_wrapper: sy_token, maturity_ledger, epoch_id: 0, epoch_start_index: 0, total_pt_minted: 0, settlement_exchange_rate: None, epoch_state: 0, version: 1 };
            env.storage().instance().set(&Symbol::new(&env, "meta"), &meta);
        }
        pub fn metadata(env: Env) -> TokenizerMetadata { env.storage().instance().get(&Symbol::new(&env, "meta")).unwrap() }
    }
}
pub mod mock_market {
    use super::*;
    #[contract] pub struct MockMarketplace;
    #[contractimpl] impl MockMarketplace { pub fn initialize(_env: Env, _admin: Address, _pt_token: Address, _yt_token: Address, _underlying_token: Address, _sy_token: Address, _tokenizer: Address, _maturity_ledger: u32, _maturity_engine: Address, _maturity_epoch_id: u32) {} }
}
pub mod mock_intent {
    use super::*;
    #[contract] pub struct MockIntentEngine;
    #[contractimpl] impl MockIntentEngine { pub fn initialize(_env: Env, _admin: Address, _vault: Address, _tokenizer: Address, _marketplace: Address, _sy_token: Address, _underlying_token: Address, _pt_token: Address, _yt_token: Address) {} }
}
pub mod mock_rollover {
    use super::*;
    #[contract] pub struct MockRolloverEngine;
    #[contractimpl] impl MockRolloverEngine { pub fn initialize(_env: Env, _admin: Address, _tokenizer: Address, _vault: Address, _marketplace: Address, _intent_engine: Address, _keeper: Address, _pt_token: Address, _underlying_token: Address, _factory: Address, _grace_period_ledgers: u32) {} }
}
pub mod mock_maturity {
    use super::*;
    use soroban_sdk::Symbol;
    #[contract] pub struct MockMaturityEngine;
    #[contractimpl] impl MockMaturityEngine {
        pub fn initialize(_env: Env, _admin: Address) {}
        pub fn open_epoch(env: Env, _maturity_ledger: u32) -> u32 {
            let id: u32 = env.storage().instance().get(&Symbol::new(&env, "id")).unwrap_or(0) + 1;
            env.storage().instance().set(&Symbol::new(&env, "id"), &id);
            id
        }
        pub fn live_state(_env: Env, _epoch_id: u32) -> u32 { 0 }
    }
}
pub mod mock_bad_maturity {
    use super::*;
    #[contract] pub struct MockBadMaturityEngine;
    #[contractimpl] impl MockBadMaturityEngine {
        pub fn initialize(_env: Env, _admin: Address) {}
        pub fn open_epoch(_env: Env, _maturity_ledger: u32) -> u32 { 1 }
        // Always reports Matured (1), never Active — used to exercise the
        // Factory's post-open live_state wiring-verification check.
        pub fn live_state(_env: Env, _epoch_id: u32) -> u32 { 1 }
    }
}

// ==========================================
// SETUP
// ==========================================

struct Setup {
    env: Env,
    factory: FactoryClient<'static>,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    let factory_id = env.register(Factory, ());
    let factory = FactoryClient::new(&env, &factory_id);
    
    factory.initialize(&admin, &1);
    
    Setup { env, factory }
}

fn deploy_mock_epoch(s: &Setup, maturity: u32) -> Result<u32, NovaireFactoryError> {
    let env = &s.env;
    let underlying = Address::generate(env);
    let sy = env.register(mock_sy::MockSyWrapper, ());
    let vault = env.register(mock_vault::MockVault, ());
    let pt = env.register(mock_pt::MockPtToken, ());
    let yt = env.register(mock_yt::MockYtToken, ());
    let tokenizer = env.register(mock_tokenizer::MockTokenizer, ());
    let marketplace = env.register(mock_market::MockMarketplace, ());
    let intent = env.register(mock_intent::MockIntentEngine, ());
    let rollover = env.register(mock_rollover::MockRolloverEngine, ());
    let maturity_engine = env.register(mock_maturity::MockMaturityEngine, ());
    let keeper = Address::generate(env);

    let params = DeployEpochParams {
        maturity_ledger: maturity,
        underlying_token: underlying,
        sy_wrapper: sy,
        vault,
        blend_pool: Address::generate(env),
        pt_token: pt,
        yt_token: yt,
        tokenizer,
        marketplace,
        intent_engine: intent,
        rollover_engine: rollover,
        keeper,
        grace_period_ledgers: 17280,
        maturity_engine,
    };

    Ok(s.factory.try_deploy_epoch(&params).unwrap().unwrap())
}

// ==========================================
// TESTS
// ==========================================

#[test]
fn test_successful_deployment_and_wiring() {
    let s = setup();
    
    assert_eq!(s.factory.protocol_version(), 1);
    assert_eq!(s.factory.epoch_count(), 0);
    
    let epoch_id = deploy_mock_epoch(&s, 100000).unwrap();
    
    assert_eq!(epoch_id, 1);
    assert_eq!(s.factory.epoch_count(), 1);
    
    let record = s.factory.latest_epoch();
    assert_eq!(record.epoch_id, 1);
    assert_eq!(record.maturity_ledger, 100000);
    assert_eq!(record.version, 1);
    assert!(record.is_active);
    assert_eq!(record.maturity_epoch_id, 1);
    
    // Test direct lookup
    let direct_record = s.factory.get_epoch(&1);
    assert_eq!(direct_record.epoch_id, 1);
}

#[test]
fn test_multiple_epochs_coexist() {
    let s = setup();
    
    let e1 = deploy_mock_epoch(&s, 100000).unwrap();
    let e2 = deploy_mock_epoch(&s, 200000).unwrap();
    let e3 = deploy_mock_epoch(&s, 300000).unwrap();
    
    assert_eq!(e1, 1);
    assert_eq!(e2, 2);
    assert_eq!(e3, 3);
    assert_eq!(s.factory.epoch_count(), 3);
    
    // Existing epochs remain immutable
    assert_eq!(s.factory.get_epoch(&1).maturity_ledger, 100000);
    assert_eq!(s.factory.get_epoch(&2).maturity_ledger, 200000);
    assert_eq!(s.factory.get_epoch(&3).maturity_ledger, 300000);
    
    // Latest is 3
    assert_eq!(s.factory.latest_epoch().epoch_id, 3);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #4)")]
fn test_duplicate_maturity_panic() {
    let s = setup();
    deploy_mock_epoch(&s, 100000).unwrap();
    let params = DeployEpochParams {
        maturity_ledger: 100000,
        underlying_token: Address::generate(&s.env),
        sy_wrapper: Address::generate(&s.env),
        vault: Address::generate(&s.env),
        blend_pool: Address::generate(&s.env),
        pt_token: Address::generate(&s.env),
        yt_token: Address::generate(&s.env),
        tokenizer: Address::generate(&s.env),
        marketplace: Address::generate(&s.env),
        intent_engine: Address::generate(&s.env),
        rollover_engine: Address::generate(&s.env),
        keeper: Address::generate(&s.env),
        grace_period_ledgers: 17280,
        maturity_engine: Address::generate(&s.env),
    };
    s.factory.deploy_epoch(&params);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_invalid_epoch_lookup() {
    let s = setup();
    s.factory.get_epoch(&999);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_latest_epoch_when_none() {
    let s = setup();
    s.factory.latest_epoch();
}

#[test]
#[should_panic]
fn test_invalid_wiring_rejected() {
    let s = setup();
    // Use an un-registered / generic contract address for `vault` to simulate missing/invalid contract
    let invalid_address = Address::generate(&s.env);
    
    let params = DeployEpochParams {
        maturity_ledger: 100000,
        underlying_token: Address::generate(&s.env),
        sy_wrapper: s.env.register(mock_sy::MockSyWrapper, ()),
        vault: invalid_address,
        blend_pool: Address::generate(&s.env),
        pt_token: s.env.register(mock_pt::MockPtToken, ()),
        yt_token: s.env.register(mock_yt::MockYtToken, ()),
        tokenizer: s.env.register(mock_tokenizer::MockTokenizer, ()),
        marketplace: s.env.register(mock_market::MockMarketplace, ()),
        intent_engine: s.env.register(mock_intent::MockIntentEngine, ()),
        rollover_engine: s.env.register(mock_rollover::MockRolloverEngine, ()),
        keeper: Address::generate(&s.env),
        grace_period_ledgers: 17280,
        maturity_engine: s.env.register(mock_maturity::MockMaturityEngine, ()),
    };
    s.factory.deploy_epoch(&params);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_double_initialization_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory_id = env.register(Factory, ());
    let factory = FactoryClient::new(&env, &factory_id);
    
    factory.initialize(&admin, &1);
    factory.initialize(&admin, &1);
}

#[test]
#[should_panic]
fn test_unauthorized_initialization_fails() {
    let env = Env::default();
    // Do not use mock_all_auths to test authorization rejection
    let admin = Address::generate(&env);
    let factory_id = env.register(Factory, ());
    let factory = FactoryClient::new(&env, &factory_id);
    
    // This will fail because it lacks `admin` authorization
    factory.initialize(&admin, &1);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #11)")]
fn test_wiring_mismatch_fails() {
    let s = setup();
    let env = &s.env;
    let underlying = Address::generate(env);
    let sy = env.register(mock_bad_sy::MockBadSyWrapper, ());
    let vault = env.register(mock_vault::MockVault, ());
    let pt = env.register(mock_pt::MockPtToken, ());
    let yt = env.register(mock_yt::MockYtToken, ());
    let tokenizer = env.register(mock_tokenizer::MockTokenizer, ());
    let marketplace = env.register(mock_market::MockMarketplace, ());
    let intent = env.register(mock_intent::MockIntentEngine, ());
    let rollover = env.register(mock_rollover::MockRolloverEngine, ());
    let maturity_engine = env.register(mock_maturity::MockMaturityEngine, ());
    let keeper = Address::generate(env);

    let params = DeployEpochParams {
        maturity_ledger: 100000,
        underlying_token: underlying,
        sy_wrapper: sy,
        vault,
        blend_pool: Address::generate(env),
        pt_token: pt,
        yt_token: yt,
        tokenizer,
        marketplace,
        intent_engine: intent,
        rollover_engine: rollover,
        keeper,
        grace_period_ledgers: 17280,
        maturity_engine,
    };

    s.factory.deploy_epoch(&params);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #11)")]
fn test_maturity_engine_wiring_mismatch_fails() {
    let s = setup();
    let env = &s.env;
    let underlying = Address::generate(env);
    let sy = env.register(mock_sy::MockSyWrapper, ());
    let vault = env.register(mock_vault::MockVault, ());
    let pt = env.register(mock_pt::MockPtToken, ());
    let yt = env.register(mock_yt::MockYtToken, ());
    let tokenizer = env.register(mock_tokenizer::MockTokenizer, ());
    let marketplace = env.register(mock_market::MockMarketplace, ());
    let intent = env.register(mock_intent::MockIntentEngine, ());
    let rollover = env.register(mock_rollover::MockRolloverEngine, ());
    // Reports Matured immediately after open_epoch — should trip the
    // post-open live_state verification in Factory::deploy_epoch.
    let maturity_engine = env.register(mock_bad_maturity::MockBadMaturityEngine, ());
    let keeper = Address::generate(env);

    let params = DeployEpochParams {
        maturity_ledger: 100000,
        underlying_token: underlying,
        sy_wrapper: sy,
        vault,
        blend_pool: Address::generate(env),
        pt_token: pt,
        yt_token: yt,
        tokenizer,
        marketplace,
        intent_engine: intent,
        rollover_engine: rollover,
        keeper,
        grace_period_ledgers: 17280,
        maturity_engine,
    };

    s.factory.deploy_epoch(&params);
}
