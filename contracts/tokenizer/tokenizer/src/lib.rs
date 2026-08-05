#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Symbol};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NovaireTokenizerError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    EpochNotOpen = 4,
    EpochNotMatured = 5,
    EpochNotSettled = 6,
    AlreadySettled = 7,
    InsufficientBalance = 8,
    InvariantViolated = 9,
    InvalidAmount = 10,
    MathOverflow = 11,
    MathUnderflow = 12,
    StorageMissing = 13,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum EpochState {
    Open,
    Matured,
    Settled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenizerMetadata {
    pub admin: Address,
    pub vault: Address,
    pub pt_token: Address,
    pub yt_token: Address,
    pub sy_wrapper: Address,
    pub maturity_ledger: u32,
    pub epoch_id: u32,
    pub epoch_start_index: i128,
    pub total_pt_minted: i128,
    pub settlement_exchange_rate: Option<i128>,
    pub epoch_state: u32,
    pub version: u32,
}

const VERSION: u32 = 1;

#[soroban_sdk::contractclient(name = "VaultClient")]
pub trait VaultInterface {
    fn transfer_shares(env: Env, from: Address, to: Address, amount: i128);
    fn withdraw_for(env: Env, withdrawer: Address, receiver: Address, shares: i128) -> i128;
    fn balance_of(env: Env, user: Address) -> i128;
}

#[soroban_sdk::contractclient(name = "SyWrapperClient")]
pub trait SyWrapperInterface {
    fn get_exchange_rate(env: Env) -> i128;
    fn refresh_rate(env: Env) -> Result<(), soroban_sdk::Error>;
}

#[soroban_sdk::contractclient(name = "PtTokenClient")]
pub trait PtTokenInterface {
    fn mint(env: Env, to: Address, amount: i128);
    fn burn(env: Env, from: Address, amount: i128);
    fn balance(env: Env, id: Address) -> i128;
    fn total_supply(env: Env) -> i128;
}

#[soroban_sdk::contractclient(name = "YtTokenClient")]
pub trait YtTokenInterface {
    fn mint(env: Env, to: Address, amount: i128);
    fn checkpoint_user(env: Env, user: Address) -> Result<(), soroban_sdk::Error>;
    fn claimable_yield(env: Env, user: Address) -> i128;
    fn reset_claimable(env: Env, user: Address);
    fn update_yield_index(env: Env, new_index: i128);
    fn total_supply(env: Env) -> i128;
    fn add_accrued_yield(env: Env, user: Address, amount: i128);
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Vault,
    PtToken,
    YtToken,
    SyWrapper,
    MaturityLedger,
    EpochId,
    EpochStartIndex,
    TotalPtMinted,
    SettlementExchangeRate,
}

mod storage {
    use super::*;

    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn get_address(env: &Env, key: DataKey) -> Result<Address, NovaireTokenizerError> {
        env.storage().instance().get(&key).ok_or(NovaireTokenizerError::StorageMissing)
    }

    pub fn get_u32(env: &Env, key: DataKey) -> Result<u32, NovaireTokenizerError> {
        env.storage().instance().get(&key).ok_or(NovaireTokenizerError::StorageMissing)
    }

    pub fn get_i128(env: &Env, key: DataKey) -> Result<i128, NovaireTokenizerError> {
        env.storage().instance().get(&key).ok_or(NovaireTokenizerError::StorageMissing)
    }

    pub fn set_i128(env: &Env, key: DataKey, val: i128) {
        env.storage().instance().set(&key, &val);
    }
    
    pub fn get_settlement_rate(env: &Env) -> Option<i128> {
        env.storage().instance().get(&DataKey::SettlementExchangeRate)
    }
    
    pub fn set_settlement_rate(env: &Env, val: i128) {
        env.storage().instance().set(&DataKey::SettlementExchangeRate, &val);
    }

    pub fn get_epoch_state(env: &Env) -> Result<EpochState, NovaireTokenizerError> {
        let maturity = get_u32(env, DataKey::MaturityLedger)?;
        let current = env.ledger().sequence();
        
        if current < maturity {
            return Ok(EpochState::Open);
        }
        
        if get_settlement_rate(env).is_some() {
            return Ok(EpochState::Settled);
        }
        
        Ok(EpochState::Matured)
    }
}

/// # Novaire Tokenizer
/// 
/// The economic coordinator of the Novaire protocol. 
/// Orchestrates the issuance of PT and YT tokens against deposited Vault shares, 
/// manages the Epoch State Machine, and guarantees principal redemptions.
#[contract]
pub struct Tokenizer;

#[contractimpl]
impl Tokenizer {
    
    /// Initializes the Tokenizer with its critical dependencies.
    pub fn initialize(
        env: Env,
        admin: Address,
        vault: Address,
        pt_token: Address,
        yt_token: Address,
        sy_wrapper: Address,
        maturity_ledger: u32,
    ) -> Result<(), NovaireTokenizerError> {
        if storage::is_initialized(&env) {
            return Err(NovaireTokenizerError::AlreadyInitialized);
        }
        admin.require_auth();

        let sy_client = SyWrapperClient::new(&env, &sy_wrapper);
        let epoch_start_index = sy_client.get_exchange_rate();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Vault, &vault);
        env.storage().instance().set(&DataKey::PtToken, &pt_token);
        env.storage().instance().set(&DataKey::YtToken, &yt_token);
        env.storage().instance().set(&DataKey::SyWrapper, &sy_wrapper);
        env.storage().instance().set(&DataKey::MaturityLedger, &maturity_ledger);
        env.storage().instance().set(&DataKey::EpochId, &1u32);
        
        storage::set_i128(&env, DataKey::EpochStartIndex, epoch_start_index);
        storage::set_i128(&env, DataKey::TotalPtMinted, 0i128);

        Ok(())
    }

    /// Mints PT and YT tokens identically in exchange for Vault Shares.
    ///
    /// Requires Epoch State: `Open`
    pub fn mint_pt_yt(env: Env, user: Address, sy_shares: i128) -> Result<(i128, i128), NovaireTokenizerError> {
        user.require_auth();

        if sy_shares <= 0 {
            return Err(NovaireTokenizerError::InvalidAmount);
        }

        if storage::get_epoch_state(&env)? != EpochState::Open {
            return Err(NovaireTokenizerError::EpochNotOpen);
        }

        let vault_addr = storage::get_address(&env, DataKey::Vault)?;
        let pt_token_addr = storage::get_address(&env, DataKey::PtToken)?;
        let yt_token_addr = storage::get_address(&env, DataKey::YtToken)?;
        let sy_wrapper_addr = storage::get_address(&env, DataKey::SyWrapper)?;

        // 1. Pull shares from User to Tokenizer
        let vault_client = VaultClient::new(&env, &vault_addr);
        vault_client.transfer_shares(&user, &env.current_contract_address(), &sy_shares);

        // 2. Mint PT
        let pt_client = PtTokenClient::new(&env, &pt_token_addr);
        pt_client.mint(&user, &sy_shares);

        // 3. Update global yield index and Mint YT
        let sy_client = SyWrapperClient::new(&env, &sy_wrapper_addr);
        let exchange_rate = sy_client.get_exchange_rate();

        let yt_client = YtTokenClient::new(&env, &yt_token_addr);
        yt_client.update_yield_index(&exchange_rate);
        yt_client.mint(&user, &sy_shares);

        // M2 Fix: Credit historical yield to late minters
        let epoch_start_index = storage::get_i128(&env, DataKey::EpochStartIndex)?;
        if exchange_rate > epoch_start_index {
            let index_delta = exchange_rate.checked_sub(epoch_start_index).ok_or(NovaireTokenizerError::MathUnderflow)?;
            let historical_yield = index_delta.checked_mul(sy_shares).ok_or(NovaireTokenizerError::MathOverflow)? / 1_000_000_000;
            if historical_yield > 0 {
                yt_client.add_accrued_yield(&user, &historical_yield);
            }
        }

        // 4. Update Internal Accounting
        let mut total_pt_minted = storage::get_i128(&env, DataKey::TotalPtMinted)?;
        total_pt_minted = total_pt_minted.checked_add(sy_shares).ok_or(NovaireTokenizerError::MathOverflow)?;
        storage::set_i128(&env, DataKey::TotalPtMinted, total_pt_minted);

        env.events().publish((Symbol::new(&env, "tokenizer_minted"), user), (sy_shares, sy_shares, sy_shares));
        
        Self::assert_invariant(env.clone())?;
        Ok((sy_shares, sy_shares))
    }

    /// Claims accrued yield for a user by withdrawing the physical underlying asset.
    /// 
    /// Requires Epoch State: `Open`, `Matured`, or `Settled`.
    pub fn claim_yield(env: Env, user: Address) -> Result<i128, NovaireTokenizerError> {
        user.require_auth();
        
        let state = storage::get_epoch_state(&env)?;
        
        let sy_wrapper_addr = storage::get_address(&env, DataKey::SyWrapper)?;
        let sy_client = SyWrapperClient::new(&env, &sy_wrapper_addr);
        
        let yt_token_addr = storage::get_address(&env, DataKey::YtToken)?;
        let yt_client = YtTokenClient::new(&env, &yt_token_addr);

        let exchange_rate = match state {
            EpochState::Open => {
                // Pre-maturity: use live rate and update global index
                let live_rate = sy_client.get_exchange_rate();
                yt_client.update_yield_index(&live_rate);
                live_rate
            },
            EpochState::Matured => {
                // Post-maturity but pre-settlement: use live rate and UPDATE global index.
                // Yield generated before settlement belongs to YT holders.
                let live_rate = sy_client.get_exchange_rate();
                yt_client.update_yield_index(&live_rate);
                live_rate
            },
            EpochState::Settled => {
                // Post-settlement: use the locked settlement rate
                storage::get_settlement_rate(&env).ok_or(NovaireTokenizerError::StorageMissing)?
            }
        };

        // Checkpoint the user so their internal math catches up to the global index
        yt_client.try_checkpoint_user(&user).map_err(|_| NovaireTokenizerError::MathUnderflow)?;
        let claimable = yt_client.claimable_yield(&user);
        
        if claimable <= 0 {
            return Err(NovaireTokenizerError::InvalidAmount);
        }

        // Reset user claim math
        yt_client.reset_claimable(&user);

        // Convert scaled yield (1e9) to exact Vault Shares using the active exchange rate
        let shares_to_withdraw = claimable.checked_mul(1_000_000_000).ok_or(NovaireTokenizerError::MathOverflow)? / exchange_rate;

        // Withdraw underlying physical assets via the Vault
        let vault_addr = storage::get_address(&env, DataKey::Vault)?;
        let vault_client = VaultClient::new(&env, &vault_addr);
        let actual_underlying = vault_client.withdraw_for(&env.current_contract_address(), &user, &shares_to_withdraw);

        env.events().publish((Symbol::new(&env, "tokenizer_claimed"), user), (actual_underlying, shares_to_withdraw));
        Self::assert_invariant(env.clone())?;
        Ok(actual_underlying)
    }

    /// Settles the epoch, permanently locking the settlement exchange rate.
    ///
    /// Requires Epoch State: `Matured`
    pub fn settle_epoch(env: Env) -> Result<(), NovaireTokenizerError> {
        let state = storage::get_epoch_state(&env)?;
        if state == EpochState::Settled {
            return Err(NovaireTokenizerError::AlreadySettled);
        }
        if state == EpochState::Open {
            return Err(NovaireTokenizerError::EpochNotMatured);
        }
        
        // State is Matured. We now transition to Settled.
        let sy_wrapper_addr = storage::get_address(&env, DataKey::SyWrapper)?;
        let sy_client = SyWrapperClient::new(&env, &sy_wrapper_addr);
        
        // Fix M3: Prevent stale settlement rate by refreshing accounting before freezing
        sy_client.refresh_rate();
        let settlement_rate = sy_client.get_exchange_rate();
        
        storage::set_settlement_rate(&env, settlement_rate);

        // Update the YT index one final time with the exact settlement rate
        // This guarantees that ANY remaining yield in the Tokenizer belongs to YT holders
        let yt_token_addr = storage::get_address(&env, DataKey::YtToken)?;
        let yt_client = YtTokenClient::new(&env, &yt_token_addr);
        yt_client.update_yield_index(&settlement_rate);

        let epoch_id = storage::get_u32(&env, DataKey::EpochId)?;
        env.events().publish((Symbol::new(&env, "tokenizer_settled"),), (epoch_id, settlement_rate));
        
        Self::assert_invariant(env.clone())?;
        Ok(())
    }

    /// Redeems PT for guaranteed principal physical underlying assets.
    ///
    /// Requires Epoch State: `Settled`. (Post-maturity, post-settlement).
    pub fn redeem_pt(env: Env, user: Address, pt_amount: i128) -> Result<i128, NovaireTokenizerError> {
        user.require_auth();

        if storage::get_epoch_state(&env)? != EpochState::Settled {
            return Err(NovaireTokenizerError::EpochNotSettled);
        }

        if pt_amount <= 0 {
            return Err(NovaireTokenizerError::InvalidAmount);
        }

        let pt_token_addr = storage::get_address(&env, DataKey::PtToken)?;
        let pt_client = PtTokenClient::new(&env, &pt_token_addr);
        
        let user_pt_balance = pt_client.balance(&user);
        if user_pt_balance < pt_amount {
            return Err(NovaireTokenizerError::InsufficientBalance);
        }

        // 1. Burn the PT
        pt_client.burn(&user, &pt_amount);

        // 2. Calculate Guaranteed Principal & Vault Shares
        // 1 PT is explicitly backed by `epoch_start_index` physical underlying assets.
        // Convert Guaranteed Principal to Vault Shares using the locked Settlement Rate
        // This fully protects PT holders from post-settlement crashes in the SY Wrapper.
        // We eliminate intermediate scaling division to preserve perfect mathematical precision.
        let epoch_start_index = storage::get_i128(&env, DataKey::EpochStartIndex)?;
        let settlement_rate = storage::get_settlement_rate(&env).ok_or(NovaireTokenizerError::StorageMissing)?;
        let shares_to_withdraw = pt_amount.checked_mul(epoch_start_index).ok_or(NovaireTokenizerError::MathOverflow)? / settlement_rate;

        // 4. Withdraw physical assets via Vault
        let vault_addr = storage::get_address(&env, DataKey::Vault)?;
        let vault_client = VaultClient::new(&env, &vault_addr);
        let actual_underlying = vault_client.withdraw_for(&env.current_contract_address(), &user, &shares_to_withdraw);

        env.events().publish((Symbol::new(&env, "tokenizer_redeemed"), user), (pt_amount, actual_underlying));
        Self::assert_invariant(env.clone())?;
        Ok(actual_underlying)
    }

    /// Checks the exact state of the epoch.
    pub fn get_epoch_state(env: Env) -> Result<u32, NovaireTokenizerError> {
        Ok(storage::get_epoch_state(&env)? as u32)
    }

    pub fn version() -> u32 {
        VERSION
    }

    pub fn metadata(env: Env) -> Result<TokenizerMetadata, NovaireTokenizerError> {
        Ok(TokenizerMetadata {
            admin: storage::get_address(&env, DataKey::Admin)?,
            vault: storage::get_address(&env, DataKey::Vault)?,
            pt_token: storage::get_address(&env, DataKey::PtToken)?,
            yt_token: storage::get_address(&env, DataKey::YtToken)?,
            sy_wrapper: storage::get_address(&env, DataKey::SyWrapper)?,
            maturity_ledger: storage::get_u32(&env, DataKey::MaturityLedger)?,
            epoch_id: storage::get_u32(&env, DataKey::EpochId)?,
            epoch_start_index: storage::get_i128(&env, DataKey::EpochStartIndex)?,
            total_pt_minted: storage::get_i128(&env, DataKey::TotalPtMinted)?,
            settlement_exchange_rate: storage::get_settlement_rate(&env),
            epoch_state: storage::get_epoch_state(&env)? as u32,
            version: VERSION,
        })
    }

    /// Asserts protocol accounting solvency. 
    /// Verifies that PT backing logic hasn't been structurally compromised.
    fn assert_invariant(env: Env) -> Result<(), NovaireTokenizerError> {
        let pt_token_addr = storage::get_address(&env, DataKey::PtToken)?;
        let pt_client = PtTokenClient::new(&env, &pt_token_addr);
        let pt_outstanding = pt_client.total_supply();
        
        let yt_token_addr = storage::get_address(&env, DataKey::YtToken)?;
        let yt_client = YtTokenClient::new(&env, &yt_token_addr);
        let yt_outstanding = yt_client.total_supply();

        // INVARIANT 1: PT supply strictly equals YT supply during the Open phase.
        if storage::get_epoch_state(&env)? == EpochState::Open
            && pt_outstanding != yt_outstanding {
                return Err(NovaireTokenizerError::InvariantViolated);
            }

        // INVARIANT 2: Tokenizer must hold enough Vault Shares to mathematically satisfy the outstanding PT principal guarantee.
        let vault_addr = storage::get_address(&env, DataKey::Vault)?;
        let vault_client = VaultClient::new(&env, &vault_addr);
        let sy_shares_held = vault_client.balance_of(&env.current_contract_address());
        
        let sy_wrapper_addr = storage::get_address(&env, DataKey::SyWrapper)?;
        let sy_client = SyWrapperClient::new(&env, &sy_wrapper_addr);
        
        let current_exchange_rate = match storage::get_settlement_rate(&env) {
            Some(rate) => rate, // If settled, the backing required is locked to the settlement rate.
            None => sy_client.get_exchange_rate()
        };

        let epoch_start_index = storage::get_i128(&env, DataKey::EpochStartIndex)?;

        let pt_liability_raw = pt_outstanding.checked_mul(epoch_start_index).ok_or(NovaireTokenizerError::MathOverflow)?;
        let assets_held_raw = sy_shares_held.checked_mul(current_exchange_rate).ok_or(NovaireTokenizerError::MathOverflow)?;

        // Note: assets_held_raw includes PT principal PLUS unclaimed yield for YT holders.
        // It should ALWAYS exceed or equal the minimum PT principal requirements raw cross-multiplied value.
        // Comparing raw outputs avoids 1e9 division truncation masking sub-unit insolvencies.
        if assets_held_raw < pt_liability_raw {
            return Err(NovaireTokenizerError::InvariantViolated);
        }

        Ok(())
    }
}

