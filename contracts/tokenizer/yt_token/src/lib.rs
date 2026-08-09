#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, Address, Env, String,
    Symbol,
};

/// Cross-contract client for reading the live SY exchange rate.
#[contractclient(name = "SyWrapperClient")]
pub trait SyWrapperInterface {
    fn get_exchange_rate(env: Env) -> i128;
}

/// Cross-contract client for the two narrow Tokenizer functions YT is allowed to
/// call from its own entry points. Deliberately does NOT include
/// `preview_yield_index`/`refresh_yield_index` — those call back into YtToken,
/// and Soroban rejects a contract re-entering itself further up the call stack,
/// so YtToken must compute its own index update locally using these
/// YtToken-free getters instead of delegating the whole computation.
#[contractclient(name = "TokenizerClient")]
pub trait TokenizerInterface {
    fn get_surplus_snapshot(env: Env) -> Result<(i128, i128), soroban_sdk::Error>;
    fn record_surplus_baseline_pub(env: Env) -> Result<(), soroban_sdk::Error>;
}

/// Cross-contract client for the canonical epoch FSM. Replaces the local
/// `ledger_sequence >= maturity_ledger` comparison previously used to
/// determine expiry.
#[contractclient(name = "MaturityEngineClient")]
pub trait MaturityEngineInterface {
    fn live_state(env: Env, epoch_id: u32) -> Result<u32, soroban_sdk::Error>;
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
    /// Canonical epoch-clock contract. Source of truth for expiry;
    /// `MaturityLedger` is retained only as a display-only value.
    MaturityEngine,
    /// The epoch_id `MaturityEngine::open_epoch` returned for this deployment.
    MaturityEngineEpochId,
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

const DAY_IN_LEDGERS: u32 = 17280;
const PERSISTENT_LIFETIME_THRESHOLD: u32 = DAY_IN_LEDGERS * 30;
const PERSISTENT_BUMP_AMOUNT: u32 = DAY_IN_LEDGERS * 60;
const INSTANCE_LIFETIME_THRESHOLD: u32 = DAY_IN_LEDGERS * 30;
const INSTANCE_BUMP_AMOUNT: u32 = DAY_IN_LEDGERS * 60;

mod storage {
    use super::*;

    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn get_admin(env: &Env) -> Result<Address, NovaireYtError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(NovaireYtError::StorageMissing)
    }

