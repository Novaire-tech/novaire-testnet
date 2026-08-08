#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, IntoVal};

#[soroban_sdk::contractclient(name = "PtTokenClient")]
pub trait PtTokenInterface {
    fn balance(env: Env, id: Address) -> i128;
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
}

#[soroban_sdk::contractclient(name = "TokenizerClient")]
pub trait TokenizerInterface {
    fn redeem_pt(env: Env, to: Address, amount: i128) -> i128;
}

#[soroban_sdk::contractclient(name = "UnderlyingTokenClient")]
pub trait UnderlyingTokenInterface {
    fn balance(env: Env, id: Address) -> i128;
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CumulativeIntentRecord {
    pub total_deposited_amount: i128,
    pub total_pt_held: i128,
    pub total_yt_sold: i128,
    pub total_underlying_received: i128,
}

#[soroban_sdk::contractclient(name = "IntentEngineClient")]
pub trait IntentEngineInterface {
    fn execute_fixed_yield_intent(
        env: Env,
        user: Address,
        usdc_amount: i128,
        min_implied_rate: i128,
        min_underlying_out: i128,
        yt_sale_percentage: u32,
    ) -> CumulativeIntentRecord;

    fn get_user_intent(env: Env, user: Address) -> CumulativeIntentRecord;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EpochRecord {
    pub epoch_id: u32,
    pub maturity_ledger: u32,
    pub created_ledger: u32,
    pub pt_token: Address,
}

#[soroban_sdk::contractclient(name = "FactoryClient")]
pub trait FactoryInterface {
    fn latest_epoch(env: Env) -> EpochRecord;
    fn get_epoch_by_maturity(env: Env, maturity_ledger: u32) -> EpochRecord;
    fn get_next_epoch(env: Env, current_epoch_id: u32) -> EpochRecord;
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NovaireRolloverError {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    PositionNotFound = 3,
    EpochNotExpired = 4,
    NextEpochNotSet = 5,
    PositionNotActive = 6,
    RateTooLow = 7,
    ZeroAmount = 8,
    StorageMissing = 9,
    MathOverflow = 10,
    MathUnderflow = 11,
    Paused = 12,
    InvariantViolation = 13,
    InvalidKeeper = 14,
    InvalidEpoch = 15,
    PositionAlreadyActive = 16,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Tokenizer,
    Vault,
    Marketplace,
    IntentEngine,
    Keeper,
    RolloverPositions(Address),
    PtToken,
    UnderlyingToken,
    Paused,
    GracePeriodLedgers,
    TotalPtHeld,
    Factory,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RolloverPosition {
    pub active: bool,
    pub pt_balance: i128,
    pub initial_principal: i128,
    pub current_epoch_maturity: u32,
    pub min_rate_bps: i128,
    pub created_ledger: u32,
    pub last_rolled_ledger: u32,
    pub protocol_yield_earned: i128,
    pub realized_pnl: i128,
    pub min_underlying_out: i128,
}

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

    pub fn get_address(env: &Env, key: DataKey) -> Result<Address, NovaireRolloverError> {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        env.storage()
            .instance()
            .get(&key)
            .ok_or(NovaireRolloverError::StorageMissing)
    }

    pub fn is_paused(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    pub fn set_paused(env: &Env, state: bool) {
        env.storage().instance().set(&DataKey::Paused, &state);
    }

    pub fn get_grace_period(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::GracePeriodLedgers)
            .unwrap_or(17280) // default 1 day
    }

    pub fn get_total_pt_held(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalPtHeld)
            .unwrap_or(0)
    }

    pub fn set_total_pt_held(env: &Env, amount: i128) {
        env.storage().instance().set(&DataKey::TotalPtHeld, &amount);
    }

    pub fn get_position(
        env: &Env,
        user: &Address,
    ) -> Result<RolloverPosition, NovaireRolloverError> {
        let key = DataKey::RolloverPositions(user.clone());
        let pos = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(NovaireRolloverError::PositionNotFound)?;
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
        Ok(pos)
    }

    pub fn set_position(env: &Env, user: &Address, pos: &RolloverPosition) {
        let key = DataKey::RolloverPositions(user.clone());
        env.storage().persistent().set(&key, pos);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
    }

