#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, IntoVal
};

use soroban_sdk::token;

#[soroban_sdk::contractclient(name = "VaultClient")]
pub trait VaultInterface {
    fn deposit(env: Env, from: Address, amount: i128) -> i128;
    fn balance_of(env: Env, user: Address) -> i128;
}

#[soroban_sdk::contractclient(name = "TokenizerClient")]
pub trait TokenizerInterface {
    fn mint_pt_yt(env: Env, to: Address, amount: i128) -> (i128, i128);
}

#[soroban_sdk::contractclient(name = "MarketplaceClient")]
pub trait MarketplaceInterface {
    fn swap_yt_for_underlying(env: Env, seller: Address, yt_amount: i128, min_underlying_out: i128) -> i128;
    fn swap_pt_for_underlying(env: Env, seller: Address, pt_amount: i128, min_underlying_out: i128) -> i128;
    fn get_implied_rate(env: Env) -> i128;
    fn get_twap_rate(env: Env) -> i128;
    fn get_reserves(env: Env) -> (i128, i128, i128);
}

#[soroban_sdk::contractclient(name = "YtTokenClient")]
pub trait YtTokenInterface {
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
    fn balance(env: Env, id: Address) -> i128;
}

#[soroban_sdk::contractclient(name = "PtTokenClient")]
pub trait PtTokenInterface {
    fn balance(env: Env, id: Address) -> i128;
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NovaireIntentError {
    Paused = 1,
    Unauthorized = 2,
    ZeroAmount = 3,
    RateTooLow = 4,
    IntentFailed = 5,
    AlreadyInitialized = 6,
    StorageMissing = 7,
    InvariantViolated = 8,
    InvalidPercentage = 9,
    MarketplaceNotBootstrapped = 10,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Vault,
    Tokenizer,
    Marketplace,
    SyWrapper,
    Underlying,
    PtToken,
    YtToken,
    Paused,
    UserIntents(Address), // map: Address -> IntentRecord
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CumulativeIntentRecord {
    pub total_deposited_amount: i128,
    pub total_pt_held: i128,
    pub total_yt_sold: i128,
    pub total_underlying_received: i128,
}

mod storage {
    use super::*;

    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn get_address(env: &Env, key: DataKey) -> Result<Address, NovaireIntentError> {
        env.storage().instance().get(&key).ok_or(NovaireIntentError::StorageMissing)
    }

    pub fn get_paused(env: &Env) -> Result<bool, NovaireIntentError> {
        env.storage().instance().get(&DataKey::Paused).ok_or(NovaireIntentError::StorageMissing)
    }

    pub fn set_paused(env: &Env, val: bool) {
        env.storage().instance().set(&DataKey::Paused, &val);
    }
}

#[contract]
pub struct IntentEngine;

#[contractimpl]
impl IntentEngine {
    pub fn initialize(
        env: Env,
        admin: Address,
        vault: Address,
        tokenizer: Address,
        marketplace: Address,
        sy_wrapper: Address,
        underlying: Address,
        pt_token: Address,
        yt_token: Address,
    ) -> Result<(), NovaireIntentError> {
        admin.require_auth();
        if storage::is_initialized(&env) {
            return Err(NovaireIntentError::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Vault, &vault);
        env.storage().instance().set(&DataKey::Tokenizer, &tokenizer);
        env.storage().instance().set(&DataKey::Marketplace, &marketplace);
        env.storage().instance().set(&DataKey::SyWrapper, &sy_wrapper);
        env.storage().instance().set(&DataKey::Underlying, &underlying);
        env.storage().instance().set(&DataKey::PtToken, &pt_token);
        env.storage().instance().set(&DataKey::YtToken, &yt_token);
        storage::set_paused(&env, false);

        Ok(())
    }

    pub fn pause(env: Env) -> Result<(), NovaireIntentError> {
        let admin = storage::get_address(&env, DataKey::Admin)?;
        admin.require_auth();
        storage::set_paused(&env, true);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), NovaireIntentError> {
        let admin = storage::get_address(&env, DataKey::Admin)?;
        admin.require_auth();
        storage::set_paused(&env, false);
        Ok(())
    }

    pub fn get_current_best_rate(env: Env) -> Result<i128, NovaireIntentError> {
        let marketplace_addr = storage::get_address(&env, DataKey::Marketplace)?;
        let marketplace_client = MarketplaceClient::new(&env, &marketplace_addr);
        Ok(marketplace_client.get_twap_rate())
    }

    pub fn get_user_intent(env: Env, user: Address) -> Result<CumulativeIntentRecord, NovaireIntentError> {
        env.storage().persistent().get(&DataKey::UserIntents(user)).ok_or(NovaireIntentError::StorageMissing)
    }

    pub fn execute_fixed_yield_intent(
        env: Env,
        user: Address,
        usdc_amount: i128,
        min_implied_rate: i128,
        min_underlying_out: i128,
        _maturity_ledger: u32,
        yt_sale_percentage: u32,
    ) -> Result<CumulativeIntentRecord, NovaireIntentError> {
        user.require_auth();

        if yt_sale_percentage > 100 {
            return Err(NovaireIntentError::InvalidPercentage);
        }

        if storage::get_paused(&env)? {
            return Err(NovaireIntentError::Paused);
        }

        if usdc_amount <= 0 {
            return Err(NovaireIntentError::ZeroAmount);
        }

        let marketplace_addr = storage::get_address(&env, DataKey::Marketplace)?;
        let marketplace_client = MarketplaceClient::new(&env, &marketplace_addr);

        let (pt_reserves, underlying_reserves, _) = marketplace_client.get_reserves();
        if pt_reserves == 0 || underlying_reserves == 0 {
            return Err(NovaireIntentError::MarketplaceNotBootstrapped);
        }

        let current_twap = marketplace_client.get_twap_rate();
        if current_twap < min_implied_rate {
            return Err(NovaireIntentError::RateTooLow);
        }

        let underlying_addr = storage::get_address(&env, DataKey::Underlying)?;
        let underlying_client = token::Client::new(&env, &underlying_addr);

        let intent_engine_addr = env.current_contract_address();
        
        // 1: Pull
        underlying_client.transfer(&user, &intent_engine_addr, &usdc_amount);

        // 2: Deposit
        let vault_addr = storage::get_address(&env, DataKey::Vault)?;
        let vault_client = VaultClient::new(&env, &vault_addr);
        env.authorize_as_current_contract(soroban_sdk::vec![
            &env,
            soroban_sdk::auth::InvokerContractAuthEntry::Contract(
                soroban_sdk::auth::SubContractInvocation {
                    context: soroban_sdk::auth::ContractContext {
                        contract: underlying_addr.clone(),
                        fn_name: soroban_sdk::Symbol::new(&env, "transfer"),
                        args: soroban_sdk::vec![
                            &env,
                            intent_engine_addr.clone().into_val(&env),
                            vault_addr.clone().into_val(&env),
                            usdc_amount.into_val(&env),
                        ],
                    },
                    sub_invocations: soroban_sdk::vec![&env],
                }
            )
        ]);
        let sy_shares = vault_client.deposit(&intent_engine_addr, &usdc_amount);


        // 3: Mint
        let tokenizer_addr = storage::get_address(&env, DataKey::Tokenizer)?;
        let tokenizer_client = TokenizerClient::new(&env, &tokenizer_addr);
        
        env.authorize_as_current_contract(soroban_sdk::vec![
            &env,
            soroban_sdk::auth::InvokerContractAuthEntry::Contract(
                soroban_sdk::auth::SubContractInvocation {
                    context: soroban_sdk::auth::ContractContext {
                        contract: vault_addr.clone(),
                        fn_name: soroban_sdk::Symbol::new(&env, "transfer_shares"),
                        args: soroban_sdk::vec![
                            &env,
                            intent_engine_addr.clone().into_val(&env),
                            tokenizer_addr.clone().into_val(&env),
                            sy_shares.into_val(&env),
                        ],
                    },
                    sub_invocations: soroban_sdk::vec![&env],
                }
            )
        ]);
        let (pt_amount, yt_amount) = tokenizer_client.mint_pt_yt(&intent_engine_addr, &sy_shares);

        // 4: Swap YT
        let yt_token_addr = storage::get_address(&env, DataKey::YtToken)?;
        let yt_token_client = YtTokenClient::new(&env, &yt_token_addr);
        
        let yt_to_sell = (yt_amount * (yt_sale_percentage as i128)) / 100;
        let yt_to_keep = yt_amount - yt_to_sell;
        
        let mut underlying_from_yt = 0;
        
        if yt_to_sell > 0 {
            env.authorize_as_current_contract(soroban_sdk::vec![
                &env,
                soroban_sdk::auth::InvokerContractAuthEntry::Contract(
                    soroban_sdk::auth::SubContractInvocation {
                        context: soroban_sdk::auth::ContractContext {
                            contract: yt_token_addr.clone(),
                            fn_name: soroban_sdk::Symbol::new(&env, "transfer"),
                            args: soroban_sdk::vec![
                                &env,
                                intent_engine_addr.clone().into_val(&env),
                                marketplace_addr.clone().into_val(&env),
                                yt_to_sell.into_val(&env),
                            ],
                        },
                        sub_invocations: soroban_sdk::vec![&env],
                    }
                )
            ]);
            underlying_from_yt = marketplace_client.swap_yt_for_underlying(&intent_engine_addr, &yt_to_sell, &min_underlying_out);
        }
        
        if yt_to_keep > 0 {
            yt_token_client.transfer(&intent_engine_addr, &user, &yt_to_keep);
        }

        // 5: Transfer PT
        let pt_token_addr = storage::get_address(&env, DataKey::PtToken)?;
        let pt_client = PtTokenClient::new(&env, &pt_token_addr);
        pt_client.transfer(&intent_engine_addr, &user, &pt_amount);

        // 6: Transfer Underlying back
        if underlying_from_yt > 0 {
            underlying_client.transfer(&intent_engine_addr, &user, &underlying_from_yt);
        }

        let mut record = env.storage().persistent().get::<_, CumulativeIntentRecord>(&DataKey::UserIntents(user.clone())).unwrap_or(CumulativeIntentRecord {
            total_deposited_amount: 0,
            total_pt_held: 0,
            total_yt_sold: 0,
            total_underlying_received: 0,
        });

        record.total_deposited_amount += usdc_amount;
        record.total_pt_held += pt_amount;
        record.total_yt_sold += yt_to_sell;
        record.total_underlying_received += underlying_from_yt;

        env.storage().persistent().set(&DataKey::UserIntents(user.clone()), &record);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "intent_executed"), user),
            (usdc_amount, pt_amount, underlying_from_yt, current_twap),
        );

        Self::assert_invariant(env)?;
        Ok(record)
    }

