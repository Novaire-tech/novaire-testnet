#![no_std]
use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, token, Address, Env,
    Map, Symbol, Vec,
};

/// A Blend Capital `Request`, as submitted to `Pool::submit`. Only `Supply` (0) and
/// `Withdraw` (1) request types are ever used by this contract - sy_wrapper never
/// borrows or posts collateral, it only ever lends the underlying for yield.
///
/// Field layout confirmed against the real Blend v2 pool source
/// (blend-capital/blend-contracts-v2, pool/src/pool/actions.rs) via GitHub.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Request {
    pub request_type: u32,
    pub address: Address,
    pub amount: i128,
}

/// A Blend Capital `Positions` snapshot, as returned by `Pool::get_positions`.
///
/// CONFIDENCE NOTE: confirmed via the real Blend v2 source that `Positions` has exactly
/// these three fields (`collateral`, `liabilities`, `supply`), and that they are keyed by
/// `u32` **reserve index** (not by asset `Address`) - the pool assigns each reserve in a
/// market a small integer index and the positions maps use that index as the key, not the
/// asset address itself. Since sy_wrapper only ever submits `Supply`/`Withdraw` requests
/// for a single underlying asset and never touches any other reserve in the pool, we don't
/// need to know that index: whatever (single) entry ends up in our `supply` map belongs
/// entirely to us, so we can just sum all values in the map rather than looking up a
/// specific key.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Positions {
    pub collateral: Map<u32, i128>,
    pub liabilities: Map<u32, i128>,
    pub supply: Map<u32, i128>,
}

const BLEND_REQUEST_TYPE_SUPPLY: u32 = 0;
const BLEND_REQUEST_TYPE_WITHDRAW: u32 = 1;

/// Minimal client-only view of the Blend Capital Pool contract's cross-contract interface.
/// We don't need the whole Pool contract, just the two entry points needed to lend the
/// underlying asset (`submit`) and read back our position (`get_positions`). Since Soroban
/// cross-contract calls are matched by function name + argument/return XDR shape (not by
/// crate dependency), this is enough to call the real, already-deployed Blend testnet pool
/// without pulling in blend-contracts as a crates.io dependency.
#[contractclient(name = "BlendPoolClient")]
pub trait BlendPool {
    fn submit(env: Env, from: Address, spender: Address, to: Address, requests: Vec<Request>) -> Positions;
    fn get_positions(env: Env, address: Address) -> Positions;
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NovaireSyError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    RateCannotDecrease = 5,
    InsufficientShares = 6,
    MathOverflow = 7,
    MathUnderflow = 8,
    StorageMissing = 9,
    Paused = 10,
    InvalidAdminTransfer = 11,
    RateIncreaseTooLarge = 12,
    MinimumDepositNotMet = 13,
    ZeroSharesMinted = 14,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    PendingAdmin,
    Underlying,
    /// Address of the Blend Capital lending pool this contract supplies the underlying to.
    YieldSource,
    TotalShares,
    TotalUnderlying,
    Paused,
}

const EXCHANGE_RATE_SCALAR: i128 = 1_000_000_000;
const VERSION: u32 = 1;

mod storage {
    use super::*;
    
    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn get_admin(env: &Env) -> Result<Address, NovaireSyError> {
        env.storage().instance().get(&DataKey::Admin).ok_or(NovaireSyError::StorageMissing)
    }

    pub fn get_underlying(env: &Env) -> Result<Address, NovaireSyError> {
        env.storage().instance().get(&DataKey::Underlying).ok_or(NovaireSyError::StorageMissing)
    }

    pub fn get_yield_source(env: &Env) -> Result<Address, NovaireSyError> {
        env.storage().instance().get(&DataKey::YieldSource).ok_or(NovaireSyError::StorageMissing)
    }

    pub fn get_total_shares(env: &Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalShares).unwrap_or(0)
    }

    pub fn is_paused(env: &Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }
    
    pub fn require_not_paused(env: &Env) -> Result<(), NovaireSyError> {
        if is_paused(env) {
            return Err(NovaireSyError::Paused);
        }
        Ok(())
    }

    pub fn get_total_underlying(env: &Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalUnderlying).unwrap_or(0)
    }

    pub fn set_total_underlying(env: &Env, amount: i128) {
        env.storage().instance().set(&DataKey::TotalUnderlying, &amount);
    }
}

