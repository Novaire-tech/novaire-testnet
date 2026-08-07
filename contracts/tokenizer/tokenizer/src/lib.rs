#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, IntoVal, Symbol,
};

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

/// Cross-contract client for the canonical epoch FSM. Tokenizer no longer
/// derives Open/Matured state from a locally stored maturity ledger — it
/// delegates to MaturityEngine, which is deployed fresh per epoch and always
/// self-assigns epoch_id 1 for the single epoch it opens.
#[soroban_sdk::contractclient(name = "MaturityEngineClient")]
pub trait MaturityEngineInterface {
    fn live_state(env: Env, epoch_id: u32) -> Result<u32, soroban_sdk::Error>;
    fn settle_epoch(env: Env, epoch_id: u32) -> Result<(), soroban_sdk::Error>;
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
    fn get_yield_index(env: Env) -> i128;
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
    /// Canonical epoch-clock contract. Source of truth for Open/Matured state;
    /// `MaturityLedger` is retained only as a display-only value for `metadata()`.
    MaturityEngine,
    /// The epoch_id `MaturityEngine::open_epoch` returned for this deployment —
    /// captured explicitly rather than assumed, since MaturityEngine's own
    /// id-assignment behavior is out of this contract's control.
    MaturityEngineEpochId,
    /// Raw surplus (assets_held_raw - pt_liability_raw) recorded as of the last
    /// reward-per-YT accumulator refresh. See `refresh_yield_index`.
    LastRecordedSurplus,
}

mod storage {
    use super::*;

    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn get_address(env: &Env, key: DataKey) -> Result<Address, NovaireTokenizerError> {
        env.storage()
            .instance()
            .get(&key)
            .ok_or(NovaireTokenizerError::StorageMissing)
    }

    pub fn get_u32(env: &Env, key: DataKey) -> Result<u32, NovaireTokenizerError> {
        env.storage()
            .instance()
            .get(&key)
            .ok_or(NovaireTokenizerError::StorageMissing)
    }

    pub fn get_i128(env: &Env, key: DataKey) -> Result<i128, NovaireTokenizerError> {
        env.storage()
            .instance()
            .get(&key)
            .ok_or(NovaireTokenizerError::StorageMissing)
    }

    pub fn set_i128(env: &Env, key: DataKey, val: i128) {
        env.storage().instance().set(&key, &val);
    }

    pub fn get_settlement_rate(env: &Env) -> Option<i128> {
        env.storage()
            .instance()
            .get(&DataKey::SettlementExchangeRate)
    }

    pub fn set_settlement_rate(env: &Env, val: i128) {
        env.storage()
            .instance()
            .set(&DataKey::SettlementExchangeRate, &val);
    }

    /// Delegates to MaturityEngine (the canonical epoch clock) instead of
    /// re-deriving Open/Matured from a locally stored maturity ledger. Settled
    /// is still Tokenizer's own concept (driven by `SettlementExchangeRate`
    /// being set, which `settle_epoch` sets in the same transaction it advances
    /// MaturityEngine's own state), since freezing the settlement rate is a
    /// Tokenizer-specific economic action MaturityEngine has no notion of.
    pub fn get_epoch_state(env: &Env) -> Result<EpochState, NovaireTokenizerError> {
        if get_settlement_rate(env).is_some() {
            return Ok(EpochState::Settled);
        }

        let maturity_engine = get_address(env, DataKey::MaturityEngine)?;
        let epoch_id = get_u32(env, DataKey::MaturityEngineEpochId)?;
        let engine_client = MaturityEngineClient::new(env, &maturity_engine);
        let live_state = engine_client.live_state(&epoch_id);

        // 0 = Active, 1 = Matured, 2 = Settled, 3 = Archived (MaturityEngine's
        // EpochState). Tokenizer's own EpochState has no Archived variant —
        // Settled/Archived both mean "not open for minting", and Settled here
        // is already handled above via the local settlement-rate check, so any
        // non-Active engine state at this point means Matured-or-later.
        if live_state == 0 {
            Ok(EpochState::Open)
        } else {
            Ok(EpochState::Matured)
        }
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
        maturity_engine: Address,
        maturity_engine_epoch_id: u32,
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
        env.storage()
            .instance()
            .set(&DataKey::SyWrapper, &sy_wrapper);
        env.storage()
            .instance()
            .set(&DataKey::MaturityLedger, &maturity_ledger);
        env.storage()
            .instance()
            .set(&DataKey::MaturityEngine, &maturity_engine);
        env.storage()
            .instance()
            .set(&DataKey::MaturityEngineEpochId, &maturity_engine_epoch_id);
        env.storage().instance().set(&DataKey::EpochId, &1u32);

        storage::set_i128(&env, DataKey::EpochStartIndex, epoch_start_index);
        storage::set_i128(&env, DataKey::TotalPtMinted, 0i128);
        storage::set_i128(&env, DataKey::LastRecordedSurplus, 0i128);

        Ok(())
    }

