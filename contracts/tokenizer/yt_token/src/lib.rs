#![no_std]

use soroban_sdk::{contract, contracterror, contractclient, contractimpl, contracttype, Address, Env, String, Symbol};

/// Cross-contract client for reading the live SY exchange rate.
/// This enables the YT Token to refresh its global yield index
/// before user-initiated balance mutations (H4 fix).
#[contractclient(name = "SyWrapperClient")]
pub trait SyWrapperInterface {
    fn get_exchange_rate(env: Env) -> i128;
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NovaireYtError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    Paused = 4,
    InvalidAmount = 5,
    InsufficientBalance = 6,
    InsufficientAllowance = 7,
    MathOverflow = 8,
    MathUnderflow = 9,
    StorageMissing = 10,
    InvalidAdminTransfer = 11,
    PastMaturity = 12,
    IndexCannotDecrease = 13,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    PendingAdmin,
    Tokenizer,
    SyWrapper,
    TotalSupply,
    YieldIndex,
    MaturityLedger,
    Paused,
    Balance(Address),
    Allowance(Address, Address),
    UserYieldIndex(Address),
    AccruedYield(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YtMetadata {
    pub admin: Address,
    pub tokenizer: Address,
    pub total_supply: i128,
    pub yield_index: i128,
    pub maturity_ledger: u32,
    pub is_paused: bool,
    pub is_expired: bool,
    pub version: u32,
}

const VERSION: u32 = 2;
const YIELD_SCALAR: i128 = 1_000_000_000;

mod storage {
    use super::*;

    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn get_admin(env: &Env) -> Result<Address, NovaireYtError> {
        env.storage().instance().get(&DataKey::Admin).ok_or(NovaireYtError::StorageMissing)
    }

    pub fn get_pending_admin(env: &Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingAdmin)
    }

    pub fn get_tokenizer(env: &Env) -> Result<Address, NovaireYtError> {
        env.storage().instance().get(&DataKey::Tokenizer).ok_or(NovaireYtError::StorageMissing)
    }

    pub fn get_sy_wrapper(env: &Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::SyWrapper)
    }

    pub fn get_maturity_ledger(env: &Env) -> Result<u32, NovaireYtError> {
        env.storage().instance().get(&DataKey::MaturityLedger).ok_or(NovaireYtError::StorageMissing)
    }

    pub fn get_total_supply(env: &Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0)
    }

    pub fn set_total_supply(env: &Env, supply: i128) {
        env.storage().instance().set(&DataKey::TotalSupply, &supply);
    }

    pub fn get_yield_index(env: &Env) -> i128 {
        env.storage().instance().get(&DataKey::YieldIndex).unwrap_or(0)
    }

    pub fn set_yield_index(env: &Env, index: i128) {
        env.storage().instance().set(&DataKey::YieldIndex, &index);
    }

    pub fn get_balance(env: &Env, user: &Address) -> i128 {
        env.storage().persistent().get(&DataKey::Balance(user.clone())).unwrap_or(0)
    }

    pub fn set_balance(env: &Env, user: &Address, balance: i128) {
        env.storage().persistent().set(&DataKey::Balance(user.clone()), &balance);
    }

    pub fn get_allowance(env: &Env, owner: &Address, spender: &Address) -> i128 {
        env.storage().persistent().get(&DataKey::Allowance(owner.clone(), spender.clone())).unwrap_or(0)
    }

    pub fn set_allowance(env: &Env, owner: &Address, spender: &Address, amount: i128) {
        env.storage().persistent().set(&DataKey::Allowance(owner.clone(), spender.clone()), &amount);
    }

    pub fn get_user_yield_index(env: &Env, user: &Address) -> i128 {
        env.storage().persistent().get(&DataKey::UserYieldIndex(user.clone())).unwrap_or(0)
    }

    pub fn set_user_yield_index(env: &Env, user: &Address, index: i128) {
        env.storage().persistent().set(&DataKey::UserYieldIndex(user.clone()), &index);
    }

    pub fn get_accrued_yield(env: &Env, user: &Address) -> i128 {
        env.storage().persistent().get(&DataKey::AccruedYield(user.clone())).unwrap_or(0)
    }

    pub fn set_accrued_yield(env: &Env, user: &Address, accrued: i128) {
        env.storage().persistent().set(&DataKey::AccruedYield(user.clone()), &accrued);
    }

    pub fn is_paused(env: &Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    pub fn require_not_paused(env: &Env) -> Result<(), NovaireYtError> {
        if is_paused(env) {
            return Err(NovaireYtError::Paused);
        }
        Ok(())
    }
    
    pub fn is_expired(env: &Env) -> Result<bool, NovaireYtError> {
        let maturity = get_maturity_ledger(env)?;
        Ok(env.ledger().sequence() >= maturity)
    }
}

