#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env, Symbol, IntoVal};

#[soroban_sdk::contractclient(name = "SyWrapperClient")]
pub trait SyWrapperInterface {
    fn deposit(env: Env, from: Address, amount: i128) -> i128;
    fn withdraw(env: Env, from: Address, shares: i128) -> i128;
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NovaireVaultError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    Paused = 4,
    InvalidAmount = 5,
    InsufficientShares = 6,
    MathOverflow = 7,
    MathUnderflow = 8,
    StorageMissing = 9,
    InvalidAdminTransfer = 10,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    PendingAdmin,
    Underlying,
    SyWrapper,
    TotalVaultShares,
    Paused,
    UserShares(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultMetadata {
    pub admin: Address,
    pub pending_admin: Option<Address>,
    pub sy_wrapper: Address,
    pub underlying: Address,
    pub total_vault_shares: i128,
    pub is_paused: bool,
    pub version: u32,
}

const VERSION: u32 = 1;

mod storage {
    use super::*;

    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn get_admin(env: &Env) -> Result<Address, NovaireVaultError> {
        env.storage().instance().get(&DataKey::Admin).ok_or(NovaireVaultError::StorageMissing)
    }
    
    pub fn get_pending_admin(env: &Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingAdmin)
    }

    pub fn get_sy_wrapper(env: &Env) -> Result<Address, NovaireVaultError> {
        env.storage().instance().get(&DataKey::SyWrapper).ok_or(NovaireVaultError::StorageMissing)
    }

    pub fn get_underlying(env: &Env) -> Result<Address, NovaireVaultError> {
        env.storage().instance().get(&DataKey::Underlying).ok_or(NovaireVaultError::StorageMissing)
    }

    pub fn get_total_vault_shares(env: &Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalVaultShares).unwrap_or(0)
    }

    pub fn set_total_vault_shares(env: &Env, shares: i128) {
        env.storage().instance().set(&DataKey::TotalVaultShares, &shares);
    }

    pub fn get_user_shares(env: &Env, user: &Address) -> i128 {
        env.storage().persistent().get(&DataKey::UserShares(user.clone())).unwrap_or(0)
    }

    pub fn set_user_shares(env: &Env, user: &Address, shares: i128) {
        env.storage().persistent().set(&DataKey::UserShares(user.clone()), &shares);
    }

    pub fn is_paused(env: &Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    pub fn require_not_paused(env: &Env) -> Result<(), NovaireVaultError> {
        if is_paused(env) {
            return Err(NovaireVaultError::Paused);
        }
        Ok(())
    }
}

#[contract]
pub struct Vault;

#[contractimpl]
impl Vault {
    // ==========================================
    // INITIALIZATION
    // ==========================================