    /// Mints PT and YT tokens identically in exchange for Vault Shares.
    ///
    /// Requires Epoch State: `Open`
    pub fn mint_pt_yt(
        env: Env,
        user: Address,
        sy_shares: i128,
    ) -> Result<(i128, i128), NovaireTokenizerError> {
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

        // Refresh the reward-per-YT accumulator BEFORE this deposit's own shares/PT
        // are added, so existing YT holders correctly receive their share of organic
        // growth up to this point (distributed over the pre-mint total YT supply).
        // Fixes M2b: previously a claim_yield() withdrawal shrank a user's real
        // backing shares without reducing their YT balance, so crediting organic
        // accrual against the raw exchange rate (instead of an accumulator that
        // tracks actual realized surplus) silently over-credited every holder who
        // had ever claimed, eventually violating solvency on a later claim.
        let pre_mint_surplus_raw = Self::refresh_yield_index_and_get_surplus(&env)?;

        // 1. Pull shares from User to Tokenizer
        let vault_client = VaultClient::new(&env, &vault_addr);
        vault_client.transfer_shares(&user, &env.current_contract_address(), &sy_shares);

        // 2. Mint PT
        let pt_client = PtTokenClient::new(&env, &pt_token_addr);
        pt_client.mint(&user, &sy_shares);

        // 3. Mint YT (checkpoints the user's pre-mint balance against the
        // just-refreshed accumulator, then adds the new tokens)
        let sy_client = SyWrapperClient::new(&env, &sy_wrapper_addr);
        let exchange_rate = sy_client.get_exchange_rate();

        let yt_client = YtTokenClient::new(&env, &yt_token_addr);
        yt_client.mint(&user, &sy_shares);

        // M2 Fix: Credit historical yield to late minters. This tranche's own
        // deposit intrinsically funds this credit — it deposits at the current,
        // already-grown exchange rate but is only liable for `epoch_start_index`
        // principal, so the difference is fully self-backed and never draws on
        // any other holder's surplus.
        let epoch_start_index = storage::get_i128(&env, DataKey::EpochStartIndex)?;
        let mut structural_margin_raw: i128 = 0;
        if exchange_rate > epoch_start_index {
            let index_delta = exchange_rate
                .checked_sub(epoch_start_index)
                .ok_or(NovaireTokenizerError::MathUnderflow)?;
            structural_margin_raw = index_delta
                .checked_mul(sy_shares)
                .ok_or(NovaireTokenizerError::MathOverflow)?;
            let historical_yield = structural_margin_raw / 1_000_000_000;
            if historical_yield > 0 {
                yt_client.add_accrued_yield(&user, &historical_yield);
            }
        }

        // Absorb this deposit's structural surplus contribution into the recorded
        // baseline so it isn't later misattributed as organic growth to distribute
        // to ALL holders — it belongs solely to this tranche, already credited above.
        // Derived arithmetically from the pre-mint surplus plus this mint's own
        // known contribution (sy_shares * (exchange_rate - epoch_start_index)),
        // instead of a second `compute_surplus_raw` cross-contract round-trip.
        let post_mint_surplus_raw = pre_mint_surplus_raw
            .checked_add(structural_margin_raw)
            .ok_or(NovaireTokenizerError::MathOverflow)?;
        env.storage()
            .instance()
            .set(&DataKey::LastRecordedSurplus, &post_mint_surplus_raw);

        // 4. Update Internal Accounting
        let mut total_pt_minted = storage::get_i128(&env, DataKey::TotalPtMinted)?;
        total_pt_minted = total_pt_minted
            .checked_add(sy_shares)
            .ok_or(NovaireTokenizerError::MathOverflow)?;
        storage::set_i128(&env, DataKey::TotalPtMinted, total_pt_minted);

        env.events().publish(
            (Symbol::new(&env, "tokenizer_minted"), user),
            (sy_shares, sy_shares, sy_shares),
        );

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

        let mut pre_claim_surplus_raw: Option<i128> = None;
        let exchange_rate = match state {
            EpochState::Open | EpochState::Matured => {
                // Pre-settlement (yield generated before settlement belongs to YT
                // holders): refresh the reward-per-YT accumulator from real accrued
                // surplus (not the raw exchange rate — see the M2 fix note in
                // mint_pt_yt) before checkpointing the claimant.
                pre_claim_surplus_raw = Some(Self::refresh_yield_index_and_get_surplus(&env)?);
                sy_client.get_exchange_rate()
            }
            EpochState::Settled => {
                // Post-settlement: use the locked settlement rate
                storage::get_settlement_rate(&env).ok_or(NovaireTokenizerError::StorageMissing)?
            }
        };

        // Checkpoint the user so their internal math catches up to the global index
        yt_client
            .try_checkpoint_user(&user)
            .map_err(|_| NovaireTokenizerError::MathUnderflow)?;
        let claimable = yt_client.claimable_yield(&user);

        if claimable <= 0 {
            return Err(NovaireTokenizerError::InvalidAmount);
        }

        // Reset user claim math
        yt_client.reset_claimable(&user);

        // Convert scaled yield (1e9) to exact Vault Shares using the active exchange rate
        let shares_to_withdraw = claimable
            .checked_mul(1_000_000_000)
            .ok_or(NovaireTokenizerError::MathOverflow)?
            / exchange_rate;

        // Withdraw underlying physical assets via the Vault
        let vault_addr = storage::get_address(&env, DataKey::Vault)?;
        let vault_client = VaultClient::new(&env, &vault_addr);
        // Vault::withdraw_for requires auth from `withdrawer` (this contract), but the
        // call to it happens through the Tokenizer -> Vault hop, so it needs an explicit
        // sub-invocation authorization rather than a direct require_auth call.
        env.authorize_as_current_contract(soroban_sdk::vec![
            &env,
            soroban_sdk::auth::InvokerContractAuthEntry::Contract(
                soroban_sdk::auth::SubContractInvocation {
                    context: soroban_sdk::auth::ContractContext {
                        contract: vault_addr.clone(),
                        fn_name: Symbol::new(&env, "withdraw_for"),
                        args: soroban_sdk::vec![
                            &env,
                            env.current_contract_address().into_val(&env),
                            user.clone().into_val(&env),
                            shares_to_withdraw.into_val(&env),
                        ],
                    },
                    sub_invocations: soroban_sdk::vec![&env],
                }
            )
        ]);
        let actual_underlying =
            vault_client.withdraw_for(&env.current_contract_address(), &user, &shares_to_withdraw);

        // Record the post-withdrawal (now lower) surplus baseline so the next
        // accumulator refresh measures organic growth from this correctly-reduced
        // starting point, instead of over-crediting against the pre-claim surplus.
        // Derived arithmetically from the pre-claim surplus minus exactly what was
        // just withdrawn (shares_to_withdraw * exchange_rate), instead of a second
        // `compute_surplus_raw` cross-contract round-trip. Skipped in the Settled
        // state, where no further refresh will ever read this baseline again (the
        // accumulator is frozen at settlement).
        if let Some(pre_claim_surplus_raw) = pre_claim_surplus_raw {
            let withdrawn_raw = shares_to_withdraw
                .checked_mul(exchange_rate)
                .ok_or(NovaireTokenizerError::MathOverflow)?;
            let post_claim_surplus_raw = pre_claim_surplus_raw
                .checked_sub(withdrawn_raw)
                .ok_or(NovaireTokenizerError::MathUnderflow)?;
            env.storage()
                .instance()
                .set(&DataKey::LastRecordedSurplus, &post_claim_surplus_raw);
        }

        env.events().publish(
            (Symbol::new(&env, "tokenizer_claimed"), user),
            (actual_underlying, shares_to_withdraw),
        );
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

        // Final distribution of any remaining organic growth to current YT holders
        // (via the reward-per-YT accumulator) before the settlement rate freezes it.
        // This guarantees that ANY remaining yield in the Tokenizer belongs to YT holders.
        Self::refresh_yield_index(env.clone())?;

        let settlement_rate = sy_client.get_exchange_rate();
        storage::set_settlement_rate(&env, settlement_rate);

        // Advance the canonical epoch clock in lockstep, in the same transaction,
        // now that this contract's own settlement rate is frozen. MaturityEngine's
        // own `settle_epoch` requires its dynamic state to already be Matured,
        // which is guaranteed here since `get_epoch_state` above already checked
        // it via `live_state`.
        let maturity_engine_addr = storage::get_address(&env, DataKey::MaturityEngine)?;
        let maturity_engine_epoch_id = storage::get_u32(&env, DataKey::MaturityEngineEpochId)?;
        let maturity_engine_client = MaturityEngineClient::new(&env, &maturity_engine_addr);
        maturity_engine_client.settle_epoch(&maturity_engine_epoch_id);

        let epoch_id = storage::get_u32(&env, DataKey::EpochId)?;
        env.events().publish(
            (Symbol::new(&env, "tokenizer_settled"),),
            (epoch_id, settlement_rate),
        );

        Self::assert_invariant(env.clone())?;
        Ok(())
    }