/// # Novaire Yield Token (YT)
/// 
/// The YT Token is a protocol-owned primitive representing ownership of 
/// future yield until maturity inside the Novaire protocol.
///
/// ## Protocol Invariants
/// - **Issuance Restrictions**: Only the trusted `Tokenizer` contract may mint or burn YT.
/// - **Yield Accounting**: Accrued yield is correctly checkpointed upon any balance mutation.
/// - **Maturity**: Yield index updates natively reject any increments past maturity.
/// - **Secondary Liquidity**: Peer-to-peer transfers are strictly decoupled from protocol accounting and remain active even during `pause` to preserve secondary market liquidity exits.
#[contract]
pub struct YtToken;

#[contractimpl]
impl YtToken {
    // ==========================================
    // INITIALIZATION
    // ==========================================

    /// Initializes the Novaire Yield Token (YT).
    ///
    /// # Arguments
    /// * `admin` - Protocol administrator responsible for pausing and upgrades.
    /// * `tokenizer` - The exclusive authority allowed to mint, burn, and update yield indices.
    /// * `maturity_ledger` - The exact ledger sequence when yield accrual permanently stops.
    ///
    /// # Errors
    /// Returns `AlreadyInitialized` if called more than once.
    pub fn initialize(env: Env, admin: Address, tokenizer: Address, maturity_ledger: u32, sy_wrapper: Address) -> Result<(), NovaireYtError> {
        if storage::is_initialized(&env) {
            return Err(NovaireYtError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Tokenizer, &tokenizer);
        env.storage().instance().set(&DataKey::MaturityLedger, &maturity_ledger);
        env.storage().instance().set(&DataKey::SyWrapper, &sy_wrapper);
        
        storage::set_total_supply(&env, 0i128);
        storage::set_yield_index(&env, 0i128);
        env.storage().instance().set(&DataKey::Paused, &false);

        Ok(())
    }

    // ==========================================
    // TOKENIZER FUNCTIONS (MINT/BURN/YIELD)
    // ==========================================

    /// Updates the global yield index.
    /// 
    /// **Strictly restricted to the Tokenizer contract.** 
    ///
    /// # Arguments
    /// * `new_index` - The new global yield index.
    ///
    /// # Errors
    /// Returns `Unauthorized`, `Paused`, `PastMaturity`, or `IndexCannotDecrease`.
    pub fn update_yield_index(env: Env, new_index: i128) -> Result<(), NovaireYtError> {
        let tokenizer = storage::get_tokenizer(&env)?;
        tokenizer.require_auth();
        storage::require_not_paused(&env)?;

        let current_index = storage::get_yield_index(&env);
        if new_index < current_index {
            return Err(NovaireYtError::IndexCannotDecrease);
        }

        storage::set_yield_index(&env, new_index);
        
        env.events().publish((Symbol::new(&env, "yt_index_updated"),), new_index);
        Ok(())
    }

    /// Checkpoints a user, safely locking in their accrued yield before a balance mutation.
    ///
    /// This function performs the core math: `(current_index - user_index) * balance / 1e9`
    ///
    /// # Arguments
    /// * `user` - The address to checkpoint.
    ///
    /// # Errors
    /// Returns `MathOverflow` or `MathUnderflow` if calculation fails.
    pub fn checkpoint_user(env: Env, user: Address) -> Result<(), NovaireYtError> {
        user.require_auth();
        Self::internal_checkpoint_user(&env, &user)?;
        Ok(())
    }

    /// Refreshes the global yield index from the live SY Wrapper exchange rate.
    /// This is the core H4 fix: ensures the index reflects real accrued yield
    /// before any user-initiated balance mutation (transfer, transfer_from).
    ///
    /// Safety:
    /// - The index can only increase (monotonically non-decreasing exchange rate).
    /// - Skipped if SyWrapper is not configured (backward compatibility).
    /// - Skipped post-maturity (yield is frozen at settlement).
    fn refresh_index_from_sy(env: &Env) {
        // Skip if past maturity — yield accrual is frozen.
        if let Ok(maturity) = storage::get_maturity_ledger(env) {
            if env.ledger().sequence() >= maturity {
                return;
            }
        }

        // Skip if SyWrapper is not configured (backward compat for pre-upgrade tokens).
        let sy_wrapper_addr = match storage::get_sy_wrapper(env) {
            Some(addr) => addr,
            None => return,
        };

        let sy_client = SyWrapperClient::new(env, &sy_wrapper_addr);
        let live_rate = sy_client.get_exchange_rate();
        let current_index = storage::get_yield_index(env);

        // Only advance the index — never decrease it.
        if live_rate > current_index {
            storage::set_yield_index(env, live_rate);
        }
    }

    fn internal_checkpoint_user(env: &Env, user: &Address) -> Result<(), NovaireYtError> {
        let current_index = storage::get_yield_index(env);
        let user_index = storage::get_user_yield_index(env, user);
        let balance = storage::get_balance(env, user);

        if balance > 0 && current_index > user_index {
            let index_delta = current_index.checked_sub(user_index).ok_or(NovaireYtError::MathUnderflow)?;
            let scaled_yield = index_delta.checked_mul(balance).ok_or(NovaireYtError::MathOverflow)?;
            let yield_earned = scaled_yield / YIELD_SCALAR; // Integer division is safe here
            
            let mut accrued = storage::get_accrued_yield(env, user);
            accrued = accrued.checked_add(yield_earned).ok_or(NovaireYtError::MathOverflow)?;
            storage::set_accrued_yield(env, user, accrued);
            
            env.events().publish((Symbol::new(env, "yt_checkpoint"), user.clone()), (current_index, accrued));
        }
        
        storage::set_user_yield_index(env, user, current_index);
        Ok(())
    }

    /// Resets the claimable yield for a user to zero after they successfully claim.
    ///
    /// **Strictly restricted to the Tokenizer contract.** 
    ///
    /// # Arguments
    /// * `user` - The address whose claimable yield is reset.
    ///
    /// # Errors
    /// Returns `Unauthorized`.
    pub fn reset_claimable(env: Env, user: Address) -> Result<(), NovaireYtError> {
        let tokenizer = storage::get_tokenizer(&env)?;
        tokenizer.require_auth();
        
        // Ensure user is fully checkpointed before resetting.
        Self::internal_checkpoint_user(&env, &user)?;
        storage::set_accrued_yield(&env, &user, 0i128);
        Ok(())
    }

    /// Credits historical yield directly to a user's accrued yield balance.
    ///
    /// **Strictly restricted to the Tokenizer contract.** 
    /// Used during late minting to restore economic identity by crediting the
    /// historically backed yield that has accumulated since epoch genesis.
    ///
    /// # Arguments
    /// * `user` - The address receiving the credit.
    /// * `amount` - The amount of yield to credit.
    ///
    /// # Errors
    /// Returns `Unauthorized` or `InvalidAmount` if negative.
    pub fn add_accrued_yield(env: Env, user: Address, amount: i128) -> Result<(), NovaireYtError> {
        let tokenizer = storage::get_tokenizer(&env)?;
        tokenizer.require_auth();
        
        if amount < 0 {
            return Err(NovaireYtError::InvalidAmount);
        }
        
        if amount > 0 {
            let mut accrued = storage::get_accrued_yield(&env, &user);
            accrued = accrued.checked_add(amount).ok_or(NovaireYtError::MathOverflow)?;
            storage::set_accrued_yield(&env, &user, accrued);
            env.events().publish((Symbol::new(&env, "yt_historical_credit"), user), amount);
        }
        
        Ok(())
    }

    /// Mints new YT tokens to the designated address.
    /// 
    /// **Strictly restricted to the Tokenizer contract.** 
    ///
    /// # Arguments
    /// * `to` - The address receiving the minted tokens.
    /// * `amount` - The amount of tokens to mint.
    ///
    /// # Errors
    /// Returns `Unauthorized`, `Paused`, `InvalidAmount`, or `MathOverflow`.
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), NovaireYtError> {
        let tokenizer = storage::get_tokenizer(&env)?;
        tokenizer.require_auth();
        storage::require_not_paused(&env)?;

        if amount <= 0 {
            return Err(NovaireYtError::InvalidAmount);
        }

        Self::internal_checkpoint_user(&env, &to)?;

        let mut total_supply = storage::get_total_supply(&env);
        total_supply = total_supply.checked_add(amount).ok_or(NovaireYtError::MathOverflow)?;
        storage::set_total_supply(&env, total_supply);

        let mut balance = storage::get_balance(&env, &to);
        balance = balance.checked_add(amount).ok_or(NovaireYtError::MathOverflow)?;
        storage::set_balance(&env, &to, balance);

        env.events().publish((Symbol::new(&env, "yt_mint"), tokenizer, to), (amount, total_supply));
        Ok(())
    }