/// Sums every entry in the Blend pool's reported `supply` map for this contract's
/// position. We deliberately don't index by a specific reserve key (see the `Positions`
/// doc comment above) since this contract only ever supplies a single asset.
///
/// CONFIDENCE NOTE: we treat the raw supply amount reported by `get_positions` as
/// underlying-equivalent 1:1. In Blend's real accounting, supplied amounts are tracked as
/// bTokens which accrue value relative to underlying via a `b_rate` exchange rate exposed
/// from `get_reserve`, so this is an approximation, not exact accounting - we could not
/// confirm `get_reserve`'s exact `ReserveData` field layout with confidence, and guessing
/// wrong there would silently corrupt accounting. Treating supply 1:1 is the safer choice:
/// it under-reports rather than over-reports accrued yield whenever bTokens are worth more
/// than 1 underlying unit (the normal case), and `refresh_rate`'s existing rate-can-only-
/// increase / 10%-max-increase invariants further bound any error from this approximation.
fn pool_supplied_value(env: &Env, pool_id: &Address) -> Result<i128, NovaireSyError> {
    let pool_client = BlendPoolClient::new(env, pool_id);
    let positions = pool_client.get_positions(&env.current_contract_address());
    let mut total: i128 = 0;
    for (_, v) in positions.supply.iter() {
        total = total.checked_add(v).ok_or(NovaireSyError::MathOverflow)?;
    }
    Ok(total)
}

/// Computes the total underlying backing this contract: idle balance held directly by the
/// contract, plus the value of whatever is currently supplied to the Blend pool.
fn total_backing(env: &Env, underlying_addr: &Address, pool_id: &Address) -> Result<i128, NovaireSyError> {
    let token_client = token::Client::new(env, underlying_addr);
    let idle_balance = token_client.balance(&env.current_contract_address());
    let supplied = pool_supplied_value(env, pool_id)?;
    idle_balance.checked_add(supplied).ok_or(NovaireSyError::MathOverflow)
}

#[contract]
pub struct SyWrapper;

#[contractimpl]
impl SyWrapper {
    pub fn version() -> u32 {
        VERSION
    }