    /// Initializes the Novaire Yield Vault.
    ///
    /// # Arguments
    /// * `admin` - The address of the protocol administrator.
    /// * `sy_wrapper` - The address of the hardened SY Wrapper contract.
    /// * `underlying` - The address of the underlying asset token (e.g., USDC).
    ///
    /// # Errors
    /// Returns `AlreadyInitialized` if called more than once.
    pub fn initialize(
        env: Env,
        admin: Address,
        sy_wrapper: Address,
        underlying: Address,
    ) -> Result<(), NovaireVaultError> {
        if storage::is_initialized(&env) {
            return Err(NovaireVaultError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::SyWrapper, &sy_wrapper);
        env.storage().instance().set(&DataKey::Underlying, &underlying);
        storage::set_total_vault_shares(&env, 0i128);
        env.storage().instance().set(&DataKey::Paused, &false);

        Ok(())
    }

    // ==========================================
    // USER FUNCTIONS
    // ==========================================

    /// Deposits underlying tokens into the Vault and mints Vault shares to the depositor.
    /// 
    /// Internally transfers the underlying tokens to the Vault, and then deposits them 
    /// directly into the downstream SY Wrapper.
    ///
    /// # Arguments
    /// * `depositor` - The address initiating the deposit (requires auth).
    /// * `amount` - The amount of underlying tokens to deposit.
    ///
    /// # Returns
    /// The exact amount of Vault shares (1:1 with SY shares) minted to the depositor.
    ///
    /// # Errors
    /// Returns `Paused`, `InvalidAmount`, `StorageMissing`, or `MathOverflow`.
    pub fn deposit(env: Env, depositor: Address, amount: i128) -> Result<i128, NovaireVaultError> {
        depositor.require_auth();
        storage::require_not_paused(&env)?;

        if amount <= 0 {
            return Err(NovaireVaultError::InvalidAmount);
        }

        let underlying_addr = storage::get_underlying(&env)?;
        let sy_wrapper_addr = storage::get_sy_wrapper(&env)?;
        let mut total_vault_shares = storage::get_total_vault_shares(&env);

        // 1. Pull underlying from depositor to Vault
        let token_client = token::Client::new(&env, &underlying_addr);
        token_client.transfer(&depositor, &env.current_contract_address(), &amount);

        // 2. Vault deposits underlying into SY Wrapper
        let sy_client = SyWrapperClient::new(&env, &sy_wrapper_addr);
        env.authorize_as_current_contract(soroban_sdk::vec![
            &env,
            soroban_sdk::auth::InvokerContractAuthEntry::Contract(
                soroban_sdk::auth::SubContractInvocation {
                    context: soroban_sdk::auth::ContractContext {
                        contract: underlying_addr.clone(),
                        fn_name: soroban_sdk::Symbol::new(&env, "transfer"),
                        args: soroban_sdk::vec![
                            &env,
                            env.current_contract_address().into_val(&env),
                            sy_wrapper_addr.clone().into_val(&env),
                            amount.into_val(&env),
                        ],
                    },
                    sub_invocations: soroban_sdk::vec![&env],
                }
            )
        ]);
        let sy_shares = sy_client.deposit(&env.current_contract_address(), &amount);

        // 3. Update user's vault share balance
        let mut current_user_shares = storage::get_user_shares(&env, &depositor);
        current_user_shares = current_user_shares.checked_add(sy_shares).ok_or(NovaireVaultError::MathOverflow)?;
        storage::set_user_shares(&env, &depositor, current_user_shares);

        // 4. Update total vault shares
        total_vault_shares = total_vault_shares.checked_add(sy_shares).ok_or(NovaireVaultError::MathOverflow)?;
        storage::set_total_vault_shares(&env, total_vault_shares);

        // Emit Event
        env.events().publish(
            (Symbol::new(&env, "vault_deposit"), depositor),
            (amount, sy_shares, total_vault_shares)
        );

        Ok(sy_shares)
    }

    /// Withdraws underlying tokens by burning Vault shares.
    ///
    /// Internally withdraws from the downstream SY Wrapper and transfers 
    /// the underlying tokens back to the withdrawer.
    ///
    /// # Arguments
    /// * `withdrawer` - The address initiating the withdrawal (requires auth).
    /// * `shares` - The amount of Vault shares to burn.
    ///
    /// # Returns
    /// The exact amount of underlying tokens returned to the withdrawer.
    ///
    /// # Errors
    /// Returns `Paused`, `InvalidAmount`, `InsufficientShares`, `StorageMissing`, or `MathUnderflow`.
    pub fn withdraw(env: Env, withdrawer: Address, shares: i128) -> Result<i128, NovaireVaultError> {
        withdrawer.require_auth();
        storage::require_not_paused(&env)?;

        if shares <= 0 {
            return Err(NovaireVaultError::InvalidAmount);
        }

        let underlying_addr = storage::get_underlying(&env)?;
        let sy_wrapper_addr = storage::get_sy_wrapper(&env)?;
        let mut total_vault_shares = storage::get_total_vault_shares(&env);

        let mut current_user_shares = storage::get_user_shares(&env, &withdrawer);

        if current_user_shares < shares {
            return Err(NovaireVaultError::InsufficientShares);
        }

        // Deduct shares FIRST to prevent reentrancy / underflow
        current_user_shares = current_user_shares.checked_sub(shares).ok_or(NovaireVaultError::MathUnderflow)?;
        storage::set_user_shares(&env, &withdrawer, current_user_shares);

        // Withdraw from SY Wrapper
        let sy_client = SyWrapperClient::new(&env, &sy_wrapper_addr);
        let underlying_amount = sy_client.withdraw(&env.current_contract_address(), &shares);

        // Transfer underlying back to withdrawer
        let token_client = token::Client::new(&env, &underlying_addr);
        token_client.transfer(&env.current_contract_address(), &withdrawer, &underlying_amount);

        // Update total vault shares
        total_vault_shares = total_vault_shares.checked_sub(shares).ok_or(NovaireVaultError::MathUnderflow)?;
        storage::set_total_vault_shares(&env, total_vault_shares);

        // Emit Event
        env.events().publish(
            (Symbol::new(&env, "vault_withdraw"), withdrawer),
            (shares, underlying_amount, total_vault_shares)
        );

        Ok(underlying_amount)
    }

    /// Transfers Vault shares directly to another address.
    ///
    /// # Arguments
    /// * `from` - The address sending the shares (requires auth).
    /// * `to` - The address receiving the shares.
    /// * `amount` - The amount of shares to transfer.
    ///
    /// # Errors
    /// Returns `Paused`, `InvalidAmount`, `InsufficientShares`, `MathOverflow`, or `MathUnderflow`.
    pub fn transfer_shares(env: Env, from: Address, to: Address, amount: i128) -> Result<(), NovaireVaultError> {
        from.require_auth();
        storage::require_not_paused(&env)?;

        if amount <= 0 {
            return Err(NovaireVaultError::InvalidAmount);
        }
        
        let mut from_shares = storage::get_user_shares(&env, &from);
        if from_shares < amount {
            return Err(NovaireVaultError::InsufficientShares);
        }
        from_shares = from_shares.checked_sub(amount).ok_or(NovaireVaultError::MathUnderflow)?;
        storage::set_user_shares(&env, &from, from_shares);
        
        let mut to_shares = storage::get_user_shares(&env, &to);
        to_shares = to_shares.checked_add(amount).ok_or(NovaireVaultError::MathOverflow)?;
        storage::set_user_shares(&env, &to, to_shares);

        // Emit Event
        env.events().publish(
            (Symbol::new(&env, "vault_transfer"), from, to),
            amount
        );
        
        Ok(())
    }

    /// Withdraws underlying tokens by burning Vault shares, but sends the tokens to a specific receiver.
    ///
    /// # Arguments
    /// * `withdrawer` - The address initiating the withdrawal (requires auth).
    /// * `receiver` - The address that will receive the underlying tokens.
    /// * `shares` - The amount of Vault shares to burn.
    ///
    /// # Returns
    /// The exact amount of underlying tokens returned to the receiver.
    ///
    /// # Errors
    /// Returns `Paused`, `InvalidAmount`, `InsufficientShares`, `StorageMissing`, or `MathUnderflow`.
    pub fn withdraw_for(env: Env, withdrawer: Address, receiver: Address, shares: i128) -> Result<i128, NovaireVaultError> {
        withdrawer.require_auth();
        storage::require_not_paused(&env)?;

        if shares <= 0 {
            return Err(NovaireVaultError::InvalidAmount);
        }

        let underlying_addr = storage::get_underlying(&env)?;
        let sy_wrapper_addr = storage::get_sy_wrapper(&env)?;
        let mut total_vault_shares = storage::get_total_vault_shares(&env);

        let mut current_user_shares = storage::get_user_shares(&env, &withdrawer);

        if current_user_shares < shares {
            return Err(NovaireVaultError::InsufficientShares);
        }

        // Deduct shares FIRST
        current_user_shares = current_user_shares.checked_sub(shares).ok_or(NovaireVaultError::MathUnderflow)?;
        storage::set_user_shares(&env, &withdrawer, current_user_shares);

        // Withdraw from SY Wrapper
        let sy_client = SyWrapperClient::new(&env, &sy_wrapper_addr);
        let underlying_amount = sy_client.withdraw(&env.current_contract_address(), &shares);

        // Transfer underlying to the receiver
        let token_client = token::Client::new(&env, &underlying_addr);
        token_client.transfer(&env.current_contract_address(), &receiver, &underlying_amount);

        // Update total vault shares
        total_vault_shares = total_vault_shares.checked_sub(shares).ok_or(NovaireVaultError::MathUnderflow)?;
        storage::set_total_vault_shares(&env, total_vault_shares);

        // Emit Event
        env.events().publish(
            (Symbol::new(&env, "vault_withdraw_for"), withdrawer, receiver),
            (shares, underlying_amount, total_vault_shares)
        );

        Ok(underlying_amount)
    }

    // ==========================================
    // ADMIN FUNCTIONS
    // ==========================================

    /// Pauses the Vault, freezing all deposits, withdrawals, and share transfers.
    ///
    /// # Arguments
    /// * `env` - The environment.
    ///
    /// # Errors
    /// Returns `StorageMissing` if not initialized, traps if caller is not admin.
    pub fn pause(env: Env) -> Result<(), NovaireVaultError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        
        env.events().publish((Symbol::new(&env, "vault_paused"), admin), env.ledger().sequence());
        Ok(())
    }