// --------------------------------------------------------------------------------
// TESTS
// --------------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Ledger, token, Address, Env};
    
    use pt_token::{PtToken, PtTokenClient as RealPtClient};
    use yt_token::{YtToken, YtTokenClient as RealYtClient};
    use vault::{Vault, VaultClient as RealVaultClient};
    use sy_wrapper::{SyWrapper, SyWrapperClient as RealSyWrapperClient};

    #[test]
    fn test_tokenizer_state_machine() {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let yield_source = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract);
        let _token_client = token::Client::new(&env, &token_contract);

        token_admin_client.mint(&user, &2000);

        let sy_contract_id = env.register(SyWrapper, ());
        let sy_client = RealSyWrapperClient::new(&env, &sy_contract_id);
        sy_client.initialize(&admin, &token_contract, &yield_source);

        let vault_contract_id = env.register(Vault, ());
        let vault_client = RealVaultClient::new(&env, &vault_contract_id);
        vault_client.initialize(&admin, &sy_contract_id, &token_contract);

        let pt_contract_id = env.register(PtToken, ());
        let pt_client = RealPtClient::new(&env, &pt_contract_id);

        let yt_contract_id = env.register(YtToken, ());
        let yt_client = RealYtClient::new(&env, &yt_contract_id);

        let tokenizer_contract_id = env.register(Tokenizer, ());
        let tokenizer_client = TokenizerClient::new(&env, &tokenizer_contract_id);

        let maturity_ledger = 100;
        
        pt_client.initialize(&admin, &tokenizer_contract_id);
        yt_client.initialize(&admin, &tokenizer_contract_id, &maturity_ledger, &sy_contract_id);

        tokenizer_client.initialize(
            &admin,
            &vault_contract_id,
            &pt_contract_id,
            &yt_contract_id,
            &sy_contract_id,
            &maturity_ledger,
        );

        // Vault Deposit
        vault_client.deposit(&user, &2000); // 1000 locked, user gets 1000 shares

        // STATE: OPEN
        assert_eq!(tokenizer_client.get_epoch_state(), EpochState::Open as u32);
        
        // 1. Minting Allowed in Open
        tokenizer_client.mint_pt_yt(&user, &1000);
        assert_eq!(pt_client.balance(&user), 1000);
        assert_eq!(yt_client.balance(&user), 1000);

        // 2. Redemption Forbidden in Open
        let res = tokenizer_client.try_redeem_pt(&user, &1000);
        assert!(res.is_err());

        // 3. Settle Epoch Forbidden in Open
        let res = tokenizer_client.try_settle_epoch();
        assert!(res.is_err());

        // Yield accrual
        // Rate starts at 1e9. Total underlying = 2000.
        // We add 10% (200), then another 10% (220), etc.
        token_admin_client.mint(&sy_contract_id, &200);
        sy_client.harvest_yield();
        token_admin_client.mint(&sy_contract_id, &220);
        sy_client.harvest_yield();
        token_admin_client.mint(&sy_contract_id, &242);
        sy_client.harvest_yield();

        // STATE: MATURED
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 100,
            ..env.ledger().get()
        });
        assert_eq!(tokenizer_client.get_epoch_state(), EpochState::Matured as u32);

        // 4. Minting Forbidden in Matured
        let res = tokenizer_client.try_mint_pt_yt(&user, &100);
        assert!(res.is_err());

        // 5. Redemption Forbidden in Matured (Not Settled yet)
        let res = tokenizer_client.try_redeem_pt(&user, &100);
        assert!(res.is_err());

        // 6. Settle Epoch Allowed in Matured
        tokenizer_client.settle_epoch();
        
        // STATE: SETTLED
        assert_eq!(tokenizer_client.get_epoch_state(), EpochState::Settled as u32);

        // 7. Settle Epoch Forbidden if already Settled
        let res = tokenizer_client.try_settle_epoch();
        assert!(res.is_err());

        // 8. Redemption Allowed in Settled
        tokenizer_client.redeem_pt(&user, &1000);
        assert_eq!(pt_client.balance(&user), 0);
    }
}