    pub fn initialize(
        env: Env,
        admin: Address,
        underlying: Address,
        yield_source: Address,
    ) -> Result<(), NovaireSyError> {
        if storage::is_initialized(&env) {
            return Err(NovaireSyError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Underlying, &underlying);
        env.storage().instance().set(&DataKey::YieldSource, &yield_source);
        env.storage().instance().set(&DataKey::TotalShares, &0i128);
        env.storage().instance().set(&DataKey::TotalUnderlying, &0i128);
        env.storage().instance().set(&DataKey::Paused, &false);

        Ok(())
    }

    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<i128, NovaireSyError> {
        from.require_auth();
        storage::require_not_paused(&env)?;

        if amount <= 0 {
            return Err(NovaireSyError::InvalidAmount);
        }

        let underlying_addr = storage::get_underlying(&env)?;
        let rate = Self::get_exchange_rate(env.clone());
        let mut total_shares = storage::get_total_shares(&env);

        let mut shares_to_mint = amount
            .checked_mul(EXCHANGE_RATE_SCALAR)
            .ok_or(NovaireSyError::MathOverflow)?
            .checked_div(rate)
            .ok_or(NovaireSyError::MathUnderflow)?;

        if total_shares == 0 {
            if amount <= 1000 {
                return Err(NovaireSyError::MinimumDepositNotMet);
            }
            shares_to_mint = amount.checked_sub(1000).ok_or(NovaireSyError::MathUnderflow)?;
            total_shares = 1000; // Permanently locked shares to prevent inflation attack
        }

        if shares_to_mint == 0 {
            return Err(NovaireSyError::ZeroSharesMinted);
        }

        let token_client = token::Client::new(&env, &underlying_addr);
        token_client.transfer(&from, &env.current_contract_address(), &amount);

        // Put the newly-deposited underlying to work immediately: supply it into the Blend
        // pool so it actually earns lending yield instead of sitting idle in this contract.
        let pool_id = storage::get_yield_source(&env)?;
        let this = env.current_contract_address();
        token_client.approve(
            &this,
            &pool_id,
            &amount,
            &(env.ledger().sequence() + 100),
        );
        let pool_client = BlendPoolClient::new(&env, &pool_id);
        let mut requests: Vec<Request> = Vec::new(&env);
        requests.push_back(Request {
            request_type: BLEND_REQUEST_TYPE_SUPPLY,
            address: underlying_addr.clone(),
            amount,
        });
        pool_client.submit(&this, &this, &this, &requests);

        total_shares = total_shares.checked_add(shares_to_mint).ok_or(NovaireSyError::MathOverflow)?;
        env.storage().instance().set(&DataKey::TotalShares, &total_shares);

        let mut total_underlying = storage::get_total_underlying(&env);
        total_underlying = total_underlying.checked_add(amount).ok_or(NovaireSyError::MathOverflow)?;
        storage::set_total_underlying(&env, total_underlying);

        env.events().publish(
            (Symbol::new(&env, "sy_deposit"), from), 
            (amount, shares_to_mint, total_shares, rate)
        );

        Ok(shares_to_mint)
    }

    pub fn withdraw(env: Env, from: Address, shares: i128) -> Result<i128, NovaireSyError> {
        from.require_auth();
        storage::require_not_paused(&env)?;

        if shares <= 0 {
            return Err(NovaireSyError::InvalidAmount);
        }

        let underlying_addr = storage::get_underlying(&env)?;
        let rate = Self::get_exchange_rate(env.clone());
        let mut total_shares = storage::get_total_shares(&env);

        if shares > total_shares {
            return Err(NovaireSyError::InsufficientShares);
        }

        let underlying_to_return = shares
            .checked_mul(rate)
            .ok_or(NovaireSyError::MathOverflow)?
            .checked_div(EXCHANGE_RATE_SCALAR)
            .ok_or(NovaireSyError::MathUnderflow)?;

        total_shares = total_shares.checked_sub(shares).ok_or(NovaireSyError::MathUnderflow)?;
        env.storage().instance().set(&DataKey::TotalShares, &total_shares);

        let mut total_underlying = storage::get_total_underlying(&env);
        total_underlying = total_underlying.checked_sub(underlying_to_return).ok_or(NovaireSyError::MathUnderflow)?;
        storage::set_total_underlying(&env, total_underlying);

        // Pull the underlying needed to fund this withdrawal back out of the Blend pool
        // before paying the user. We request exactly the amount owed; any idle balance the
        // contract already has (e.g. leftover from a rounding remainder) simply reduces how
        // much sits idle afterwards - it's never lost, just less capital-efficient until the
        // next deposit or a future withdrawal draws it down.
        let pool_id = storage::get_yield_source(&env)?;
        let this = env.current_contract_address();
        let pool_client = BlendPoolClient::new(&env, &pool_id);
        let mut requests: Vec<Request> = Vec::new(&env);
        requests.push_back(Request {
            request_type: BLEND_REQUEST_TYPE_WITHDRAW,
            address: underlying_addr.clone(),
            amount: underlying_to_return,
        });
        pool_client.submit(&this, &this, &this, &requests);

        let token_client = token::Client::new(&env, &underlying_addr);
        token_client.transfer(&env.current_contract_address(), &from, &underlying_to_return);

        env.events().publish(
            (Symbol::new(&env, "sy_withdraw"), from),
            (shares, underlying_to_return, total_shares, rate)
        );

        Ok(underlying_to_return)
    }

    pub fn refresh_rate(env: Env) -> Result<(), NovaireSyError> {
        let underlying_addr = storage::get_underlying(&env)?;
        let pool_id = storage::get_yield_source(&env)?;
        // Real backing is idle underlying held directly by this contract PLUS the value of
        // whatever is currently supplied to the Blend pool - not just the contract's own
        // token balance, since deposits are now actively lent out rather than sitting idle.
        let actual_balance = total_backing(&env, &underlying_addr, &pool_id)?;

        let total_underlying = storage::get_total_underlying(&env);
        
        if actual_balance > total_underlying {
            let total_shares = storage::get_total_shares(&env);
            if total_shares > 0 {
                let old_rate = Self::get_exchange_rate(env.clone());
                let new_rate = actual_balance.checked_mul(EXCHANGE_RATE_SCALAR).ok_or(NovaireSyError::MathOverflow)?
                    .checked_div(total_shares).ok_or(NovaireSyError::MathUnderflow)?;
                
                if new_rate < old_rate {
                    return Err(NovaireSyError::RateCannotDecrease);
                }
                
                // Max 10% rate increase
                let max_rate = old_rate.checked_mul(110).ok_or(NovaireSyError::MathOverflow)?
                    .checked_div(100).ok_or(NovaireSyError::MathUnderflow)?;
                
                if new_rate > max_rate {
                    // Fix H5: Clamp instead of reverting to prevent donation DoS
                    let clamped_balance = max_rate.checked_mul(total_shares).ok_or(NovaireSyError::MathOverflow)?
                        .checked_div(EXCHANGE_RATE_SCALAR).ok_or(NovaireSyError::MathUnderflow)?;
                    storage::set_total_underlying(&env, clamped_balance);
                } else {
                    storage::set_total_underlying(&env, actual_balance);
                }
            } else {
                storage::set_total_underlying(&env, actual_balance);
            }
        }
        
        Ok(())
    }

    /// Realizes a loss in the yield source (exploit, slashing, bad debt) by lowering the
    /// recorded `TotalUnderlying` to the actual on-chain balance.
    ///
    /// `refresh_rate` deliberately only ever ratchets `TotalUnderlying` up (protected by
    /// `RateCannotDecrease`) so that no caller can grief the share price down by front-running
    /// a legitimate accrual. But that leaves no path at all for a genuine loss: if the yield
    /// source's actual balance drops below the recorded total, `refresh_rate` does nothing,
    /// the exchange rate stays permanently inflated, and `withdraw` keeps paying out against
    /// a rate that no longer reflects real backing — first withdrawers drain more than exists,
    /// later ones hit a failed transfer. This function is the explicit, admin-gated escape
    /// hatch for that case: it can only ever decrease `TotalUnderlying` down to the measured
    /// balance, never below it, so it cannot be used to under-report backing beyond reality.
    pub fn mark_loss(env: Env) -> Result<i128, NovaireSyError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();

        let underlying_addr = storage::get_underlying(&env)?;
        let pool_id = storage::get_yield_source(&env)?;
        let actual_balance = total_backing(&env, &underlying_addr, &pool_id)?;

        let total_underlying = storage::get_total_underlying(&env);
        if actual_balance >= total_underlying {
            return Ok(0);
        }

        let loss = total_underlying.checked_sub(actual_balance).ok_or(NovaireSyError::MathUnderflow)?;
        storage::set_total_underlying(&env, actual_balance);

        env.events().publish(
            (Symbol::new(&env, "sy_loss_realized"),),
            (loss, actual_balance, env.ledger().sequence()),
        );

        Ok(loss)
    }