    /// Unpauses the Vault, restoring normal operations.
    pub fn unpause(env: Env) -> Result<(), NovaireVaultError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);

        env.events().publish((Symbol::new(&env, "vault_unpaused"), admin), env.ledger().sequence());
        Ok(())
    }

    /// Initiates a two-step admin transfer to a new address.
    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), NovaireVaultError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::PendingAdmin, &new_admin);

        env.events().publish((Symbol::new(&env, "vault_admin_transfer"), admin), new_admin);
        Ok(())
    }

    /// Accepts a pending admin transfer, finalizing the change of administration.
    pub fn accept_admin(env: Env) -> Result<(), NovaireVaultError> {
        let pending_admin: Address = storage::get_pending_admin(&env).ok_or(NovaireVaultError::InvalidAdminTransfer)?;
        pending_admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &pending_admin);
        env.storage().instance().remove(&DataKey::PendingAdmin);

        env.events().publish((Symbol::new(&env, "vault_admin_accepted"),), pending_admin);
        Ok(())
    }

    // ==========================================
    // VIEW FUNCTIONS
    // ==========================================

    /// Returns the current protocol version.
    pub fn version() -> u32 {
        VERSION
    }

    /// Returns a comprehensive struct containing the Vault's current configuration and health metadata.
    pub fn metadata(env: Env) -> Result<VaultMetadata, NovaireVaultError> {
        Ok(VaultMetadata {
            admin: storage::get_admin(&env)?,
            pending_admin: storage::get_pending_admin(&env),
            sy_wrapper: storage::get_sy_wrapper(&env)?,
            underlying: storage::get_underlying(&env)?,
            total_vault_shares: storage::get_total_vault_shares(&env),
            is_paused: storage::is_paused(&env),
            version: VERSION,
        })
    }

    /// Returns true if the Vault is currently paused.
    pub fn is_paused(env: Env) -> bool {
        storage::is_paused(&env)
    }

    /// Returns the exact share balance of a specific user.
    pub fn balance_of(env: Env, user: Address) -> i128 {
        storage::get_user_shares(&env, &user)
    }

    /// Returns the total amount of Vault shares in circulation.
    pub fn total_vault_shares(env: Env) -> i128 {
        storage::get_total_vault_shares(&env)
    }

    /// Returns the downstream SY Wrapper Address.
    pub fn get_sy_wrapper(env: Env) -> Result<Address, NovaireVaultError> {
        storage::get_sy_wrapper(&env)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, Env};
    use sy_wrapper::{SyWrapper, SyWrapperClient as OriginalSyWrapperClient};

    #[test]
    fn test_vault_flow() {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();

        // 1. Setup Addresses
        let admin = Address::generate(&env);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let yield_source = Address::generate(&env);

        // 2. Setup Mock Token
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
        let token_client = token::Client::new(&env, &token_contract);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract);

        // Mint initial balances
        token_admin_client.mint(&alice, &2000);
        token_admin_client.mint(&bob, &2000);

        // 3. Deploy and Initialize SY Wrapper
        let sy_contract_id = env.register(SyWrapper, ());
        let sy_client = OriginalSyWrapperClient::new(&env, &sy_contract_id);
        sy_client.initialize(&admin, &token_contract, &yield_source);

        // 4. Deploy and Initialize Vault
        let vault_contract_id = env.register(Vault, ());
        let vault_client = VaultClient::new(&env, &vault_contract_id);
        vault_client.initialize(&admin, &sy_contract_id, &token_contract);

        // 5. Alice deposits 2000 USDC
        let alice_shares = vault_client.deposit(&alice, &2000);
        assert_eq!(alice_shares, 1000);
        assert_eq!(vault_client.balance_of(&alice), 1000);
        assert_eq!(vault_client.total_vault_shares(), 1000);
        
        // 6. Bob deposits 2000 USDC
        let bob_shares = vault_client.deposit(&bob, &2000);
        assert_eq!(bob_shares, 2000);
        assert_eq!(vault_client.balance_of(&bob), 2000);
        assert_eq!(vault_client.total_vault_shares(), 3000);
        
        // 7. Accrue yield on SY Wrapper
        token_admin_client.mint(&sy_contract_id, &400); // 10% yield on 4000
        sy_client.harvest_yield();
        
        // 8. Bob withdraws all shares -> receives 2200 underlying (2000 * 1.1)
        let bob_returned = vault_client.withdraw(&bob, &bob_shares);
        assert_eq!(bob_returned, 2200);
        assert_eq!(vault_client.balance_of(&bob), 0);
        assert_eq!(token_client.balance(&bob), 2200);
        assert_eq!(vault_client.total_vault_shares(), 1000);
        
        // 9. Test pause functionality
        vault_client.pause();
        
        // Next deposit should fail because of pause
        let deposit_res = vault_client.try_deposit(&alice, &10);
        assert!(deposit_res.is_err());
        
        // Unpause and verify it works again
        vault_client.unpause();
        token_admin_client.mint(&alice, &10);
        let alice_shares_2 = vault_client.deposit(&alice, &10);
        assert_eq!(alice_shares_2, 9); // 10 * 1e9 / 1.1e9 = 9 shares
        
        // Test metadata
        let md = vault_client.metadata();
        assert_eq!(md.total_vault_shares, 1009);
        assert!(!md.is_paused);
    }
}