    pub fn remove_position(env: &Env, user: &Address) {
        env.storage()
            .persistent()
            .remove(&DataKey::RolloverPositions(user.clone()));
    }
}

#[contract]
pub struct AutonomousRollover;

#[contractimpl]
impl AutonomousRollover {
    pub fn initialize(
        env: Env,
        admin: Address,
        tokenizer: Address,
        vault: Address,
        marketplace: Address,
        intent_engine: Address,
        keeper: Address,
        pt_token: Address,
        underlying_token: Address,
        factory: Address,
        grace_period_ledgers: u32,
    ) -> Result<(), NovaireRolloverError> {
        admin.require_auth();
        if storage::is_initialized(&env) {
            return Err(NovaireRolloverError::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Tokenizer, &tokenizer);
        env.storage().instance().set(&DataKey::Vault, &vault);
        env.storage()
            .instance()
            .set(&DataKey::Marketplace, &marketplace);
        env.storage()
            .instance()
            .set(&DataKey::IntentEngine, &intent_engine);
        env.storage().instance().set(&DataKey::Keeper, &keeper);
        env.storage().instance().set(&DataKey::PtToken, &pt_token);
        env.storage()
            .instance()
            .set(&DataKey::UnderlyingToken, &underlying_token);
        env.storage().instance().set(&DataKey::Factory, &factory);
        env.storage()
            .instance()
            .set(&DataKey::GracePeriodLedgers, &grace_period_ledgers);

        storage::set_paused(&env, false);
        storage::set_total_pt_held(&env, 0);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    pub fn pause(env: Env) -> Result<(), NovaireRolloverError> {
        let admin = storage::get_address(&env, DataKey::Admin)?;
        admin.require_auth();
        storage::set_paused(&env, true);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), NovaireRolloverError> {
        let admin = storage::get_address(&env, DataKey::Admin)?;
        admin.require_auth();
        storage::set_paused(&env, false);
        Ok(())
    }

    pub fn register_rollover(
        env: Env,
        user: Address,
        pt_amount: i128,
        current_epoch_maturity: u32,
        min_rate_bps: i128,
        min_underlying_out: i128,
    ) -> Result<(), NovaireRolloverError> {
        user.require_auth();

        if storage::is_paused(&env) {
            return Err(NovaireRolloverError::Paused);
        }

        if pt_amount <= 0 {
            return Err(NovaireRolloverError::ZeroAmount);
        }

        if let Ok(existing) = storage::get_position(&env, &user) {
            if existing.active {
                return Err(NovaireRolloverError::PositionAlreadyActive);
            }
        }

        let pt_token_addr = storage::get_address(&env, DataKey::PtToken)?;
        let pt_client = PtTokenClient::new(&env, &pt_token_addr);

        let user_bal = pt_client.balance(&user);
        if user_bal < pt_amount {
            return Err(NovaireRolloverError::ZeroAmount);
        }

        let contract_addr = env.current_contract_address();
        pt_client.transfer(&user, &contract_addr, &pt_amount);

        let position = RolloverPosition {
            active: true,
            pt_balance: pt_amount,
            initial_principal: pt_amount,
            current_epoch_maturity,
            min_rate_bps,
            created_ledger: env.ledger().sequence(),
            last_rolled_ledger: env.ledger().sequence(),
            protocol_yield_earned: 0,
            realized_pnl: 0,
            min_underlying_out,
        };

        storage::set_position(&env, &user, &position);

        let current_total = storage::get_total_pt_held(&env);
        storage::set_total_pt_held(
            &env,
            current_total
                .checked_add(pt_amount)
                .ok_or(NovaireRolloverError::MathOverflow)?,
        );

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "rollover_started"), user),
            (pt_amount, current_epoch_maturity),
        );

        Self::assert_invariant(&env)?;
        Ok(())
    }