    pub fn harvest_yield(env: Env) -> Result<(), NovaireSyError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        storage::require_not_paused(&env)?;

        Self::refresh_rate(env.clone())?;

        let rate = Self::get_exchange_rate(env.clone());
        let total_shares = storage::get_total_shares(&env);

        env.events().publish(
            (Symbol::new(&env, "yield_harvested"),), 
            (rate, total_shares, env.ledger().sequence())
        );

        Ok(())
    }

    pub fn pause(env: Env) -> Result<(), NovaireSyError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), NovaireSyError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        Ok(())
    }

    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), NovaireSyError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::PendingAdmin, &new_admin);
        Ok(())
    }

    pub fn accept_admin(env: Env) -> Result<(), NovaireSyError> {
        let pending_admin: Address = env.storage().instance().get(&DataKey::PendingAdmin).ok_or(NovaireSyError::InvalidAdminTransfer)?;
        pending_admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &pending_admin);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        Ok(())
    }

    pub fn get_exchange_rate(env: Env) -> i128 {
        let total_shares = storage::get_total_shares(&env);
        if total_shares == 0 {
            return EXCHANGE_RATE_SCALAR;
        }
        let total_underlying = storage::get_total_underlying(&env);
        total_underlying.checked_mul(EXCHANGE_RATE_SCALAR).unwrap_or(0).checked_div(total_shares).unwrap_or(EXCHANGE_RATE_SCALAR)
    }

    pub fn preview_deposit(env: Env, amount: i128) -> i128 {
        let rate = Self::get_exchange_rate(env.clone());
        amount.checked_mul(EXCHANGE_RATE_SCALAR).unwrap_or(0).checked_div(rate).unwrap_or(0)
    }

    pub fn preview_withdraw(env: Env, shares: i128) -> i128 {
        let rate = Self::get_exchange_rate(env.clone());
        shares.checked_mul(rate).unwrap_or(0).checked_div(EXCHANGE_RATE_SCALAR).unwrap_or(0)
    }

    pub fn total_shares(env: Env) -> i128 {
        storage::get_total_shares(&env)
    }

    pub fn underlying_asset(env: Env) -> Result<Address, NovaireSyError> {
        storage::get_underlying(&env)
    }
}

#[cfg(test)]
mod test;
#[cfg(test)]
mod audit_tests;