    pub fn get_pending_admin(env: &Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingAdmin)
    }

    pub fn get_tokenizer(env: &Env) -> Result<Address, NovaireYtError> {
        env.storage()
            .instance()
            .get(&DataKey::Tokenizer)
            .ok_or(NovaireYtError::StorageMissing)
    }

    #[allow(dead_code)]
    pub fn get_sy_wrapper(env: &Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::SyWrapper)
    }

    pub fn get_maturity_ledger(env: &Env) -> Result<u32, NovaireYtError> {
        env.storage()
            .instance()
            .get(&DataKey::MaturityLedger)
            .ok_or(NovaireYtError::StorageMissing)
    }

    pub fn get_maturity_engine(env: &Env) -> Result<Address, NovaireYtError> {
        env.storage()
            .instance()
            .get(&DataKey::MaturityEngine)
            .ok_or(NovaireYtError::StorageMissing)
    }

    pub fn get_maturity_engine_epoch_id(env: &Env) -> Result<u32, NovaireYtError> {
        env.storage()
            .instance()
            .get(&DataKey::MaturityEngineEpochId)
            .ok_or(NovaireYtError::StorageMissing)
    }

    pub fn get_total_supply(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    pub fn set_total_supply(env: &Env, supply: i128) {
        env.storage().instance().set(&DataKey::TotalSupply, &supply);
    }

    pub fn get_yield_index(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::YieldIndex)
            .unwrap_or(0)
    }

    pub fn set_yield_index(env: &Env, index: i128) {
        env.storage().instance().set(&DataKey::YieldIndex, &index);
    }

    pub fn get_balance(env: &Env, user: &Address) -> i128 {
        let key = DataKey::Balance(user.clone());
        let balance = env.storage().persistent().get(&key).unwrap_or(0);
        if env.storage().persistent().has(&key) {
            env.storage().persistent().extend_ttl(
                &key,
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_BUMP_AMOUNT,
            );
        }
        balance
    }

    pub fn set_balance(env: &Env, user: &Address, balance: i128) {
        let key = DataKey::Balance(user.clone());
        env.storage().persistent().set(&key, &balance);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
    }

    pub fn get_allowance(env: &Env, owner: &Address, spender: &Address) -> i128 {
        let key = DataKey::Allowance(owner.clone(), spender.clone());
        let allowance = env.storage().persistent().get(&key).unwrap_or(0);
        if env.storage().persistent().has(&key) {
            env.storage().persistent().extend_ttl(
                &key,
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_BUMP_AMOUNT,
            );
        }
        allowance
    }

    pub fn set_allowance(env: &Env, owner: &Address, spender: &Address, amount: i128) {
        let key = DataKey::Allowance(owner.clone(), spender.clone());
        env.storage().persistent().set(&key, &amount);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
    }

    pub fn get_user_yield_index(env: &Env, user: &Address) -> i128 {
        let key = DataKey::UserYieldIndex(user.clone());
        let index = env.storage().persistent().get(&key).unwrap_or(0);
        if env.storage().persistent().has(&key) {
            env.storage().persistent().extend_ttl(
                &key,
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_BUMP_AMOUNT,
            );
        }
        index
    }

    pub fn set_user_yield_index(env: &Env, user: &Address, index: i128) {
        let key = DataKey::UserYieldIndex(user.clone());
        env.storage().persistent().set(&key, &index);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
    }

    pub fn get_accrued_yield(env: &Env, user: &Address) -> i128 {
        let key = DataKey::AccruedYield(user.clone());
        let accrued = env.storage().persistent().get(&key).unwrap_or(0);
        if env.storage().persistent().has(&key) {
            env.storage().persistent().extend_ttl(
                &key,
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_BUMP_AMOUNT,
            );
        }
        accrued
    }

    pub fn set_accrued_yield(env: &Env, user: &Address, accrued: i128) {
        let key = DataKey::AccruedYield(user.clone());
        env.storage().persistent().set(&key, &accrued);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
    }

    pub fn is_paused(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    pub fn require_not_paused(env: &Env) -> Result<(), NovaireYtError> {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        if is_paused(env) {
            return Err(NovaireYtError::Paused);
        }
        Ok(())
    }

    /// Delegates to MaturityEngine (the canonical epoch clock) rather than
    /// comparing the locally stored maturity ledger to the current sequence.
    /// Anything other than Active (0) — Matured, Settled, or Archived — counts
    /// as expired, matching the previous semantics where accrual stops once
    /// maturity is reached.
    pub fn is_expired(env: &Env) -> Result<bool, NovaireYtError> {
        let maturity_engine = get_maturity_engine(env)?;
        let epoch_id = get_maturity_engine_epoch_id(env)?;
        let engine_client = MaturityEngineClient::new(env, &maturity_engine);
        Ok(engine_client.live_state(&epoch_id) != 0)
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
    pub fn initialize(
        env: Env,
        admin: Address,
        tokenizer: Address,
        maturity_ledger: u32,
        sy_wrapper: Address,
        maturity_engine: Address,
        maturity_engine_epoch_id: u32,
    ) -> Result<(), NovaireYtError> {
        if storage::is_initialized(&env) {
            return Err(NovaireYtError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Tokenizer, &tokenizer);
        env.storage()
            .instance()
            .set(&DataKey::MaturityLedger, &maturity_ledger);
        env.storage()
            .instance()
            .set(&DataKey::SyWrapper, &sy_wrapper);
        env.storage()
            .instance()
            .set(&DataKey::MaturityEngine, &maturity_engine);
        env.storage()
            .instance()
            .set(&DataKey::MaturityEngineEpochId, &maturity_engine_epoch_id);

        storage::set_total_supply(&env, 0i128);
        storage::set_yield_index(&env, 0i128);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

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

        env.events()
            .publish((Symbol::new(&env, "yt_index_updated"),), new_index);
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

    /// Computes what the local yield index would become given a Tokenizer surplus
    /// snapshot, without mutating storage. Mirrors `Tokenizer::preview_yield_index`
    /// exactly, but reads `total_supply`/`yield_index` from this contract's own
    /// storage directly instead of over a cross-contract call (see
    /// `TokenizerInterface`'s doc comment for why).
    fn compute_local_index_preview(
        env: &Env,
        current_surplus_raw: i128,
        last_surplus_raw: i128,
    ) -> Result<i128, NovaireYtError> {
        let old_index = storage::get_yield_index(env);
        let total_yt_supply = storage::get_total_supply(env);

        if total_yt_supply > 0 && current_surplus_raw > last_surplus_raw {
            let delta_surplus_raw = current_surplus_raw
                .checked_sub(last_surplus_raw)
                .ok_or(NovaireYtError::MathUnderflow)?;
            let delta_surplus_underlying = delta_surplus_raw / YIELD_SCALAR;
            if delta_surplus_underlying > 0 {
                let delta_reward_per_yt = delta_surplus_underlying
                    .checked_mul(YIELD_SCALAR)
                    .ok_or(NovaireYtError::MathOverflow)?
                    .checked_div(total_yt_supply)
                    .ok_or(NovaireYtError::MathUnderflow)?;
                return old_index
                    .checked_add(delta_reward_per_yt)
                    .ok_or(NovaireYtError::MathOverflow);
            }
        }
        Ok(old_index)
    }

    /// Refreshes the local yield index from the Tokenizer's real accrued surplus.
    /// This is the core H4 fix: ensures the index reflects real accrued yield
    /// before any user-initiated balance mutation (transfer, transfer_from).
    ///
    /// Safety:
    /// - The index can only increase (mirrors Tokenizer's own guard).
    /// - Skipped if Tokenizer is not configured (backward compatibility).
    /// - Skipped post-maturity (yield is frozen at settlement).
    /// - Best-effort: swallows failures rather than blocking a transfer.
    fn refresh_index_locally(env: &Env) {
        // Skip if past maturity — yield accrual is frozen. Delegates to
        // MaturityEngine (the canonical epoch clock) rather than a local
        // ledger-vs-maturity comparison.
        if let Ok(true) = storage::is_expired(env) {
            return;
        }

        // M-2: harmless/expected - an uninitialized or not-yet-wired Tokenizer means
        // there's nothing to refresh against yet (e.g. this YtToken instance predates
        // Tokenizer wiring, or is only used in isolation in some tests). Silently
        // skipping costs nothing economically: no index update happens, so no user
        // gets over- or under-credited.
        let tokenizer_addr = match storage::get_tokenizer(env) {
            Ok(addr) => addr,
            Err(_) => return,
        };
        let tokenizer_client = TokenizerClient::new(env, &tokenizer_addr);

        // M-2: harmless/expected - if the cross-contract read itself fails (e.g.
        // Tokenizer temporarily unreachable/misconfigured), there is no snapshot to
        // compute a delta from, so skipping is safe. Made observable via an event
        // rather than a silent `return`, since a *persistently* failing snapshot read
        // would otherwise starve YT holders of yield credit with no on-chain trace.
        let (current_surplus_raw, last_surplus_raw) =
            match tokenizer_client.try_get_surplus_snapshot() {
                Ok(Ok(snapshot)) => snapshot,
                _ => {
                    env.events()
                        .publish((Symbol::new(env, "yt_surplus_snapshot_read_failed"),), ());
                    return;
                }
            };

        let auth_record_baseline = || {
            env.authorize_as_current_contract(soroban_sdk::vec![
                env,
                soroban_sdk::auth::InvokerContractAuthEntry::Contract(
                    soroban_sdk::auth::SubContractInvocation {
                        context: soroban_sdk::auth::ContractContext {
                            contract: tokenizer_addr.clone(),
                            fn_name: Symbol::new(env, "record_surplus_baseline_pub"),
                            args: soroban_sdk::vec![env],
                        },
                        sub_invocations: soroban_sdk::vec![env],
                    },
                )
            ]);
        };

        if let Ok(new_index) =
            Self::compute_local_index_preview(env, current_surplus_raw, last_surplus_raw)
        {
            let old_index = storage::get_yield_index(env);
            if new_index > old_index {
                // M-2 (economically-incorrect-if-swallowed): `new_index` was computed
                // as a DELTA against Tokenizer's `LastRecordedSurplus` baseline. If we
                // persisted `new_index` here but the baseline reset below then failed,
                // the next call would recompute the *same* already-credited delta
                // against the still-stale baseline and double-credit it into the index.
                // So the local credit and the remote baseline reset must succeed or
                // fail together: only persist `new_index` if the baseline reset that
                // makes it safe to do so actually lands. On failure, skip the credit
                // this cycle (nothing lost - the same raw snapshot delta is simply
                // retried on the next call) and emit an event so a silently-wedged
                // baseline reset is observable rather than quietly capping YT yield.
                auth_record_baseline();
                match tokenizer_client.try_record_surplus_baseline_pub() {
                    Ok(Ok(())) => storage::set_yield_index(env, new_index),
                    _ => {
                        env.events().publish(
                            (Symbol::new(env, "yt_baseline_record_failed"),),
                            (current_surplus_raw, last_surplus_raw),
                        );
                    }
                }
                return;
            }
        }

        // No accrual credited this cycle (either no delta, or the preview itself
        // errored) - still worth opportunistically nudging the baseline forward so a
        // future call's delta stays tight, but failure here is genuinely harmless
        // best-effort: no local index credit is contingent on it.
        auth_record_baseline();
        let _ = tokenizer_client.try_record_surplus_baseline_pub();
    }

    fn internal_checkpoint_user(env: &Env, user: &Address) -> Result<(), NovaireYtError> {
        let current_index = storage::get_yield_index(env);
        let user_index = storage::get_user_yield_index(env, user);
        let balance = storage::get_balance(env, user);

        if balance > 0 && current_index > user_index {
            let index_delta = current_index
                .checked_sub(user_index)
                .ok_or(NovaireYtError::MathUnderflow)?;
            let scaled_yield = index_delta
                .checked_mul(balance)
                .ok_or(NovaireYtError::MathOverflow)?;
            let yield_earned = scaled_yield / YIELD_SCALAR; // Integer division is safe here

            let mut accrued = storage::get_accrued_yield(env, user);
            accrued = accrued
                .checked_add(yield_earned)
                .ok_or(NovaireYtError::MathOverflow)?;
            storage::set_accrued_yield(env, user, accrued);

            env.events().publish(
                (Symbol::new(env, "yt_checkpoint"), user.clone()),
                (current_index, accrued),
            );
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

        if amount <= 0 {
            return Err(NovaireYtError::InvalidAmount);
        }

        let mut accrued = storage::get_accrued_yield(&env, &user);
        accrued = accrued
            .checked_add(amount)
            .ok_or(NovaireYtError::MathOverflow)?;
        storage::set_accrued_yield(&env, &user, accrued);
        env.events()
            .publish((Symbol::new(&env, "yt_historical_credit"), user), amount);

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
        total_supply = total_supply
            .checked_add(amount)
            .ok_or(NovaireYtError::MathOverflow)?;
        storage::set_total_supply(&env, total_supply);

        let mut balance = storage::get_balance(&env, &to);
        balance = balance
            .checked_add(amount)
            .ok_or(NovaireYtError::MathOverflow)?;
        storage::set_balance(&env, &to, balance);

        env.events().publish(
            (Symbol::new(&env, "yt_mint"), tokenizer, to),
            (amount, total_supply),
        );
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
        balance = balance
            .checked_sub(amount)
            .ok_or(NovaireYtError::MathUnderflow)?;
        storage::set_balance(&env, &from, balance);

        let mut total_supply = storage::get_total_supply(&env);
        total_supply = total_supply
            .checked_sub(amount)
            .ok_or(NovaireYtError::MathUnderflow)?;
        storage::set_total_supply(&env, total_supply);

        env.events().publish(
            (Symbol::new(&env, "yt_burn"), tokenizer, from),
            (amount, total_supply),
        );
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
    pub fn transfer(
        env: Env,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), NovaireYtError> {
        from.require_auth();

        if amount <= 0 {
            return Err(NovaireYtError::InvalidAmount);
        }

        // H4 fix: Refresh global index from the live SY exchange rate
        // BEFORE checkpointing either party. This ensures that yield
        // accrued during the sender's holding period is permanently
        // locked to the sender and cannot transfer to the receiver.
        Self::refresh_index_locally(&env);

        Self::internal_checkpoint_user(&env, &from)?;
        Self::internal_checkpoint_user(&env, &to)?;

        let mut from_balance = storage::get_balance(&env, &from);
        if from_balance < amount {
            return Err(NovaireYtError::InsufficientBalance);
        }
        from_balance = from_balance
            .checked_sub(amount)
            .ok_or(NovaireYtError::MathUnderflow)?;
        storage::set_balance(&env, &from, from_balance);

        let mut to_balance = storage::get_balance(&env, &to);
        to_balance = to_balance
            .checked_add(amount)
            .ok_or(NovaireYtError::MathOverflow)?;
        storage::set_balance(&env, &to, to_balance);

        env.events()
            .publish((Symbol::new(&env, "transfer"), from, to), amount);
        Ok(())
    }

    /// Approves a spender to transfer up to `amount` of the caller's tokens.
    pub fn approve(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
        _expiration_ledger: u32,
    ) -> Result<(), NovaireYtError> {
        from.require_auth();

        if amount < 0 {
            return Err(NovaireYtError::InvalidAmount);
        }

        storage::set_allowance(&env, &from, &spender, amount);
        env.events()
            .publish((Symbol::new(&env, "approve"), from, spender), amount);
        Ok(())
    }

    /// Transfers tokens from one address to another using an allowance.
    /// Checkpoints both sender and recipient.
    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), NovaireYtError> {
        spender.require_auth();

        if amount <= 0 {
            return Err(NovaireYtError::InvalidAmount);
        }

        // H4 fix: Refresh global index from the live SY exchange rate
        // BEFORE checkpointing either party.
        Self::refresh_index_locally(&env);

        Self::internal_checkpoint_user(&env, &from)?;
        Self::internal_checkpoint_user(&env, &to)?;

        let mut allowance = storage::get_allowance(&env, &from, &spender);
        if allowance < amount {
            return Err(NovaireYtError::InsufficientAllowance);
        }
        allowance = allowance
            .checked_sub(amount)
            .ok_or(NovaireYtError::MathUnderflow)?;
        storage::set_allowance(&env, &from, &spender, allowance);

        let mut from_balance = storage::get_balance(&env, &from);
        if from_balance < amount {
            return Err(NovaireYtError::InsufficientBalance);
        }
        from_balance = from_balance
            .checked_sub(amount)
            .ok_or(NovaireYtError::MathUnderflow)?;
        storage::set_balance(&env, &from, from_balance);

        let mut to_balance = storage::get_balance(&env, &to);
        to_balance = to_balance
            .checked_add(amount)
            .ok_or(NovaireYtError::MathOverflow)?;
        storage::set_balance(&env, &to, to_balance);

        env.events()
            .publish((Symbol::new(&env, "transfer"), from, to), amount);
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

        env.events().publish(
            (Symbol::new(&env, "yt_paused"), admin),
            env.ledger().sequence(),
        );
        Ok(())
    }

    /// Unpauses Tokenizer integrations.
    pub fn unpause(env: Env) -> Result<(), NovaireYtError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);

        env.events().publish(
            (Symbol::new(&env, "yt_unpaused"), admin),
            env.ledger().sequence(),
        );
        Ok(())
    }

    // Tokenizer and SY Wrapper addresses are immutable after `initialize`
    // (Phase 2 decentralization: no admin key, however authenticated, may
    // redirect mint/burn authority or the live yield-index source once the
    // contract is live).

    /// Initiates a two-step admin transfer to a new address.
    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), NovaireYtError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);

        env.events()
            .publish((Symbol::new(&env, "yt_admin_transfer"), admin), new_admin);
        Ok(())
    }

    /// Accepts a pending admin transfer, finalizing the change of administration.
    pub fn accept_admin(env: Env) -> Result<(), NovaireYtError> {
        let pending_admin: Address =
            storage::get_pending_admin(&env).ok_or(NovaireYtError::InvalidAdminTransfer)?;
        pending_admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Admin, &pending_admin);
        env.storage().instance().remove(&DataKey::PendingAdmin);

        env.events()
            .publish((Symbol::new(&env, "yt_admin_accepted"),), pending_admin);
        Ok(())
    }

    // ==========================================
    // VIEW FUNCTIONS
    // ==========================================

    /// Simulates what a user is currently owed based on their balance and the live index.
    /// H4 fix: Uses the live SY exchange rate (if available) to provide an accurate
    /// real-time view of pending yield, even when the stored global index is stale.
    pub fn claimable_yield(env: Env, user: Address) -> Result<i128, NovaireYtError> {
        // Determine the best available index: a live, locally-computed preview of
        // the Tokenizer's reward-per-YT accumulator (via the YtToken-free
        // `get_surplus_snapshot` getter — see `TokenizerInterface`'s doc comment)
        // if we are pre-maturity, otherwise fall back to the stored global index.
        //
        // Only safe for callers where Tokenizer is NOT already on the call stack
        // (e.g. a direct/external query). Tokenizer itself must use
        // `claimable_yield_with_snapshot` instead — see that fn's doc comment.
        let effective_index = {
            let stored_index = storage::get_yield_index(&env);
            let is_expired = storage::is_expired(&env).unwrap_or(true);
            if is_expired {
                stored_index
            } else {
                match storage::get_tokenizer(&env) {
                    Ok(tokenizer_addr) => {
                        let tokenizer_client = TokenizerClient::new(&env, &tokenizer_addr);
                        match tokenizer_client.try_get_surplus_snapshot() {
                            Ok(Ok((current, last))) => {
                                Self::compute_local_index_preview(&env, current, last)
                                    .unwrap_or(stored_index)
                            }
                            _ => stored_index,
                        }
                    }
                    Err(_) => stored_index,
                }
            }
        };

        Self::compute_claimable_from_index(&env, &user, effective_index)
    }

    /// Re-entry-safe twin of `claimable_yield`, for use by Tokenizer only.
    ///
    /// Tokenizer's `claim_yield` calls into YtToken (`checkpoint_user`/
    /// `claimable_yield`) while its own frame is still active; if YtToken then
    /// tried to call back into Tokenizer (as `claimable_yield`'s live-preview
    /// branch does via `get_surplus_snapshot`), Soroban rejects it as contract
    /// re-entry (`Error(Contract, #10)`) since Tokenizer would be invoked while
    /// already on the stack.
    ///
    /// Tokenizer always calls `refresh_yield_index_and_get_surplus` (which
    /// writes YtToken's stored `yield_index` and resets `LastRecordedSurplus`
    /// to the current surplus) before reaching claim math, whenever the epoch
    /// is pre-maturity. So by the time this is called, `current_surplus_raw`
    /// and `last_surplus_raw` are identical (both equal the just-recorded
    /// surplus) and `compute_local_index_preview` collapses to a no-op,
    /// returning the just-refreshed stored index unchanged — the exact value
    /// the callback path would have produced. Passing the snapshot explicitly
    /// (rather than re-deriving it) keeps this a pure function of caller-
    /// supplied state, eliminating the Tokenizer -> YtToken -> Tokenizer cycle.
    pub fn claimable_yield_with_snapshot(
        env: Env,
        user: Address,
        current_surplus_raw: i128,
        last_surplus_raw: i128,
    ) -> Result<i128, NovaireYtError> {
        let effective_index = {
            let stored_index = storage::get_yield_index(&env);
            let is_expired = storage::is_expired(&env).unwrap_or(true);
            if is_expired {
                stored_index
            } else {
                Self::compute_local_index_preview(&env, current_surplus_raw, last_surplus_raw)
                    .unwrap_or(stored_index)
            }
        };

        Self::compute_claimable_from_index(&env, &user, effective_index)
    }

    fn compute_claimable_from_index(
        env: &Env,
        user: &Address,
        effective_index: i128,
    ) -> Result<i128, NovaireYtError> {
        let accrued = storage::get_accrued_yield(env, user);
        let user_index = storage::get_user_yield_index(env, user);
        let balance = storage::get_balance(env, user);

        let mut pending = 0;
        if balance > 0 && effective_index > user_index {
            let index_delta = effective_index
                .checked_sub(user_index)
                .ok_or(NovaireYtError::MathUnderflow)?;
            let scaled_yield = index_delta
                .checked_mul(balance)
                .ok_or(NovaireYtError::MathOverflow)?;
            pending = scaled_yield / YIELD_SCALAR;
        }

        let total = accrued
            .checked_add(pending)
            .ok_or(NovaireYtError::MathOverflow)?;
        Ok(total)
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        storage::get_balance(&env, &id)
    }

    pub fn total_supply(env: Env) -> i128 {
        storage::get_total_supply(&env)
    }

    pub fn get_yield_index(env: Env) -> i128 {
        storage::get_yield_index(&env)
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

#[cfg(test)]
mod test;