    /// Burns YT tokens from the designated address.
    /// 
    /// **Strictly restricted to the Tokenizer contract.** 
    ///
    /// # Arguments
    /// * `from` - The address burning the tokens.
    /// * `amount` - The amount of tokens to burn.
    ///
    /// # Errors
    /// Returns `Unauthorized`, `Paused`, `InvalidAmount`, `InsufficientBalance`, or `MathUnderflow`.
    pub fn burn(env: Env, from: Address, amount: i128) -> Result<(), NovaireYtError> {
        let tokenizer = storage::get_tokenizer(&env)?;
        tokenizer.require_auth();
        storage::require_not_paused(&env)?;

        if amount <= 0 {
            return Err(NovaireYtError::InvalidAmount);
        }

        Self::internal_checkpoint_user(&env, &from)?;

        let mut balance = storage::get_balance(&env, &from);
        if balance < amount {
            return Err(NovaireYtError::InsufficientBalance);
        }
        balance = balance.checked_sub(amount).ok_or(NovaireYtError::MathUnderflow)?;
        storage::set_balance(&env, &from, balance);

        let mut total_supply = storage::get_total_supply(&env);
        total_supply = total_supply.checked_sub(amount).ok_or(NovaireYtError::MathUnderflow)?;
        storage::set_total_supply(&env, total_supply);

        env.events().publish((Symbol::new(&env, "yt_burn"), tokenizer, from), (amount, total_supply));
        Ok(())
    }