    pub fn execute_yield_speculation_intent(
        env: Env,
        user: Address,
        usdc_amount: i128,
        min_yt_out: i128,
        min_underlying_out: i128,
    ) -> Result<i128, NovaireIntentError> {
        user.require_auth();

        if storage::get_paused(&env)? {
            return Err(NovaireIntentError::Paused);
        }

        if usdc_amount <= 0 {
            return Err(NovaireIntentError::ZeroAmount);
        }

        let underlying_addr = storage::get_address(&env, DataKey::Underlying)?;
        let underlying_client = token::Client::new(&env, &underlying_addr);
        let intent_engine_addr = env.current_contract_address();

        underlying_client.transfer(&user, &intent_engine_addr, &usdc_amount);

        let vault_addr = storage::get_address(&env, DataKey::Vault)?;
        let vault_client = VaultClient::new(&env, &vault_addr);
        let sy_shares = vault_client.deposit(&intent_engine_addr, &usdc_amount);

        let tokenizer_addr = storage::get_address(&env, DataKey::Tokenizer)?;
        let tokenizer_client = TokenizerClient::new(&env, &tokenizer_addr);
        let (pt_amount, yt_amount) = tokenizer_client.mint_pt_yt(&intent_engine_addr, &sy_shares);

        if yt_amount < min_yt_out {
            return Err(NovaireIntentError::IntentFailed);
        }

        let marketplace_addr = storage::get_address(&env, DataKey::Marketplace)?;
        let marketplace_client = MarketplaceClient::new(&env, &marketplace_addr);
        
        let (pt_reserves, underlying_reserves, _) = marketplace_client.get_reserves();
        if pt_reserves == 0 || underlying_reserves == 0 {
            return Err(NovaireIntentError::MarketplaceNotBootstrapped);
        }

        let underlying_from_pt = marketplace_client.swap_pt_for_underlying(&intent_engine_addr, &pt_amount, &min_underlying_out);

        let yt_token_addr = storage::get_address(&env, DataKey::YtToken)?;
        let yt_client = YtTokenClient::new(&env, &yt_token_addr);
        yt_client.transfer(&intent_engine_addr, &user, &yt_amount);

        underlying_client.transfer(&intent_engine_addr, &user, &underlying_from_pt);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "yield_speculation_executed"), user),
            (usdc_amount, yt_amount, underlying_from_pt),
        );

        Self::assert_invariant(env)?;
        Ok(yt_amount)
    }

    fn assert_invariant(env: Env) -> Result<(), NovaireIntentError> {
        let current_contract = env.current_contract_address();
        
        let underlying_addr = storage::get_address(&env, DataKey::Underlying)?;
        let underlying_client = token::Client::new(&env, &underlying_addr);
        if underlying_client.balance(&current_contract) != 0 {
            return Err(NovaireIntentError::InvariantViolated);
        }

        let pt_token_addr = storage::get_address(&env, DataKey::PtToken)?;
        let pt_client = PtTokenClient::new(&env, &pt_token_addr);
        if pt_client.balance(&current_contract) != 0 {
            return Err(NovaireIntentError::InvariantViolated);
        }

        let yt_token_addr = storage::get_address(&env, DataKey::YtToken)?;
        let yt_client = YtTokenClient::new(&env, &yt_token_addr);
        if yt_client.balance(&current_contract) != 0 {
            return Err(NovaireIntentError::InvariantViolated);
        }

        let vault_addr = storage::get_address(&env, DataKey::Vault)?;
        let vault_client = VaultClient::new(&env, &vault_addr);
        if vault_client.balance_of(&current_contract) != 0 {
            return Err(NovaireIntentError::InvariantViolated);
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, token, Address, Env};
    
    use sy_wrapper::{SyWrapper, SyWrapperClient as RealSyWrapperClient};
    use pt_token::{PtToken, PtTokenClient as RealPtClient};
    use yt_token::{YtToken, YtTokenClient as RealYtClient};
    use vault::{Vault, VaultClient as RealVaultClient};
    use tokenizer::{Tokenizer, TokenizerClient as RealTokenizerClient};
    use marketplace::{NovaireMarketplace, NovaireMarketplaceClient as RealMarketplaceClient};

    fn setup_env() -> (Env, Address, Address, IntentEngineClient<'static>, RealMarketplaceClient<'static>, RealPtClient<'static>, RealYtClient<'static>, token::StellarAssetClient<'static>, token::Client<'static>) {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();

        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let underlying_token = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
        let token_admin_client = token::StellarAssetClient::new(&env, &underlying_token);
        let underlying_client = token::Client::new(&env, &underlying_token);

        let sy_contract_id = env.register(SyWrapper, ());
        let sy_client = RealSyWrapperClient::new(&env, &sy_contract_id);

        let vault_contract_id = env.register(Vault, ());
        let vault_client = RealVaultClient::new(&env, &vault_contract_id);
        
        sy_client.initialize(&admin, &underlying_token, &vault_contract_id);
        vault_client.initialize(&admin, &sy_contract_id, &underlying_token);

        let pt_contract_id = env.register(PtToken, ());
        let pt_client = RealPtClient::new(&env, &pt_contract_id);

        let yt_contract_id = env.register(YtToken, ());
        let yt_client = RealYtClient::new(&env, &yt_contract_id);

        let maturity_ledger = 1_000;
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 0,
            ..env.ledger().get()
        });

        let tokenizer_contract_id = env.register(Tokenizer, ());
        let tokenizer_client = RealTokenizerClient::new(&env, &tokenizer_contract_id);
        
        pt_client.initialize(&admin, &tokenizer_contract_id);
        yt_client.initialize(&admin, &tokenizer_contract_id, &maturity_ledger, &sy_contract_id);
        
        tokenizer_client.initialize(&admin, &vault_contract_id, &pt_contract_id, &yt_contract_id, &sy_contract_id, &maturity_ledger);

        let market_contract_id = env.register(NovaireMarketplace, ());
        let market_client = RealMarketplaceClient::new(&env, &market_contract_id);
        market_client.initialize(&admin, &pt_contract_id, &yt_contract_id, &underlying_token, &sy_contract_id, &tokenizer_contract_id, &maturity_ledger);

        // Seed liquidity
        let lp_provider = Address::generate(&env);
        token_admin_client.mint(&lp_provider, &3_100_000); // 3.1M USDC
        vault_client.deposit(&lp_provider, &2_000_000);
        let sy_bal = vault_client.balance_of(&lp_provider);
        tokenizer_client.mint_pt_yt(&lp_provider, &sy_bal);
        market_client.add_liquidity(&lp_provider, &1_000_000, &900_000); // 1M PT, 1.1M U

        let intent_engine_contract_id = env.register(IntentEngine, ());
        let intent_engine_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
        
        intent_engine_client.initialize(
            &admin,
            &vault_contract_id,
            &tokenizer_contract_id,
            &market_contract_id,
            &sy_contract_id,
            &underlying_token,
            &pt_contract_id,
            &yt_contract_id,
        );

        (env, admin, underlying_token, intent_engine_client, market_client, pt_client, yt_client, token_admin_client, underlying_client)
    }

    #[test]
    fn test_fixed_yield_intent() {
        let (env, _, _, intent_engine, _, pt_client, _, token_admin, underlying) = setup_env();
        let user = Address::generate(&env);
        token_admin.mint(&user, &10_000);

        let current_twap = intent_engine.get_current_best_rate();
        
        let record = intent_engine.execute_fixed_yield_intent(&user, &10_000, &current_twap, &0, &1000, &100);
        
        assert_eq!(record.total_deposited_amount, 10_000);
        assert_eq!(pt_client.balance(&user), record.total_pt_held); // Received PT
        assert!(underlying.balance(&user) > 0); // Received U back from sold YT
        assert_eq!(underlying.balance(&intent_engine.address), 0); // Contract holds nothing
        assert_eq!(pt_client.balance(&intent_engine.address), 0);
    }

    #[test]
    fn test_yield_speculation() {
        let (env, _, _, intent_engine, _, pt_client, yt_client, token_admin, underlying) = setup_env();
        let user = Address::generate(&env);
        token_admin.mint(&user, &10_000);

        let yt_received = intent_engine.execute_yield_speculation_intent(&user, &10_000, &1, &0);
        
        assert!(yt_received > 0);
        assert_eq!(yt_client.balance(&user), yt_received);
        assert!(underlying.balance(&user) > 0); // Received U back from sold PT
        assert_eq!(underlying.balance(&intent_engine.address), 0); // Contract holds nothing
        assert_eq!(pt_client.balance(&intent_engine.address), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_rate_slippage() {
        let (env, _, _, intent_engine, _, _, _, token_admin, _) = setup_env();
        let user = Address::generate(&env);
        token_admin.mint(&user, &10_000);

        let imp_rate = 2_000_000_000; // Impossible rate
        intent_engine.execute_fixed_yield_intent(&user, &10_000, &imp_rate, &0, &1000, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_paused() {
        let (env, _admin, _, intent_engine, _, _, _, token_admin, _) = setup_env();
        let user = Address::generate(&env);
        token_admin.mint(&user, &10_000);

        intent_engine.pause();

        intent_engine.execute_fixed_yield_intent(&user, &10_000, &1, &0, &1000, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_zero_amount() {
        let (env, _, _, intent_engine, _, _, _, _, _) = setup_env();
        let user = Address::generate(&env);
        intent_engine.execute_fixed_yield_intent(&user, &0, &1, &0, &1000, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_intent_failed_slippage() {
        let (env, _, _, intent_engine, _, _, _, token_admin, _) = setup_env();
        let user = Address::generate(&env);
        token_admin.mint(&user, &10_000);
        // Ask for 1,000,000 YT which is impossible with 10k deposit
        intent_engine.execute_yield_speculation_intent(&user, &10_000, &1_000_000, &0);
    }
}
