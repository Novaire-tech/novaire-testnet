#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String, Symbol};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NovairePtError {
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
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    PendingAdmin,
    Tokenizer,
    TotalSupply,
    Paused,
    Balance(Address),
    Allowance(Address, Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PtMetadata {
    pub admin: Address,
    pub tokenizer: Address,
    pub total_supply: i128,
    pub is_paused: bool,
    pub version: u32,
}

const VERSION: u32 = 1;

mod storage {
    use super::*;

    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn get_admin(env: &Env) -> Result<Address, NovairePtError> {
        env.storage().instance().get(&DataKey::Admin).ok_or(NovairePtError::StorageMissing)
    }

    pub fn get_pending_admin(env: &Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingAdmin)
    }

    pub fn get_tokenizer(env: &Env) -> Result<Address, NovairePtError> {
        env.storage().instance().get(&DataKey::Tokenizer).ok_or(NovairePtError::StorageMissing)
    }

    pub fn get_total_supply(env: &Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0)
    }

    pub fn set_total_supply(env: &Env, supply: i128) {
        env.storage().instance().set(&DataKey::TotalSupply, &supply);
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

    pub fn is_paused(env: &Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    pub fn require_not_paused(env: &Env) -> Result<(), NovairePtError> {
        if is_paused(env) {
            return Err(NovairePtError::Paused);
        }
        Ok(())
    }
}

/// # Novaire Principal Token (PT)
/// 
/// The PT Token is a protocol-owned primitive representing ownership of 
/// underlying principal inside the Novaire yield tokenization protocol.
///
/// ## Protocol Invariants
/// - **Issuance Restrictions**: Only the trusted `Tokenizer` contract may mint or burn PT.
/// - **Supply Parity**: Total supply must precisely equal the outstanding principal positions tracked by the Tokenizer.
/// - **Economic Solvency**: PT tokens should never exist without corresponding protocol backing locked in the SY Wrapper.
/// - **Secondary Liquidity**: Peer-to-peer transfers are strictly decoupled from protocol accounting and remain active even during `pause` to preserve secondary market liquidity exits.
#[contract]
pub struct PtToken;

#[contractimpl]
impl PtToken {
    // ==========================================
    // INITIALIZATION
    // ==========================================

    /// Initializes the Novaire Principal Token (PT).
    ///
    /// # Arguments
    /// * `admin` - Protocol administrator responsible for pausing and upgrades.
    /// * `tokenizer` - The exclusive authority allowed to mint and burn PT tokens.
    ///
    /// # Errors
    /// Returns `AlreadyInitialized` if called more than once.
    pub fn initialize(env: Env, admin: Address, tokenizer: Address) -> Result<(), NovairePtError> {
        if storage::is_initialized(&env) {
            return Err(NovairePtError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Tokenizer, &tokenizer);
        storage::set_total_supply(&env, 0i128);
        env.storage().instance().set(&DataKey::Paused, &false);

        Ok(())
    }

    // ==========================================
    // TOKENIZER FUNCTIONS (MINT/BURN)
    // ==========================================

    /// Mints new PT tokens to the designated address.
    /// 
    /// **Strictly restricted to the Tokenizer contract.** 
    /// This ensures PT is only issued when underlying yield-bearing assets are securely locked.
    ///
    /// # Arguments
    /// * `to` - The address receiving the minted tokens.
    /// * `amount` - The amount of tokens to mint.
    ///
    /// # Errors
    /// Returns `Unauthorized`, `Paused`, `InvalidAmount`, or `MathOverflow`.
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), NovairePtError> {
        let tokenizer = storage::get_tokenizer(&env)?;
        tokenizer.require_auth();
        storage::require_not_paused(&env)?;

        if amount <= 0 {
            return Err(NovairePtError::InvalidAmount);
        }

        let mut total_supply = storage::get_total_supply(&env);
        total_supply = total_supply.checked_add(amount).ok_or(NovairePtError::MathOverflow)?;
        storage::set_total_supply(&env, total_supply);

        let mut balance = storage::get_balance(&env, &to);
        balance = balance.checked_add(amount).ok_or(NovairePtError::MathOverflow)?;
        storage::set_balance(&env, &to, balance);

        env.events().publish((Symbol::new(&env, "mint"), tokenizer, to), (amount, total_supply));
        Ok(())
    }

    /// Burns PT tokens from the designated address.
    /// 
    /// **Strictly restricted to the Tokenizer contract.** 
    /// Called when users redeem their PT for underlying assets at maturity.
    ///
    /// # Arguments
    /// * `from` - The address burning the tokens.
    /// * `amount` - The amount of tokens to burn.
    ///
    /// # Errors
    /// Returns `Unauthorized`, `Paused`, `InvalidAmount`, `InsufficientBalance`, or `MathUnderflow`.
    pub fn burn(env: Env, from: Address, amount: i128) -> Result<(), NovairePtError> {
        let tokenizer = storage::get_tokenizer(&env)?;
        tokenizer.require_auth();
        storage::require_not_paused(&env)?;

        if amount <= 0 {
            return Err(NovairePtError::InvalidAmount);
        }

        let mut balance = storage::get_balance(&env, &from);
        if balance < amount {
            return Err(NovairePtError::InsufficientBalance);
        }
        balance = balance.checked_sub(amount).ok_or(NovairePtError::MathUnderflow)?;
        storage::set_balance(&env, &from, balance);

        let mut total_supply = storage::get_total_supply(&env);
        total_supply = total_supply.checked_sub(amount).ok_or(NovairePtError::MathUnderflow)?;
        storage::set_total_supply(&env, total_supply);

        env.events().publish((Symbol::new(&env, "burn"), tokenizer, from), (amount, total_supply));
        Ok(())
    }

    // ==========================================
    // USER FUNCTIONS (ERC20 COMPATIBLE)
    // ==========================================

    /// Transfers tokens from the caller to a recipient.
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
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), NovairePtError> {
        from.require_auth();

        if amount <= 0 {
            return Err(NovairePtError::InvalidAmount);
        }

        let mut from_balance = storage::get_balance(&env, &from);
        if from_balance < amount {
            return Err(NovairePtError::InsufficientBalance);
        }
        from_balance = from_balance.checked_sub(amount).ok_or(NovairePtError::MathUnderflow)?;
        storage::set_balance(&env, &from, from_balance);

        let mut to_balance = storage::get_balance(&env, &to);
        to_balance = to_balance.checked_add(amount).ok_or(NovairePtError::MathOverflow)?;
        storage::set_balance(&env, &to, to_balance);

        env.events().publish((Symbol::new(&env, "transfer"), from, to), amount);
        Ok(())
    }

    /// Approves a spender to transfer up to `amount` of the caller's tokens.
    ///
    /// # Arguments
    /// * `from` - The token owner (requires auth).
    /// * `spender` - The address granted allowance.
    /// * `amount` - The maximum amount the spender can transfer.
    /// * `expiration_ledger` - Unused parameter to maintain standard token interface compatibility.
    pub fn approve(env: Env, from: Address, spender: Address, amount: i128, _expiration_ledger: u32) -> Result<(), NovairePtError> {
        from.require_auth();

        if amount < 0 {
            return Err(NovairePtError::InvalidAmount);
        }

        storage::set_allowance(&env, &from, &spender, amount);
        env.events().publish((Symbol::new(&env, "approve"), from, spender), amount);
        Ok(())
    }

    /// Transfers tokens from one address to another using an allowance.
    ///
    /// # Arguments
    /// * `spender` - The address initiating the transfer (requires auth).
    /// * `from` - The owner of the tokens.
    /// * `to` - The recipient of the tokens.
    /// * `amount` - The amount to transfer.
    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) -> Result<(), NovairePtError> {
        spender.require_auth();

        if amount <= 0 {
            return Err(NovairePtError::InvalidAmount);
        }

        let mut allowance = storage::get_allowance(&env, &from, &spender);
        if allowance < amount {
            return Err(NovairePtError::InsufficientAllowance);
        }
        allowance = allowance.checked_sub(amount).ok_or(NovairePtError::MathUnderflow)?;
        storage::set_allowance(&env, &from, &spender, allowance);

        let mut from_balance = storage::get_balance(&env, &from);
        if from_balance < amount {
            return Err(NovairePtError::InsufficientBalance);
        }
        from_balance = from_balance.checked_sub(amount).ok_or(NovairePtError::MathUnderflow)?;
        storage::set_balance(&env, &from, from_balance);

        let mut to_balance = storage::get_balance(&env, &to);
        to_balance = to_balance.checked_add(amount).ok_or(NovairePtError::MathOverflow)?;
        storage::set_balance(&env, &to, to_balance);

        env.events().publish((Symbol::new(&env, "transfer"), from, to), amount);
        Ok(())
    }

    // ==========================================
    // ADMIN FUNCTIONS
    // ==========================================

    /// Pauses Tokenizer integrations (mint/burn), freezing core issuance.
    pub fn pause(env: Env) -> Result<(), NovairePtError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        
        env.events().publish((Symbol::new(&env, "pt_paused"), admin), env.ledger().sequence());
        Ok(())
    }

    /// Unpauses Tokenizer integrations.
    pub fn unpause(env: Env) -> Result<(), NovairePtError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);

        env.events().publish((Symbol::new(&env, "pt_unpaused"), admin), env.ledger().sequence());
        Ok(())
    }

    /// Updates the trusted Tokenizer contract address.
    pub fn set_tokenizer(env: Env, new_tokenizer: Address) -> Result<(), NovairePtError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Tokenizer, &new_tokenizer);

        env.events().publish((Symbol::new(&env, "tokenizer_transferred"), admin), new_tokenizer);
        Ok(())
    }

    /// Initiates a two-step admin transfer to a new address.
    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), NovairePtError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::PendingAdmin, &new_admin);

        env.events().publish((Symbol::new(&env, "pt_admin_transfer"), admin), new_admin);
        Ok(())
    }

    /// Accepts a pending admin transfer, finalizing the change of administration.
    pub fn accept_admin(env: Env) -> Result<(), NovairePtError> {
        let pending_admin: Address = storage::get_pending_admin(&env).ok_or(NovairePtError::InvalidAdminTransfer)?;
        pending_admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &pending_admin);
        env.storage().instance().remove(&DataKey::PendingAdmin);

        env.events().publish((Symbol::new(&env, "pt_admin_accepted"),), pending_admin);
        Ok(())
    }

    // ==========================================
    // VIEW FUNCTIONS
    // ==========================================

    /// Returns the exact balance of a specific user.
    pub fn balance(env: Env, id: Address) -> i128 {
        storage::get_balance(&env, &id)
    }

    /// Returns the total supply of PT tokens in circulation.
    pub fn total_supply(env: Env) -> i128 {
        storage::get_total_supply(&env)
    }

    /// Returns the approved allowance for a spender.
    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        storage::get_allowance(&env, &from, &spender)
    }

    /// Returns true if issuance/redemption is paused.
    pub fn is_paused(env: Env) -> bool {
        storage::is_paused(&env)
    }

    /// Hardcoded to save storage gas costs.
    pub fn name(env: Env) -> String {
        String::from_str(&env, "Novaire Principal Token")
    }

    /// Hardcoded to save storage gas costs.
    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "nPT")
    }

    /// Hardcoded to 7 decimals, consistent with Stellar assets.
    pub fn decimals(_env: Env) -> u32 {
        7
    }

    /// Returns the protocol version.
    pub fn version() -> u32 {
        VERSION
    }

    /// Returns a comprehensive struct containing the PT Token's configuration and health metadata.
    pub fn metadata(env: Env) -> Result<PtMetadata, NovairePtError> {
        Ok(PtMetadata {
            admin: storage::get_admin(&env)?,
            tokenizer: storage::get_tokenizer(&env)?,
            total_supply: storage::get_total_supply(&env),
            is_paused: storage::is_paused(&env),
            version: VERSION,
        })
    }
}