    pub fn execute_rollover(env: Env, user: Address) -> Result<(), NovaireRolloverError> {
        if storage::is_paused(&env) {
            return Err(NovaireRolloverError::Paused);
        }

        let mut position = storage::get_position(&env, &user)?;
        if !position.active {
            return Err(NovaireRolloverError::PositionNotActive);
        }

        let current_ledger = env.ledger().sequence();
        if current_ledger < position.current_epoch_maturity {
            return Err(NovaireRolloverError::EpochNotExpired);
        }

        // Keeper Fallback Grace Period
        let grace_period = storage::get_grace_period(&env);
        let grace_expiration = position
            .current_epoch_maturity
            .checked_add(grace_period)
            .ok_or(NovaireRolloverError::MathOverflow)?;

        if current_ledger <= grace_expiration {
            let keeper = storage::get_address(&env, DataKey::Keeper)?;
            keeper.require_auth();
        } else {
            // Grace period expired, permissionless execution allowed to ensure liveness
        }

        let tokenizer_addr = storage::get_address(&env, DataKey::Tokenizer)?;
        let tokenizer_client = TokenizerClient::new(&env, &tokenizer_addr);
        let contract_addr = env.current_contract_address();

        // 1. Redeem PT
        let underlying_redeemed = tokenizer_client.redeem_pt(&contract_addr, &position.pt_balance);

        // 2. Discover next epoch explicitly via Linked Epochs Routing
        let factory_addr = storage::get_address(&env, DataKey::Factory)?;
        let factory_client = FactoryClient::new(&env, &factory_addr);

        let current_epoch = factory_client.get_epoch_by_maturity(&position.current_epoch_maturity);
        let next_epoch = factory_client.get_next_epoch(&current_epoch.epoch_id);

        if next_epoch.maturity_ledger <= current_ledger {
            return Err(NovaireRolloverError::NextEpochNotSet);
        }

        // 3. Intent Engine Fixed Yield Intent
        let intent_engine_addr = storage::get_address(&env, DataKey::IntentEngine)?;
        let intent_engine_client = IntentEngineClient::new(&env, &intent_engine_addr);

        let min_implied_rate = position
            .min_rate_bps
            .checked_mul(100_000)
            .ok_or(NovaireRolloverError::MathOverflow)?;

        let underlying_addr = storage::get_address(&env, DataKey::UnderlyingToken)?;
        let underlying_client = UnderlyingTokenClient::new(&env, &underlying_addr);
        let balance_before = underlying_client.balance(&contract_addr);

        // Rollover is a contract, not an EOA — it cannot sign an auth entry for the
        // `underlying.transfer(rollover -> intent_engine)` call that intent_engine performs
        // two hops away on its behalf. Implicit invoker authorization only covers the direct
        // (one-hop) call rollover makes into intent_engine; it does not propagate to the
        // token transfer intent_engine subsequently issues. Without this explicit grant that
        // transfer's `user.require_auth()` (user == this contract) fails on a real network.
        env.authorize_as_current_contract(soroban_sdk::vec![
            &env,
            soroban_sdk::auth::InvokerContractAuthEntry::Contract(
                soroban_sdk::auth::SubContractInvocation {
                    context: soroban_sdk::auth::ContractContext {
                        contract: underlying_addr.clone(),
                        fn_name: soroban_sdk::Symbol::new(&env, "transfer"),
                        args: soroban_sdk::vec![
                            &env,
                            contract_addr.clone().into_val(&env),
                            intent_engine_addr.clone().into_val(&env),
                            underlying_redeemed.into_val(&env),
                        ],
                    },
                    sub_invocations: soroban_sdk::vec![&env],
                },
            ),
        ]);

        // `CumulativeIntentRecord::total_pt_held` is a running total keyed by the
        // caller address across every intent ever executed by it on this intent
        // engine, not the delta from this single call. Since rollover calls in as
        // itself (not the end user), that total aggregates PT across every
        // position ever rolled through this intent engine — using it directly
        // would attribute other positions' PT to this one whenever more than one
        // position rolls through the same epoch's intent engine. Snapshot the
        // cumulative total before the call and diff against it afterward instead,
        // which stays correct across epochs even though the PT token itself
        // rotates each epoch (unlike a balance-based diff, which would need to
        // track the current epoch's PT token address).
        let pt_held_before = intent_engine_client
            .try_get_user_intent(&contract_addr)
            .ok()
            .and_then(|r| r.ok())
            .map(|record| record.total_pt_held)
            .unwrap_or(0);

        let intent_record = intent_engine_client.execute_fixed_yield_intent(
            &contract_addr,
            &underlying_redeemed,
            &min_implied_rate,
            &position.min_underlying_out,
            &100,
        );

        let balance_after = underlying_client.balance(&contract_addr);
        // `balance_before` is 0 by the contract's own zero-custody invariant, so
        // `balance_before - underlying_redeemed` is always <= 0 in the normal
        // case; flooring at 0 here reflects that, it is not an anomaly.
        let expected_balance = core::cmp::max(0, balance_before - underlying_redeemed);
        let yt_proceeds = balance_after
            .checked_sub(expected_balance)
            .ok_or(NovaireRolloverError::MathOverflow)?;

        if yt_proceeds > 0 {
            underlying_client.transfer(&contract_addr, &user, &yt_proceeds);
        }

        // 4. Update Independent Yield Metrics
        position.protocol_yield_earned = position
            .protocol_yield_earned
            .checked_add(yt_proceeds)
            .ok_or(NovaireRolloverError::MathOverflow)?;
        let pt_growth = underlying_redeemed
            .checked_sub(position.initial_principal)
            .ok_or(NovaireRolloverError::MathOverflow)?;
        position.realized_pnl = pt_growth
            .checked_add(position.protocol_yield_earned)
            .ok_or(NovaireRolloverError::MathOverflow)?;

        // 5. Update position
        let old_pt = position.pt_balance;
        let new_pt = intent_record
            .total_pt_held
            .checked_sub(pt_held_before)
            .ok_or(NovaireRolloverError::MathOverflow)?;
        position.pt_balance = new_pt;
        position.current_epoch_maturity = next_epoch.maturity_ledger;
        position.last_rolled_ledger = current_ledger;

        storage::set_position(&env, &user, &position);

        // Each epoch mints a fresh PT token contract; track the currently held
        // one so custody can be verified against the right token going forward.
        env.storage()
            .instance()
            .set(&DataKey::PtToken, &next_epoch.pt_token);

        let current_total = storage::get_total_pt_held(&env);
        let new_total = current_total
            .checked_sub(old_pt)
            .ok_or(NovaireRolloverError::MathUnderflow)?
            .checked_add(new_pt)
            .ok_or(NovaireRolloverError::MathOverflow)?;
        storage::set_total_pt_held(&env, new_total);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "rollover_completed"), user),
            (
                position.current_epoch_maturity,
                position.initial_principal,
                position.protocol_yield_earned,
                position.realized_pnl,
                new_pt,
                underlying_redeemed,
            ),
        );

        Self::assert_invariant(&env)?;
        Ok(())
    }

    pub fn exit_rollover(env: Env, user: Address) -> Result<(), NovaireRolloverError> {
        user.require_auth();
        // Allowed even if paused to prevent trapped funds

        let position = storage::get_position(&env, &user)?;
        if !position.active {
            return Err(NovaireRolloverError::PositionNotActive);
        }

        let pt_token_addr = storage::get_address(&env, DataKey::PtToken)?;
        let pt_client = PtTokenClient::new(&env, &pt_token_addr);

        let contract_addr = env.current_contract_address();
        pt_client.transfer(&contract_addr, &user, &position.pt_balance);

        storage::remove_position(&env, &user);

        let current_total = storage::get_total_pt_held(&env);
        storage::set_total_pt_held(
            &env,
            current_total
                .checked_sub(position.pt_balance)
                .ok_or(NovaireRolloverError::MathUnderflow)?,
        );

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "rollover_cancelled"), user),
            (position.pt_balance,),
        );

        Self::assert_invariant(&env)?;
        Ok(())
    }

    pub fn get_position(env: Env, user: Address) -> Result<RolloverPosition, NovaireRolloverError> {
        storage::get_position(&env, &user)
    }

    pub fn total_pt_held(env: Env) -> i128 {
        storage::get_total_pt_held(&env)
    }

    pub fn update_keeper(env: Env, new_keeper: Address) -> Result<(), NovaireRolloverError> {
        let admin = storage::get_address(&env, DataKey::Admin)?;
        admin.require_auth();

        env.storage().instance().set(&DataKey::Keeper, &new_keeper);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "keeper_updated"), new_keeper),
            (),
        );
        Ok(())
    }

    fn assert_invariant(env: &Env) -> Result<(), NovaireRolloverError> {
        let contract_addr = env.current_contract_address();

        // Treasury consistency: rollover never warehouses underlying between ops.
        if let Ok(underlying_addr) = storage::get_address(env, DataKey::UnderlyingToken) {
            let underlying_client = UnderlyingTokenClient::new(env, &underlying_addr);
            if underlying_client.balance(&contract_addr) > 0 {
                return Err(NovaireRolloverError::InvariantViolation);
            }
        }

        // PT custody conservation: actual on-chain PT balance must equal the
        // internally tracked total_pt_held accounting figure, independently of
        // per-position bookkeeping.
        if let Ok(pt_addr) = storage::get_address(env, DataKey::PtToken) {
            let pt_client = PtTokenClient::new(env, &pt_addr);
            let actual_pt = pt_client.balance(&contract_addr);
            let tracked_pt = storage::get_total_pt_held(env);
            if actual_pt != tracked_pt {
                return Err(NovaireRolloverError::InvariantViolation);
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod test;