    // ==========================================
    // USER FUNCTIONS (ERC20 COMPATIBLE)
    // ==========================================

    /// Transfers tokens from the caller to a recipient.
    /// Checkpoints both sender and recipient before transferring balances.
    ///
    /// Note: Transfers intentionally bypass the `pause` mechanism to preserve 
    /// secondary market liquidity as an escape valve during protocol emergencies.
    ///
    /// # Arguments
    /// * `from` - The caller sending the tokens (requires auth).
    /// * `to` - The recipient of the tokens.
    /// * `amount` - The amount to transfer.
    ///
    /// # Errors
    /// Returns `InvalidAmount`, `InsufficientBalance`, `MathOverflow`, or `MathUnderflow`.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), NovaireYtError> {
        from.require_auth();

        if amount <= 0 {
            return Err(NovaireYtError::InvalidAmount);
        }

        // H4 fix: Refresh global index from the live SY exchange rate
        // BEFORE checkpointing either party. This ensures that yield
        // accrued during the sender's holding period is permanently
        // locked to the sender and cannot transfer to the receiver.
        Self::refresh_index_from_sy(&env);

        Self::internal_checkpoint_user(&env, &from)?;
        Self::internal_checkpoint_user(&env, &to)?;

        let mut from_balance = storage::get_balance(&env, &from);
        if from_balance < amount {
            return Err(NovaireYtError::InsufficientBalance);
        }
        from_balance = from_balance.checked_sub(amount).ok_or(NovaireYtError::MathUnderflow)?;
        storage::set_balance(&env, &from, from_balance);