    /// Redeems PT for guaranteed principal physical underlying assets.
    ///
    /// Requires Epoch State: `Settled`. (Post-maturity, post-settlement).
    pub fn redeem_pt(
        env: Env,
        user: Address,
        pt_amount: i128,
    ) -> Result<i128, NovaireTokenizerError> {
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
        let settlement_rate =
            storage::get_settlement_rate(&env).ok_or(NovaireTokenizerError::StorageMissing)?;
        let shares_to_withdraw = pt_amount
            .checked_mul(epoch_start_index)
            .ok_or(NovaireTokenizerError::MathOverflow)?
            / settlement_rate;

        // 4. Withdraw physical assets via Vault
        let vault_addr = storage::get_address(&env, DataKey::Vault)?;
        let vault_client = VaultClient::new(&env, &vault_addr);
        env.authorize_as_current_contract(soroban_sdk::vec![
            &env,
            soroban_sdk::auth::InvokerContractAuthEntry::Contract(
                soroban_sdk::auth::SubContractInvocation {
                    context: soroban_sdk::auth::ContractContext {
                        contract: vault_addr.clone(),
                        fn_name: Symbol::new(&env, "withdraw_for"),
                        args: soroban_sdk::vec![
                            &env,
                            env.current_contract_address().into_val(&env),
                            user.clone().into_val(&env),
                            shares_to_withdraw.into_val(&env),
                        ],
                    },
                    sub_invocations: soroban_sdk::vec![&env],
                }
            )
        ]);
        let actual_underlying =
            vault_client.withdraw_for(&env.current_contract_address(), &user, &shares_to_withdraw);

        env.events().publish(
            (Symbol::new(&env, "tokenizer_redeemed"), user),
            (pt_amount, actual_underlying),
        );
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

    /// Raw surplus = assets_held_raw - pt_liability_raw, where assets_held_raw
    /// includes PT principal PLUS unclaimed yield for YT holders, and
    /// pt_liability_raw is the minimum PT principal requirement. Both are raw
    /// (pre-1e9-scaled) cross-multiplied values to avoid division truncation
    /// masking sub-unit insolvencies. Shared by `assert_invariant` and the
    /// reward-per-YT accumulator (`refresh_yield_index` / `preview_yield_index`).
    fn compute_surplus_raw(env: &Env) -> Result<i128, NovaireTokenizerError> {
        let pt_token_addr = storage::get_address(env, DataKey::PtToken)?;
        let pt_client = PtTokenClient::new(env, &pt_token_addr);
        let pt_outstanding = pt_client.total_supply();

        let vault_addr = storage::get_address(env, DataKey::Vault)?;
        let vault_client = VaultClient::new(env, &vault_addr);
        let sy_shares_held = vault_client.balance_of(&env.current_contract_address());

        let sy_wrapper_addr = storage::get_address(env, DataKey::SyWrapper)?;
        let sy_client = SyWrapperClient::new(env, &sy_wrapper_addr);

        let current_exchange_rate = match storage::get_settlement_rate(env) {
            Some(rate) => rate, // If settled, the backing required is locked to the settlement rate.
            None => sy_client.get_exchange_rate(),
        };

        let epoch_start_index = storage::get_i128(env, DataKey::EpochStartIndex)?;

        let pt_liability_raw = pt_outstanding
            .checked_mul(epoch_start_index)
            .ok_or(NovaireTokenizerError::MathOverflow)?;
        let assets_held_raw = sy_shares_held
            .checked_mul(current_exchange_rate)
            .ok_or(NovaireTokenizerError::MathOverflow)?;

        assets_held_raw
            .checked_sub(pt_liability_raw)
            .ok_or(NovaireTokenizerError::MathUnderflow)
    }

    /// Records the current raw surplus as the baseline for the next reward-per-YT
    /// accumulator refresh. Must be called after any operation that changes
    /// surplus for a reason OTHER than organic yield growth (a mint's own
    /// structural margin, or a claim's withdrawal), so that effect isn't later
    /// misattributed as distributable organic growth.
    fn record_surplus_baseline(env: Env) -> Result<(), NovaireTokenizerError> {
        let surplus = Self::compute_surplus_raw(&env)?;
        env.storage()
            .instance()
            .set(&DataKey::LastRecordedSurplus, &surplus);
        Ok(())
    }

    /// Read-only `(current_surplus_raw, last_recorded_surplus_raw)` snapshot.
    ///
    /// Deliberately does NOT call into YtToken (unlike `preview_yield_index` /
    /// `refresh_yield_index`, which read/write YtToken's index directly). This is
    /// the function YtToken itself calls (from `transfer`/`transfer_from`/
    /// `claimable_yield`) to compute its own index update locally — Soroban
    /// rejects a contract calling back into itself further up the same call
    /// stack ("contract re-entry"), so YtToken cannot safely call
    /// `preview_yield_index`/`refresh_yield_index` (which call back into
    /// YtToken) from within its own entry points. This getter breaks that cycle.
    pub fn get_surplus_snapshot(env: Env) -> Result<(i128, i128), NovaireTokenizerError> {
        let current = Self::compute_surplus_raw(&env)?;
        let last: i128 = env
            .storage()
            .instance()
            .get(&DataKey::LastRecordedSurplus)
            .unwrap_or(0i128);
        Ok((current, last))
    }

    /// Public wrapper around `record_surplus_baseline`, safe for YtToken to call
    /// for the same reason as `get_surplus_snapshot` (touches no YtToken state).
    pub fn record_surplus_baseline_pub(env: Env) -> Result<(), NovaireTokenizerError> {
        Self::record_surplus_baseline(env)
    }

    /// Previews what the YT reward-per-share accumulator (`YtToken::yield_index`)
    /// would become if `refresh_yield_index` were called right now, without
    /// mutating any state. Used both internally and by `YtToken::claimable_yield`
    /// for a live, pre-refresh preview of pending yield.
    ///
    /// This is the fix for the M2 double-mint insolvency bug: rather than driving
    /// YT accrual off the raw SyWrapper exchange rate (which implicitly assumes
    /// 1 YT token is always backed by exactly 1 real vault share — true only at
    /// genesis, and broken the moment any claim withdraws real shares without
    /// reducing YT balance), the index only ever advances by
    /// (realized surplus growth / current YT supply), i.e. a proper
    /// reward-per-share accumulator. A user's real backing shrinking after a
    /// claim can no longer cause their nominal YT balance to be over-credited on
    /// subsequent accrual.
    pub fn preview_yield_index(env: Env) -> Result<i128, NovaireTokenizerError> {
        let yt_token_addr = storage::get_address(&env, DataKey::YtToken)?;
        let yt_client = YtTokenClient::new(&env, &yt_token_addr);
        let total_yt_supply = yt_client.total_supply();
        let old_index = yt_client.get_yield_index();

        let current_surplus_raw = Self::compute_surplus_raw(&env)?;
        let last_surplus_raw: i128 = env
            .storage()
            .instance()
            .get(&DataKey::LastRecordedSurplus)
            .unwrap_or(0i128);

        if total_yt_supply > 0 && current_surplus_raw > last_surplus_raw {
            let delta_surplus_raw = current_surplus_raw
                .checked_sub(last_surplus_raw)
                .ok_or(NovaireTokenizerError::MathUnderflow)?;
            let delta_surplus_underlying = delta_surplus_raw / 1_000_000_000;
            if delta_surplus_underlying > 0 {
                let delta_reward_per_yt = delta_surplus_underlying
                    .checked_mul(1_000_000_000)
                    .ok_or(NovaireTokenizerError::MathOverflow)?
                    .checked_div(total_yt_supply)
                    .ok_or(NovaireTokenizerError::MathUnderflow)?;
                return old_index
                    .checked_add(delta_reward_per_yt)
                    .ok_or(NovaireTokenizerError::MathOverflow);
            }
        }
        Ok(old_index)
    }

    /// Advances the YT reward-per-share accumulator to reflect any organic
    /// surplus growth since the last refresh, records the new baseline, and
    /// returns the surplus it computed — so callers on the hot path
    /// (`mint_pt_yt`, `claim_yield`) can derive their own post-operation
    /// baseline arithmetically instead of paying for another full
    /// `compute_surplus_raw` (3 more cross-contract calls). This function
    /// itself already computes `compute_surplus_raw` exactly once (rather than
    /// delegating to `preview_yield_index` + `record_surplus_baseline`, which
    /// would each recompute it) — `mint_pt_yt`/`claim_yield` are themselves
    /// called from `intent_engine`'s multi-hop flows, and the extra
    /// cross-contract calls from a duplicated computation were enough to blow
    /// the transaction's CPU budget on testnet.
    fn refresh_yield_index_and_get_surplus(env: &Env) -> Result<i128, NovaireTokenizerError> {
        let yt_token_addr = storage::get_address(env, DataKey::YtToken)?;
        let yt_client = YtTokenClient::new(env, &yt_token_addr);
        let total_yt_supply = yt_client.total_supply();
        let old_index = yt_client.get_yield_index();

        let current_surplus_raw = Self::compute_surplus_raw(env)?;
        let last_surplus_raw: i128 = env
            .storage()
            .instance()
            .get(&DataKey::LastRecordedSurplus)
            .unwrap_or(0i128);

        if total_yt_supply > 0 && current_surplus_raw > last_surplus_raw {
            let delta_surplus_raw = current_surplus_raw
                .checked_sub(last_surplus_raw)
                .ok_or(NovaireTokenizerError::MathUnderflow)?;
            let delta_surplus_underlying = delta_surplus_raw / 1_000_000_000;
            if delta_surplus_underlying > 0 {
                let delta_reward_per_yt = delta_surplus_underlying
                    .checked_mul(1_000_000_000)
                    .ok_or(NovaireTokenizerError::MathOverflow)?
                    .checked_div(total_yt_supply)
                    .ok_or(NovaireTokenizerError::MathUnderflow)?;
                let new_index = old_index
                    .checked_add(delta_reward_per_yt)
                    .ok_or(NovaireTokenizerError::MathOverflow)?;
                if new_index > old_index {
                    yt_client.update_yield_index(&new_index);
                }
            }
        }

        env.storage()
            .instance()
            .set(&DataKey::LastRecordedSurplus, &current_surplus_raw);
        Ok(current_surplus_raw)
    }

    /// Permissionless (like `SyWrapper::refresh_rate`) — callable by anyone.
    /// Public entry-point wrapper around `refresh_yield_index_and_get_surplus`
    /// for external/keeper use, where the returned surplus isn't needed.
    pub fn refresh_yield_index(env: Env) -> Result<(), NovaireTokenizerError> {
        Self::refresh_yield_index_and_get_surplus(&env)?;
        Ok(())
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
        if storage::get_epoch_state(&env)? == EpochState::Open && pt_outstanding != yt_outstanding {
            return Err(NovaireTokenizerError::InvariantViolated);
        }

        // INVARIANT 2: Tokenizer must hold enough Vault Shares to mathematically
        // satisfy the outstanding PT principal guarantee (surplus >= 0).
        if Self::compute_surplus_raw(&env)? < 0 {
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
    use soroban_sdk::{testutils::Address as _, testutils::Ledger, token, Address, Env, Map};

    use maturity_engine::{MaturityEngine, MaturityEngineClient as RealMaturityEngineClient};
    use pt_token::{PtToken, PtTokenClient as RealPtClient};
    use sy_wrapper::{Positions, Request, SyWrapper, SyWrapperClient as RealSyWrapperClient};
    use vault::{Vault, VaultClient as RealVaultClient};
    use yt_token::{YtToken, YtTokenClient as RealYtClient};

    // Minimal stand-in for the real Blend Capital Pool contract, implementing just enough
    // of `submit`/`get_positions` for sy_wrapper's `deposit`/`withdraw` to be exercised
    // here. `sy_wrapper`'s own richer `MockBlendPool` (in `audit_tests`) is
    // `#[cfg(test)]`-gated and so isn't part of its compiled dev-dependency surface.
    #[soroban_sdk::contracttype]
    #[derive(Clone)]
    enum PoolDataKey {
        Underlying,
        Supply(Address),
    }

    #[soroban_sdk::contract]
    pub struct MockBlendPool;

    #[soroban_sdk::contractimpl]
    impl MockBlendPool {
        pub fn init(env: Env, underlying: Address) {
            env.storage()
                .instance()
                .set(&PoolDataKey::Underlying, &underlying);
        }

        pub fn submit(
            env: Env,
            from: Address,
            spender: Address,
            to: Address,
            requests: soroban_sdk::Vec<Request>,
        ) -> Positions {
            let underlying: Address = env
                .storage()
                .instance()
                .get(&PoolDataKey::Underlying)
                .unwrap();
            let token_client = token::Client::new(&env, &underlying);
            let this = env.current_contract_address();

            let mut supply: i128 = env
                .storage()
                .instance()
                .get(&PoolDataKey::Supply(from.clone()))
                .unwrap_or(0);

            for req in requests.iter() {
                if req.request_type == 0 {
                    token_client.transfer_from(&this, &spender, &this, &req.amount);
                    supply += req.amount;
                } else if req.request_type == 1 {
                    let amt = if req.amount > supply {
                        supply
                    } else {
                        req.amount
                    };
                    token_client.transfer(&this, &to, &amt);
                    supply -= amt;
                }
            }

            env.storage()
                .instance()
                .set(&PoolDataKey::Supply(from), &supply);
            Self::positions_for(&env, supply)
        }

        pub fn get_positions(env: Env, address: Address) -> Positions {
            let supply: i128 = env
                .storage()
                .instance()
                .get(&PoolDataKey::Supply(address))
                .unwrap_or(0);
            Self::positions_for(&env, supply)
        }

        fn positions_for(env: &Env, supply: i128) -> Positions {
            let mut supply_map = Map::new(env);
            if supply > 0 {
                supply_map.set(1u32, supply);
            }
            Positions {
                collateral: Map::new(env),
                liabilities: Map::new(env),
                supply: supply_map,
            }
        }
    }

    #[test]
    fn test_tokenizer_state_machine() {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();

        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_contract = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract);
        let _token_client = token::Client::new(&env, &token_contract);

        token_admin_client.mint(&user, &2000);

        let pool_id = env.register(MockBlendPool, ());
        MockBlendPoolClient::new(&env, &pool_id).init(&token_contract);
        let yield_source = pool_id;

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

        let maturity_engine_id = env.register(MaturityEngine, ());
        let maturity_engine_client = RealMaturityEngineClient::new(&env, &maturity_engine_id);
        maturity_engine_client.initialize(&admin);
        let maturity_epoch_id = maturity_engine_client.open_epoch(&maturity_ledger);

        pt_client.initialize(&admin, &tokenizer_contract_id);
        yt_client.initialize(
            &admin,
            &tokenizer_contract_id,
            &maturity_ledger,
            &sy_contract_id,
            &maturity_engine_id,
            &maturity_epoch_id,
        );

        tokenizer_client.initialize(
            &admin,
            &vault_contract_id,
            &pt_contract_id,
            &yt_contract_id,
            &sy_contract_id,
            &maturity_ledger,
            &maturity_engine_id,
            &maturity_epoch_id,
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
        assert_eq!(
            tokenizer_client.get_epoch_state(),
            EpochState::Matured as u32
        );

        // 4. Minting Forbidden in Matured
        let res = tokenizer_client.try_mint_pt_yt(&user, &100);
        assert!(res.is_err());

        // 5. Redemption Forbidden in Matured (Not Settled yet)
        let res = tokenizer_client.try_redeem_pt(&user, &100);
        assert!(res.is_err());

        // 6. Settle Epoch Allowed in Matured
        tokenizer_client.settle_epoch();

        // STATE: SETTLED
        assert_eq!(
            tokenizer_client.get_epoch_state(),
            EpochState::Settled as u32
        );

        // 7. Settle Epoch Forbidden if already Settled
        let res = tokenizer_client.try_settle_epoch();
        assert!(res.is_err());

        // 8. Redemption Allowed in Settled
        tokenizer_client.redeem_pt(&user, &1000);
        assert_eq!(pt_client.balance(&user), 0);
    }
}