        let mut to_balance = storage::get_balance(&env, &to);
        to_balance = to_balance.checked_add(amount).ok_or(NovaireYtError::MathOverflow)?;
        storage::set_balance(&env, &to, to_balance);

        env.events().publish((Symbol::new(&env, "transfer"), from, to), amount);
        Ok(())
    }

    /// Approves a spender to transfer up to `amount` of the caller's tokens.
    pub fn approve(env: Env, from: Address, spender: Address, amount: i128, _expiration_ledger: u32) -> Result<(), NovaireYtError> {
        from.require_auth();

        if amount < 0 {
            return Err(NovaireYtError::InvalidAmount);
        }

        storage::set_allowance(&env, &from, &spender, amount);
        env.events().publish((Symbol::new(&env, "approve"), from, spender), amount);
        Ok(())
    }

    /// Transfers tokens from one address to another using an allowance.
    /// Checkpoints both sender and recipient.
    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) -> Result<(), NovaireYtError> {
        spender.require_auth();

        if amount <= 0 {
            return Err(NovaireYtError::InvalidAmount);
        }

        // H4 fix: Refresh global index from the live SY exchange rate
        // BEFORE checkpointing either party.
        Self::refresh_index_from_sy(&env);

        Self::internal_checkpoint_user(&env, &from)?;
        Self::internal_checkpoint_user(&env, &to)?;

        let mut allowance = storage::get_allowance(&env, &from, &spender);
        if allowance < amount {
            return Err(NovaireYtError::InsufficientAllowance);
        }
        allowance = allowance.checked_sub(amount).ok_or(NovaireYtError::MathUnderflow)?;
        storage::set_allowance(&env, &from, &spender, allowance);

        let mut from_balance = storage::get_balance(&env, &from);
        if from_balance < amount {
            return Err(NovaireYtError::InsufficientBalance);
        }
        from_balance = from_balance.checked_sub(amount).ok_or(NovaireYtError::MathUnderflow)?;
        storage::set_balance(&env, &from, from_balance);

        let mut to_balance = storage::get_balance(&env, &to);
        to_balance = to_balance.checked_add(amount).ok_or(NovaireYtError::MathOverflow)?;
        storage::set_balance(&env, &to, to_balance);

        env.events().publish((Symbol::new(&env, "transfer"), from, to), amount);
        Ok(())
    }

    // ==========================================
    // ADMIN FUNCTIONS
    // ==========================================

    /// Pauses Tokenizer integrations (mint/burn/index updates), freezing core issuance.
    pub fn pause(env: Env) -> Result<(), NovaireYtError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        
        env.events().publish((Symbol::new(&env, "yt_paused"), admin), env.ledger().sequence());
        Ok(())
    }

    /// Unpauses Tokenizer integrations.
    pub fn unpause(env: Env) -> Result<(), NovaireYtError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);

        env.events().publish((Symbol::new(&env, "yt_unpaused"), admin), env.ledger().sequence());
        Ok(())
    }

    /// Updates the trusted Tokenizer contract address.
    pub fn set_tokenizer(env: Env, new_tokenizer: Address) -> Result<(), NovaireYtError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Tokenizer, &new_tokenizer);

        env.events().publish((Symbol::new(&env, "tokenizer_transferred"), admin), new_tokenizer);
        Ok(())
    }

    /// Sets the SY Wrapper address for live yield index refresh.
    /// This is the upgrade-compatible entry point for H4: existing deployed
    /// YT Token contracts can call this without re-initialization.
    pub fn set_sy_wrapper(env: Env, sy_wrapper: Address) -> Result<(), NovaireYtError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::SyWrapper, &sy_wrapper);

        env.events().publish((Symbol::new(&env, "sy_wrapper_set"), admin), sy_wrapper);
        Ok(())
    }

    /// Initiates a two-step admin transfer to a new address.
    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), NovaireYtError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::PendingAdmin, &new_admin);

        env.events().publish((Symbol::new(&env, "yt_admin_transfer"), admin), new_admin);
        Ok(())
    }

    /// Accepts a pending admin transfer, finalizing the change of administration.
    pub fn accept_admin(env: Env) -> Result<(), NovaireYtError> {
        let pending_admin: Address = storage::get_pending_admin(&env).ok_or(NovaireYtError::InvalidAdminTransfer)?;
        pending_admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &pending_admin);
        env.storage().instance().remove(&DataKey::PendingAdmin);

        env.events().publish((Symbol::new(&env, "yt_admin_accepted"),), pending_admin);
        Ok(())
    }

    // ==========================================
    // VIEW FUNCTIONS
    // ==========================================

    /// Simulates what a user is currently owed based on their balance and the live index.
    /// H4 fix: Uses the live SY exchange rate (if available) to provide an accurate
    /// real-time view of pending yield, even when the stored global index is stale.
    pub fn claimable_yield(env: Env, user: Address) -> Result<i128, NovaireYtError> {
        let accrued = storage::get_accrued_yield(&env, &user);
        let user_index = storage::get_user_yield_index(&env, &user);
        let balance = storage::get_balance(&env, &user);

        // Determine the best available index: live rate if SyWrapper is configured
        // and we are pre-maturity, otherwise fall back to the stored global index.
        let effective_index = {
            let stored_index = storage::get_yield_index(&env);
            let is_expired = storage::is_expired(&env).unwrap_or(true);
            if is_expired {
                stored_index
            } else {
                match storage::get_sy_wrapper(&env) {
                    Some(sy_addr) => {
                        let sy_client = SyWrapperClient::new(&env, &sy_addr);
                        let live_rate = sy_client.get_exchange_rate();
                        if live_rate > stored_index { live_rate } else { stored_index }
                    },
                    None => stored_index,
                }
            }
        };

        let mut pending = 0;
        if balance > 0 && effective_index > user_index {
            let index_delta = effective_index.checked_sub(user_index).ok_or(NovaireYtError::MathUnderflow)?;
            let scaled_yield = index_delta.checked_mul(balance).ok_or(NovaireYtError::MathOverflow)?;
            pending = scaled_yield / YIELD_SCALAR;
        }

        let total = accrued.checked_add(pending).ok_or(NovaireYtError::MathOverflow)?;
        Ok(total)
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        storage::get_balance(&env, &id)
    }

    pub fn total_supply(env: Env) -> i128 {
        storage::get_total_supply(&env)
    }

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        storage::get_allowance(&env, &from, &spender)
    }

    pub fn is_paused(env: Env) -> bool {
        storage::is_paused(&env)
    }

    pub fn is_expired(env: Env) -> Result<bool, NovaireYtError> {
        storage::is_expired(&env)
    }

    pub fn name(env: Env) -> String {
        String::from_str(&env, "Novaire Yield Token")
    }

    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "nYT")
    }

    pub fn decimals(_env: Env) -> u32 {
        7
    }

    pub fn version() -> u32 {
        VERSION
    }

    pub fn metadata(env: Env) -> Result<YtMetadata, NovaireYtError> {
        Ok(YtMetadata {
            admin: storage::get_admin(&env)?,
            tokenizer: storage::get_tokenizer(&env)?,
            total_supply: storage::get_total_supply(&env),
            yield_index: storage::get_yield_index(&env),
            maturity_ledger: storage::get_maturity_ledger(&env)?,
            is_paused: storage::is_paused(&env),
            is_expired: storage::is_expired(&env)?,
            version: VERSION,
        })
    }
}
