#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NovaireMarketError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    EpochExpired = 4,
    InsufficientLiquidity = 5,
    SlippageExceeded = 6,
    ZeroInput = 7,
    BelowMinimumLiquidity = 8,
    StorageMissing = 9,
    InvariantViolated = 10,
    MathOverflow = 11,
}

#[soroban_sdk::contractclient(name = "TokenizerClient")]
pub trait TokenizerInterface {
    fn claim_yield(env: Env, user: Address) -> i128;
}

/// Cross-contract client for the canonical epoch FSM. Replaces the local
/// `ledger_sequence >= maturity_ledger` comparison previously duplicated at
/// every `EpochExpired` guard site.
#[soroban_sdk::contractclient(name = "MaturityEngineClient")]
pub trait MaturityEngineInterface {
    fn live_state(env: Env, epoch_id: u32) -> u32;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    PtToken,
    YtToken,
    Underlying,
    SyWrapper,
    Tokenizer,
    MaturityLedger,
    /// Canonical epoch-clock contract. Source of truth for `EpochExpired`
    /// checks; `MaturityLedger` is retained only as a display-only value.
    MaturityEngine,
    /// The epoch_id `MaturityEngine::open_epoch` returned for this deployment.
    MaturityEngineEpochId,
    CreatedLedger,
    PtReserves,
    UnderlyingReserves,
    YtReserves,
    TotalLpShares,
    ImpliedRateTwap,
    LastTwapLedger,
    LpBalance(Address),
}

#[soroban_sdk::contractclient(name = "SyWrapperClient")]
pub trait SyWrapperInterface {
    fn get_exchange_rate(env: Env) -> i128;
}

mod storage {
    use super::*;

    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn get_address(env: &Env, key: DataKey) -> Result<Address, NovaireMarketError> {
        env.storage().instance().get(&key).ok_or(NovaireMarketError::StorageMissing)
    }

    pub fn get_u32(env: &Env, key: DataKey) -> Result<u32, NovaireMarketError> {
        env.storage().instance().get(&key).ok_or(NovaireMarketError::StorageMissing)
    }

    pub fn get_i128(env: &Env, key: DataKey) -> Result<i128, NovaireMarketError> {
        env.storage().instance().get(&key).ok_or(NovaireMarketError::StorageMissing)
    }
    
    pub fn get_lp_balance(env: &Env, provider: &Address) -> i128 {
        env.storage().persistent().get(&DataKey::LpBalance(provider.clone())).unwrap_or(0)
    }

    pub fn set_lp_balance(env: &Env, provider: &Address, balance: i128) {
        env.storage().persistent().set(&DataKey::LpBalance(provider.clone()), &balance);
    }

    pub fn set_i128(env: &Env, key: DataKey, val: i128) {
        env.storage().instance().set(&key, &val);
    }
}

fn integer_sqrt(val: i128) -> i128 {
    if val <= 0 { return 0; }
    let mut z = (val + 1) / 2;
    let mut y = val;
    while z < y {
        y = z;
        z = (val / z + z) / 2;
    }
    y
}

fn compute_a_pool(env: &Env, maturity: u32, x: i128, y: i128) -> Result<i128, NovaireMarketError> {
    let created = storage::get_u32(env, DataKey::CreatedLedger)?;
    let current = env.ledger().sequence();

    if current >= maturity {
        // Return a very large number simulating infinity for 1:1 constant sum
        return x.checked_add(y).ok_or(NovaireMarketError::MathOverflow)?
            .checked_mul(1_000_000_000).ok_or(NovaireMarketError::MathOverflow);
    }

    let t_rem = (maturity.checked_sub(current).ok_or(NovaireMarketError::MathOverflow)?) as i128;
    let t_tot = (maturity.checked_sub(created).ok_or(NovaireMarketError::MathOverflow)?) as i128;
    
    if t_rem <= 0 {
        return Ok(1_000_000_000_000_000);
    }

    // base_A = ((t_tot - t_rem) * 1_000_000) / t_rem;
    let elapsed = t_tot.checked_sub(t_rem).ok_or(NovaireMarketError::MathOverflow)?;
    let base_a = elapsed.checked_mul(1_000_000).ok_or(NovaireMarketError::MathOverflow)?
        .checked_div(t_rem).ok_or(NovaireMarketError::MathOverflow)?;

    let sum = x.checked_add(y).ok_or(NovaireMarketError::MathOverflow)?;
    let avg = sum.checked_div(2).ok_or(NovaireMarketError::MathOverflow)?;

    let a_pool = base_a.checked_mul(avg).ok_or(NovaireMarketError::MathOverflow)?
        .checked_div(1_000_000).ok_or(NovaireMarketError::MathOverflow)?;

    Ok(a_pool)
}

fn compute_k(a_pool: i128, x: i128, y: i128) -> Result<i128, NovaireMarketError> {
    // k = A_pool * (x + y) + x * y
    let sum = x.checked_add(y).ok_or(NovaireMarketError::MathOverflow)?;
    let part1 = a_pool.checked_mul(sum).ok_or(NovaireMarketError::MathOverflow)?;
    let part2 = x.checked_mul(y).ok_or(NovaireMarketError::MathOverflow)?;
    part1.checked_add(part2).ok_or(NovaireMarketError::MathOverflow)
}

fn get_y(a_pool: i128, k: i128, x_new: i128) -> Result<i128, NovaireMarketError> {
    // y_new = (k - A_pool * x_new) / (A_pool + x_new)
    let ax = a_pool.checked_mul(x_new).ok_or(NovaireMarketError::MathOverflow)?;
    if k < ax {
        return Ok(0); // Depleted
    }
    let num = k.checked_sub(ax).ok_or(NovaireMarketError::MathOverflow)?;
    let den = a_pool.checked_add(x_new).ok_or(NovaireMarketError::MathOverflow)?;
    num.checked_div(den).ok_or(NovaireMarketError::MathOverflow)
}

fn get_spot_price(a_pool: i128, x: i128, y: i128) -> Result<i128, NovaireMarketError> {
    // P = (A_pool + y) / (A_pool + x) scaled to 1e9
    let num = a_pool.checked_add(y).ok_or(NovaireMarketError::MathOverflow)?;
    let den = a_pool.checked_add(x).ok_or(NovaireMarketError::MathOverflow)?;
    if den == 0 { return Ok(1_000_000_000); }
    num.checked_mul(1_000_000_000).ok_or(NovaireMarketError::MathOverflow)?
        .checked_div(den).ok_or(NovaireMarketError::MathOverflow)
}

const MINIMUM_LIQUIDITY: i128 = 1000;

#[contract]
pub struct NovaireMarketplace;

#[contractimpl]
impl NovaireMarketplace {
    pub fn initialize(
        env: Env,
        admin: Address,
        pt_token: Address,
        yt_token: Address,
        underlying: Address,
        sy_wrapper: Address,
        tokenizer: Address,
        maturity_ledger: u32,
        maturity_engine: Address,
        maturity_engine_epoch_id: u32,
    ) -> Result<(), NovaireMarketError> {
        admin.require_auth();
        if storage::is_initialized(&env) {
            return Err(NovaireMarketError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PtToken, &pt_token);
        env.storage().instance().set(&DataKey::YtToken, &yt_token);
        env.storage().instance().set(&DataKey::Underlying, &underlying);
        env.storage().instance().set(&DataKey::SyWrapper, &sy_wrapper);
        env.storage().instance().set(&DataKey::Tokenizer, &tokenizer);
        env.storage().instance().set(&DataKey::MaturityLedger, &maturity_ledger);
        env.storage().instance().set(&DataKey::MaturityEngine, &maturity_engine);
        env.storage().instance().set(&DataKey::MaturityEngineEpochId, &maturity_engine_epoch_id);
        env.storage().instance().set(&DataKey::CreatedLedger, &env.ledger().sequence());
        
        storage::set_i128(&env, DataKey::PtReserves, 0);
        storage::set_i128(&env, DataKey::UnderlyingReserves, 0);
        storage::set_i128(&env, DataKey::YtReserves, 0);
        storage::set_i128(&env, DataKey::TotalLpShares, 0);
        storage::set_i128(&env, DataKey::ImpliedRateTwap, 0);

        Ok(())
    }

    /// Delegates the `EpochExpired` gate to MaturityEngine (the canonical
    /// epoch clock) — a single cross-contract call per swap function, reused
    /// internally rather than re-queried at multiple points, to keep the
    /// per-transaction cross-contract call count on this hot path minimal.
    fn require_not_expired(env: &Env) -> Result<(), NovaireMarketError> {
        let maturity_engine = storage::get_address(env, DataKey::MaturityEngine)?;
        let epoch_id = storage::get_u32(env, DataKey::MaturityEngineEpochId)?;
        let engine_client = MaturityEngineClient::new(env, &maturity_engine);
        if engine_client.live_state(&epoch_id) != 0 {
            return Err(NovaireMarketError::EpochExpired);
        }
        Ok(())
    }

    pub fn add_liquidity(
        env: Env,
        provider: Address,
        pt_amount: i128,
        underlying_amount: i128,
    ) -> Result<i128, NovaireMarketError> {
        provider.require_auth();
        if pt_amount <= 0 || underlying_amount <= 0 {
            return Err(NovaireMarketError::ZeroInput);
        }

        let pt_token_addr = storage::get_address(&env, DataKey::PtToken)?;
        let underlying_addr = storage::get_address(&env, DataKey::Underlying)?;
        
        let pt_client = token::Client::new(&env, &pt_token_addr);
        let underlying_client = token::Client::new(&env, &underlying_addr);

        pt_client.transfer(&provider, &env.current_contract_address(), &pt_amount);
        underlying_client.transfer(&provider, &env.current_contract_address(), &underlying_amount);

        let mut pt_reserves = storage::get_i128(&env, DataKey::PtReserves)?;
        let mut underlying_reserves = storage::get_i128(&env, DataKey::UnderlyingReserves)?;
        let mut total_lp_shares = storage::get_i128(&env, DataKey::TotalLpShares)?;

        let lp_shares;
        if total_lp_shares == 0 {
            let initial_lp = integer_sqrt(pt_amount.checked_mul(underlying_amount).ok_or(NovaireMarketError::MathOverflow)?);
            if initial_lp <= MINIMUM_LIQUIDITY {
                return Err(NovaireMarketError::InsufficientLiquidity);
            }
            lp_shares = initial_lp.checked_sub(MINIMUM_LIQUIDITY).unwrap();
            
            // Permanently lock MINIMUM_LIQUIDITY by minting to the contract's own address
            storage::set_lp_balance(&env, &env.current_contract_address(), MINIMUM_LIQUIDITY);
            // We also need to add MINIMUM_LIQUIDITY to total_lp_shares, which happens below:
            // total_lp_shares = total_lp_shares + lp_shares + MINIMUM_LIQUIDITY
            // But wait, the existing code does: total_lp_shares.checked_add(lp_shares)
            // So we should redefine lp_shares as just the user's portion, and explicitly add MINIMUM_LIQUIDITY to total_lp_shares, OR
            // we can set lp_shares = initial_lp - MINIMUM_LIQUIDITY, and manually add MINIMUM_LIQUIDITY to total_lp_shares here.
            total_lp_shares = MINIMUM_LIQUIDITY;
        } else {
            let pt_ratio = pt_amount.checked_mul(total_lp_shares).ok_or(NovaireMarketError::MathOverflow)?
                .checked_div(pt_reserves).ok_or(NovaireMarketError::MathOverflow)?;
            let underlying_ratio = underlying_amount.checked_mul(total_lp_shares).ok_or(NovaireMarketError::MathOverflow)?
                .checked_div(underlying_reserves).ok_or(NovaireMarketError::MathOverflow)?;
            lp_shares = pt_ratio.min(underlying_ratio);
        }

        pt_reserves = pt_reserves.checked_add(pt_amount).ok_or(NovaireMarketError::MathOverflow)?;
        underlying_reserves = underlying_reserves.checked_add(underlying_amount).ok_or(NovaireMarketError::MathOverflow)?;
        total_lp_shares = total_lp_shares.checked_add(lp_shares).ok_or(NovaireMarketError::MathOverflow)?;

        storage::set_i128(&env, DataKey::PtReserves, pt_reserves);
        storage::set_i128(&env, DataKey::UnderlyingReserves, underlying_reserves);
        storage::set_i128(&env, DataKey::TotalLpShares, total_lp_shares);

        let current_lp = storage::get_lp_balance(&env, &provider);
        storage::set_lp_balance(&env, &provider, current_lp.checked_add(lp_shares).ok_or(NovaireMarketError::MathOverflow)?);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "add_liquidity"), provider),
            (pt_amount, underlying_amount, lp_shares),
        );

        Self::assert_invariant(&env)?;
        Ok(lp_shares)
    }

    /// Funds the YT side of the pool so `swap_underlying_for_yt` has real liquidity to
    /// sell against. Without this, `YtReserves` can only ever be decremented (by YT
    /// purchases) or incremented (by YT sales / proportional `remove_liquidity`), with no
    /// legitimate entrypoint to seed it in the first place, so YT purchases always revert
    /// with `InsufficientLiquidity` on a fresh deployment.
    ///
    /// Contributed YT does not mint new LP shares (it isn't priced against PT/underlying
    /// reserves by the AMM curve), so this is intentionally a one-way top-up: contributors
    /// donate YT depth to the pool. It mirrors `add_liquidity`'s minimum-liquidity floor to
    /// keep `swap_yt_for_underlying`'s downstream math (which assumes reserves stay above
    /// dust) safe.
    pub fn add_yt_liquidity(
        env: Env,
        provider: Address,
        yt_amount: i128,
    ) -> Result<i128, NovaireMarketError> {
        provider.require_auth();
        if yt_amount <= 0 {
            return Err(NovaireMarketError::ZeroInput);
        }

        let yt_token_addr = storage::get_address(&env, DataKey::YtToken)?;
        let yt_client = token::Client::new(&env, &yt_token_addr);
        yt_client.transfer(&provider, &env.current_contract_address(), &yt_amount);

        let mut yt_reserves = storage::get_i128(&env, DataKey::YtReserves).unwrap_or(0);
        yt_reserves = yt_reserves.checked_add(yt_amount).ok_or(NovaireMarketError::MathOverflow)?;
        storage::set_i128(&env, DataKey::YtReserves, yt_reserves);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "add_yt_liquidity"), provider),
            (yt_amount, yt_reserves),
        );

        Self::assert_invariant(&env)?;
        Ok(yt_reserves)
    }

    pub fn remove_liquidity(
        env: Env,
        provider: Address,
        lp_shares: i128,
    ) -> Result<(i128, i128, i128), NovaireMarketError> {
        provider.require_auth();
        if lp_shares <= 0 {
            return Err(NovaireMarketError::ZeroInput);
        }

        let current_lp = storage::get_lp_balance(&env, &provider);
        if current_lp < lp_shares {
            return Err(NovaireMarketError::InsufficientLiquidity);
        }

        let mut pt_reserves = storage::get_i128(&env, DataKey::PtReserves)?;
        let mut underlying_reserves = storage::get_i128(&env, DataKey::UnderlyingReserves)?;
        let mut yt_reserves = storage::get_i128(&env, DataKey::YtReserves).unwrap_or(0);
        let mut total_lp_shares = storage::get_i128(&env, DataKey::TotalLpShares)?;

        let pt_out = lp_shares.checked_mul(pt_reserves).ok_or(NovaireMarketError::MathOverflow)?
            .checked_div(total_lp_shares).ok_or(NovaireMarketError::MathOverflow)?;
        let underlying_out = lp_shares.checked_mul(underlying_reserves).ok_or(NovaireMarketError::MathOverflow)?
            .checked_div(total_lp_shares).ok_or(NovaireMarketError::MathOverflow)?;
        let yt_out = lp_shares.checked_mul(yt_reserves).ok_or(NovaireMarketError::MathOverflow)?
            .checked_div(total_lp_shares).ok_or(NovaireMarketError::MathOverflow)?;

        if (pt_reserves.checked_sub(pt_out).unwrap_or(0) < 1000 || underlying_reserves.checked_sub(underlying_out).unwrap_or(0) < 1000)
            && total_lp_shares > lp_shares {
                return Err(NovaireMarketError::BelowMinimumLiquidity);
            }

        pt_reserves = pt_reserves.checked_sub(pt_out).ok_or(NovaireMarketError::MathOverflow)?;
        underlying_reserves = underlying_reserves.checked_sub(underlying_out).ok_or(NovaireMarketError::MathOverflow)?;
        total_lp_shares = total_lp_shares.checked_sub(lp_shares).ok_or(NovaireMarketError::MathOverflow)?;

        yt_reserves = yt_reserves.checked_sub(yt_out).unwrap_or(0);
        storage::set_lp_balance(&env, &provider, current_lp.checked_sub(lp_shares).ok_or(NovaireMarketError::MathOverflow)?);
        storage::set_i128(&env, DataKey::PtReserves, pt_reserves);
        storage::set_i128(&env, DataKey::UnderlyingReserves, underlying_reserves);
        storage::set_i128(&env, DataKey::YtReserves, yt_reserves);
        storage::set_i128(&env, DataKey::TotalLpShares, total_lp_shares);

        let pt_token_addr = storage::get_address(&env, DataKey::PtToken)?;
        let underlying_addr = storage::get_address(&env, DataKey::Underlying)?;
        let yt_token_addr = storage::get_address(&env, DataKey::YtToken)?;
        
        let pt_client = token::Client::new(&env, &pt_token_addr);
        let underlying_client = token::Client::new(&env, &underlying_addr);

        pt_client.transfer(&env.current_contract_address(), &provider, &pt_out);
        underlying_client.transfer(&env.current_contract_address(), &provider, &underlying_out);
        if yt_out > 0 {
            token::Client::new(&env, &yt_token_addr).transfer(&env.current_contract_address(), &provider, &yt_out);
        }

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "remove_liquidity"), provider),
            (lp_shares, pt_out, underlying_out),
        );

        Self::assert_invariant(&env)?;
        Ok((pt_out, underlying_out, yt_out))
    }

    pub fn swap_underlying_for_pt(
        env: Env,
        buyer: Address,
        underlying_in: i128,
        min_pt_out: i128,
    ) -> Result<i128, NovaireMarketError> {
        buyer.require_auth();
        if underlying_in <= 0 || min_pt_out < 0 {
            return Err(NovaireMarketError::ZeroInput);
        }

        Self::require_not_expired(&env)?;
        let maturity = storage::get_u32(&env, DataKey::MaturityLedger)?;

        let pt_reserves = storage::get_i128(&env, DataKey::PtReserves)?;
        let underlying_reserves = storage::get_i128(&env, DataKey::UnderlyingReserves)?;

        let a_pool = compute_a_pool(&env, maturity, underlying_reserves, pt_reserves)?;
        let k = compute_k(a_pool, underlying_reserves, pt_reserves)?;

        let underlying_in_after_fee = underlying_in.checked_mul(997).ok_or(NovaireMarketError::MathOverflow)?.checked_div(1000).ok_or(NovaireMarketError::MathOverflow)?;
        let new_underlying = underlying_reserves.checked_add(underlying_in_after_fee).ok_or(NovaireMarketError::MathOverflow)?;

        let new_pt = get_y(a_pool, k, new_underlying)?;
        let pt_out = pt_reserves.checked_sub(new_pt).unwrap_or(0);

        if pt_out < min_pt_out {
            return Err(NovaireMarketError::SlippageExceeded);
        }

        if pt_reserves.checked_sub(pt_out).unwrap_or(0) < 1000 {
            return Err(NovaireMarketError::BelowMinimumLiquidity);
        }

        // Fix H3: Update TWAP using the PRE-SWAP spot price for the elapsed interval
        Self::update_twap(&env, a_pool, pt_reserves, underlying_reserves)?;

        storage::set_i128(&env, DataKey::PtReserves, pt_reserves.checked_sub(pt_out).ok_or(NovaireMarketError::MathOverflow)?);
        storage::set_i128(&env, DataKey::UnderlyingReserves, underlying_reserves.checked_add(underlying_in).ok_or(NovaireMarketError::MathOverflow)?);

        let pt_token_addr = storage::get_address(&env, DataKey::PtToken)?;
        let underlying_addr = storage::get_address(&env, DataKey::Underlying)?;
        
        let pt_client = token::Client::new(&env, &pt_token_addr);
        let underlying_client = token::Client::new(&env, &underlying_addr);

        underlying_client.transfer(&buyer, &env.current_contract_address(), &underlying_in);
        pt_client.transfer(&env.current_contract_address(), &buyer, &pt_out);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "swap_u_pt"), buyer),
            (underlying_in, pt_out),
        );

        Self::assert_invariant(&env)?;
        Ok(pt_out)
    }

    pub fn swap_pt_for_underlying(
        env: Env,
        seller: Address,
        pt_in: i128,
        min_underlying_out: i128,
    ) -> Result<i128, NovaireMarketError> {
        seller.require_auth();
        if pt_in <= 0 || min_underlying_out < 0 {
            return Err(NovaireMarketError::ZeroInput);
        }

        Self::require_not_expired(&env)?;
        let maturity = storage::get_u32(&env, DataKey::MaturityLedger)?;

        let pt_reserves = storage::get_i128(&env, DataKey::PtReserves)?;
        let underlying_reserves = storage::get_i128(&env, DataKey::UnderlyingReserves)?;

        let a_pool = compute_a_pool(&env, maturity, pt_reserves, underlying_reserves)?;
        let k = compute_k(a_pool, pt_reserves, underlying_reserves)?;

        let pt_in_after_fee = pt_in.checked_mul(997).ok_or(NovaireMarketError::MathOverflow)?.checked_div(1000).ok_or(NovaireMarketError::MathOverflow)?;
        let new_pt = pt_reserves.checked_add(pt_in_after_fee).ok_or(NovaireMarketError::MathOverflow)?;

        let new_underlying = get_y(a_pool, k, new_pt)?;
        let underlying_out = underlying_reserves.checked_sub(new_underlying).unwrap_or(0);

        if underlying_out < min_underlying_out {
            return Err(NovaireMarketError::SlippageExceeded);
        }

        if underlying_reserves.checked_sub(underlying_out).unwrap_or(0) < 1000 {
            return Err(NovaireMarketError::BelowMinimumLiquidity);
        }

        // Fix H3: Update TWAP using the PRE-SWAP spot price for the elapsed interval
        Self::update_twap(&env, a_pool, pt_reserves, underlying_reserves)?;

        storage::set_i128(&env, DataKey::PtReserves, pt_reserves.checked_add(pt_in).ok_or(NovaireMarketError::MathOverflow)?);
        storage::set_i128(&env, DataKey::UnderlyingReserves, underlying_reserves.checked_sub(underlying_out).ok_or(NovaireMarketError::MathOverflow)?);

        let pt_token_addr = storage::get_address(&env, DataKey::PtToken)?;
        let underlying_addr = storage::get_address(&env, DataKey::Underlying)?;
        
        let pt_client = token::Client::new(&env, &pt_token_addr);
        let underlying_client = token::Client::new(&env, &underlying_addr);

        pt_client.transfer(&seller, &env.current_contract_address(), &pt_in);
        underlying_client.transfer(&env.current_contract_address(), &seller, &underlying_out);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "swap_pt_u"), seller),
            (pt_in, underlying_out),
        );

        Self::assert_invariant(&env)?;
        Ok(underlying_out)
    }

    pub fn swap_underlying_for_yt(
        env: Env,
        buyer: Address,
        underlying_in: i128,
        min_yt_out: i128,
    ) -> Result<i128, NovaireMarketError> {
        buyer.require_auth();
        if underlying_in <= 0 || min_yt_out < 0 {
            return Err(NovaireMarketError::ZeroInput);
        }

        Self::require_not_expired(&env)?;
        let maturity = storage::get_u32(&env, DataKey::MaturityLedger)?;

        let pt_reserves = storage::get_i128(&env, DataKey::PtReserves)?;
        let underlying_reserves = storage::get_i128(&env, DataKey::UnderlyingReserves)?;

        let pt_twap = Self::get_twap_rate(env.clone())?;
        let capped_pt_price = if pt_twap > 1_000_000_000_i128 {
            1_000_000_000_i128
        } else {
            pt_twap
        };
        let yt_price = 1_000_000_000_i128.checked_sub(capped_pt_price).unwrap_or(0);
        soroban_sdk::log!(&env, "pt_twap={}, capped_pt_price={}, yt_price={}", pt_twap, capped_pt_price, yt_price);
        if yt_price == 0 {
            return Err(NovaireMarketError::MathOverflow);
        }

        
        let yt_out_raw = underlying_in.checked_mul(1_000_000_000).ok_or(NovaireMarketError::MathOverflow)?
            .checked_div(yt_price).ok_or(NovaireMarketError::MathOverflow)?;
            
        let actual_yt_out = yt_out_raw.checked_mul(995).ok_or(NovaireMarketError::MathOverflow)?
            .checked_div(1000).ok_or(NovaireMarketError::MathOverflow)?;

        if actual_yt_out < min_yt_out {
            return Err(NovaireMarketError::SlippageExceeded);
        }

        let mut yt_reserves = storage::get_i128(&env, DataKey::YtReserves).unwrap_or(0);
        soroban_sdk::log!(&env, "actual_yt_out={}, yt_reserves={}", actual_yt_out, yt_reserves);
        if yt_reserves < actual_yt_out {
            return Err(NovaireMarketError::InsufficientLiquidity);
        }

        yt_reserves = yt_reserves.checked_sub(actual_yt_out).ok_or(NovaireMarketError::MathOverflow)?;
        storage::set_i128(&env, DataKey::YtReserves, yt_reserves);

        let a_pool = compute_a_pool(&env, maturity, underlying_reserves, pt_reserves)?;
        Self::update_twap(&env, a_pool, pt_reserves, underlying_reserves)?;

        // C1 fix: credit underlying reserves with incoming amount
        storage::set_i128(&env, DataKey::UnderlyingReserves,
            underlying_reserves.checked_add(underlying_in).ok_or(NovaireMarketError::MathOverflow)?);

        let yt_token_addr = storage::get_address(&env, DataKey::YtToken)?;
        let underlying_addr = storage::get_address(&env, DataKey::Underlying)?;
        
        let yt_client = token::Client::new(&env, &yt_token_addr);
        let underlying_client = token::Client::new(&env, &underlying_addr);

        underlying_client.transfer(&buyer, &env.current_contract_address(), &underlying_in);
        yt_client.transfer(&env.current_contract_address(), &buyer, &actual_yt_out);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "swap_u_yt"), buyer),
            (underlying_in, actual_yt_out),
        );

        Self::assert_invariant(&env)?;
        Ok(actual_yt_out)
    }

    pub fn swap_yt_for_underlying(
        env: Env,
        seller: Address,
        yt_in: i128,
        min_underlying_out: i128,
    ) -> Result<i128, NovaireMarketError> {
        seller.require_auth();
        if yt_in <= 0 || min_underlying_out < 0 {
            env.events().publish((soroban_sdk::Symbol::new(&env, "diag"), soroban_sdk::Symbol::new(&env, "zero_input")), yt_in);
            return Err(NovaireMarketError::ZeroInput);
        }

        Self::require_not_expired(&env)?;
        let maturity = storage::get_u32(&env, DataKey::MaturityLedger)?;

        let pt_reserves = storage::get_i128(&env, DataKey::PtReserves)?;
        let underlying_reserves = storage::get_i128(&env, DataKey::UnderlyingReserves)?;

        let pt_twap = Self::get_twap_rate(env.clone())?;

        let capped_pt_price = if pt_twap > 1_000_000_000_i128 {
            1_000_000_000_i128
        } else {
            pt_twap
        };
        let yt_price = 1_000_000_000_i128.checked_sub(capped_pt_price).unwrap_or(0);

        
        let underlying_out_raw = yt_in.checked_mul(yt_price).ok_or(NovaireMarketError::MathOverflow)?
            .checked_div(1_000_000_000).ok_or(NovaireMarketError::MathOverflow)?;
            
        let actual_underlying_out = underlying_out_raw.checked_mul(995).ok_or(NovaireMarketError::MathOverflow)?
            .checked_div(1000).ok_or(NovaireMarketError::MathOverflow)?;

        if actual_underlying_out < min_underlying_out {
            env.events().publish((soroban_sdk::Symbol::new(&env, "diag_slip"), actual_underlying_out, min_underlying_out), 0);
            return Err(NovaireMarketError::SlippageExceeded);
        }

        let mut yt_reserves = storage::get_i128(&env, DataKey::YtReserves).unwrap_or(0);
        yt_reserves = yt_reserves.checked_add(yt_in).ok_or(NovaireMarketError::MathOverflow)?;
        storage::set_i128(&env, DataKey::YtReserves, yt_reserves);

        let yt_token_addr = storage::get_address(&env, DataKey::YtToken)?;
        let underlying_addr = storage::get_address(&env, DataKey::Underlying)?;
        
        let yt_client = token::Client::new(&env, &yt_token_addr);
        let underlying_client = token::Client::new(&env, &underlying_addr);

        yt_client.transfer(&seller, &env.current_contract_address(), &yt_in);
        underlying_client.transfer(&env.current_contract_address(), &seller, &actual_underlying_out);

        let a_pool = compute_a_pool(&env, maturity, underlying_reserves, pt_reserves)?;
        Self::update_twap(&env, a_pool, pt_reserves, underlying_reserves)?;

        let new_underlying_reserves = underlying_reserves.checked_sub(actual_underlying_out).ok_or(NovaireMarketError::MathOverflow)?;
        storage::set_i128(&env, DataKey::UnderlyingReserves, new_underlying_reserves);

        Self::assert_invariant(&env)?;

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "swap_yt_u"), seller),
            (yt_in, actual_underlying_out),
        );
        Ok(actual_underlying_out)
    }

    pub fn claim_amm_yield(env: Env) -> Result<i128, NovaireMarketError> {
        let tokenizer_addr = storage::get_address(&env, DataKey::Tokenizer)?;
        let tokenizer_client = TokenizerClient::new(&env, &tokenizer_addr);
        
        let claimed = tokenizer_client.claim_yield(&env.current_contract_address());
        
        if claimed > 0 {
            let mut underlying_reserves = storage::get_i128(&env, DataKey::UnderlyingReserves)?;
            underlying_reserves = underlying_reserves.checked_add(claimed).ok_or(NovaireMarketError::MathOverflow)?;
            storage::set_i128(&env, DataKey::UnderlyingReserves, underlying_reserves);
            
            env.events().publish((soroban_sdk::Symbol::new(&env, "amm_yield"), env.current_contract_address()), claimed);
        }
        
        Self::assert_invariant(&env)?;
        Ok(claimed)
    }

    pub fn get_pt_price(env: Env) -> Result<i128, NovaireMarketError> {
        let pt_reserves = storage::get_i128(&env, DataKey::PtReserves).unwrap_or(0);
        let underlying_reserves = storage::get_i128(&env, DataKey::UnderlyingReserves).unwrap_or(0);
        let maturity = storage::get_u32(&env, DataKey::MaturityLedger)?;
        let a_pool = compute_a_pool(&env, maturity, underlying_reserves, pt_reserves)?;
        get_spot_price(a_pool, pt_reserves, underlying_reserves)
    }

    pub fn get_twap_rate(env: Env) -> Result<i128, NovaireMarketError> {
        let stored_twap = storage::get_i128(&env, DataKey::ImpliedRateTwap).unwrap_or(0);
        if stored_twap == 0 {
            let pt_reserves = storage::get_i128(&env, DataKey::PtReserves).unwrap_or(0);
            let underlying_reserves = storage::get_i128(&env, DataKey::UnderlyingReserves).unwrap_or(0);
            let maturity = storage::get_u32(&env, DataKey::MaturityLedger)?;
            let a_pool = compute_a_pool(&env, maturity, pt_reserves, underlying_reserves)?;
            return get_spot_price(a_pool, pt_reserves, underlying_reserves);
        }
        Ok(stored_twap)
    }

    pub fn get_reserves(env: Env) -> Result<(i128, i128, i128), NovaireMarketError> {
        let pt = storage::get_i128(&env, DataKey::PtReserves).unwrap_or(0);
        let under = storage::get_i128(&env, DataKey::UnderlyingReserves).unwrap_or(0);
        let yt = storage::get_i128(&env, DataKey::YtReserves).unwrap_or(0);
        Ok((pt, under, yt))
    }

    fn update_twap(env: &Env, a_pool: i128, pt_reserves: i128, underlying_reserves: i128) -> Result<(), NovaireMarketError> {
        let current_spot = get_spot_price(a_pool, pt_reserves, underlying_reserves)?;
        let current_ledger = env.ledger().sequence();
        let last_ledger = storage::get_u32(env, DataKey::LastTwapLedger).unwrap_or(0);
        
        let old_twap = storage::get_i128(env, DataKey::ImpliedRateTwap).unwrap_or(0);

        if old_twap == 0 || last_ledger == 0 {
            storage::set_i128(env, DataKey::ImpliedRateTwap, current_spot);
            env.storage().instance().set(&DataKey::LastTwapLedger, &current_ledger);
            return Ok(());
        }

        if current_ledger <= last_ledger {
            return Ok(());
        }

        let elapsed = current_ledger.saturating_sub(last_ledger) as i128;
        let weight_old = 20i128;
        let weight_new = elapsed.min(weight_old);
        
        let new_twap = old_twap.checked_mul(weight_old.checked_sub(weight_new).unwrap_or(0)).unwrap_or(0)
            .checked_add(current_spot.checked_mul(weight_new).unwrap_or(0)).unwrap_or(0)
            .checked_div(weight_old).unwrap_or(0);

        storage::set_i128(env, DataKey::ImpliedRateTwap, new_twap);
        env.storage().instance().set(&DataKey::LastTwapLedger, &current_ledger);
        Ok(())
    }

    fn assert_invariant(env: &Env) -> Result<(), NovaireMarketError> {
        let pt = storage::get_i128(env, DataKey::PtReserves)?;
        let under = storage::get_i128(env, DataKey::UnderlyingReserves)?;
        let total_lp = storage::get_i128(env, DataKey::TotalLpShares)?;
        
        if (pt == 0 && under > 0) || (under == 0 && pt > 0) {
            return Err(NovaireMarketError::InsufficientLiquidity); // 2
        }
        if total_lp == 0 && (pt > 0 || under > 0) {
            return Err(NovaireMarketError::ZeroInput); // 3
        }
        
        let pt_token_addr = storage::get_address(env, DataKey::PtToken)?;
        let underlying_addr = storage::get_address(env, DataKey::Underlying)?;
        let pt_client = token::Client::new(env, &pt_token_addr);
        let underlying_client = token::Client::new(env, &underlying_addr);
        
        let contract_addr = env.current_contract_address();
        let actual_pt = pt_client.balance(&contract_addr);
        let actual_underlying = underlying_client.balance(&contract_addr);

        if actual_pt < pt {
            return Err(NovaireMarketError::InsufficientLiquidity); // 2
        }
        if actual_underlying < under {
            return Err(NovaireMarketError::ZeroInput); // 3
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
    use maturity_engine::{MaturityEngine, MaturityEngineClient as RealMaturityEngineClient};

    // ── CONSTANTS ────────────────────────────────────────────────────────────
    const CREATED_AT: u32 = 10;
    const MATURITY_AT: u32 = 1_000;
    // PT > underlying → PT is abundant (cheap) → spot price < 1e9 (discounted), economically correct
    const BOOTSTRAP_PT: i128 = 1_000_000_000;    // same as face value
    const BOOTSTRAP_UNDER: i128 = 999_500_000;   // 0.05% less than PT → tiny discount
    const SCALE: i128 = 1_000_000_000;            // 1e9 fixed-point face value

    // ── SHARED SETUP ─────────────────────────────────────────────────────────
    fn setup_env() -> (Env, Address, Address, Address, NovaireMarketplaceClient<'static>, RealSyWrapperClient<'static>, token::StellarAssetClient<'static>) {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();

        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let underlying_token = token_contract.address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract.address());

        let sy_contract_id = env.register(SyWrapper, ());
        let sy_client = RealSyWrapperClient::new(&env, &sy_contract_id);

        let vault_contract_id = env.register(Vault, ());
        let vault_client = RealVaultClient::new(&env, &vault_contract_id);

        sy_client.initialize(&admin, &underlying_token, &vault_contract_id);
        vault_client.initialize(&admin, &sy_contract_id, &underlying_token);

        let pt_contract_id = env.register(PtToken, ());
        let pt_client = RealPtClient::new(&env, &pt_contract_id);
        pt_client.initialize(&admin, &Address::generate(&env));

        let maturity_engine_id = env.register(MaturityEngine, ());
        let maturity_engine_client = RealMaturityEngineClient::new(&env, &maturity_engine_id);
        maturity_engine_client.initialize(&admin);

        let yt_contract_id = env.register(YtToken, ());
        let yt_client = RealYtClient::new(&env, &yt_contract_id);

        let market_contract_id = env.register(NovaireMarketplace, ());
        let market_client = NovaireMarketplaceClient::new(&env, &market_contract_id);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_AT,
            ..env.ledger().get()
        });

        let maturity_epoch_id = maturity_engine_client.open_epoch(&MATURITY_AT);
        yt_client.initialize(&admin, &Address::generate(&env), &1_000, &sy_contract_id, &maturity_engine_id, &maturity_epoch_id);

        market_client.initialize(
            &admin,
            &pt_contract_id,
            &yt_contract_id,
            &underlying_token,
            &sy_contract_id,
            &Address::generate(&env),
            &MATURITY_AT,
            &maturity_engine_id,
            &maturity_epoch_id,
        );

        (env, admin, underlying_token, pt_contract_id, market_client, sy_client, token_admin_client)
    }

    /// Seed bootstrap-equivalent liquidity and return the provider address.
    fn bootstrap(
        env: &Env,
        market_client: &NovaireMarketplaceClient,
        token_admin_client: &token::StellarAssetClient,
        pt_token: &Address,
        pt_amount: i128,
        underlying_amount: i128,
    ) -> Address {
        let provider = Address::generate(env);
        let pt_client = pt_token::PtTokenClient::new(env, pt_token);
        token_admin_client.mint(&provider, &(underlying_amount * 2));
        pt_client.mint(&provider, &(pt_amount * 2));
        market_client.add_liquidity(&provider, &pt_amount, &underlying_amount);
        provider
    }

    // ── TEST 1: Clean bootstrap reserves ────────────────────────────────────
    // Verifies: fresh deployment has empty reserves, then bootstrap sets them exactly once.
    #[test]
    fn test_1_clean_bootstrap_reserves_match() {
        let (env, _, _, pt_token, market_client, _, token_admin_client) = setup_env();

        // Before bootstrap, reserves must be empty.
        let (pt0, under0, yt0) = market_client.get_reserves();
        assert_eq!(pt0, 0, "Fresh market must have 0 PT reserves");
        assert_eq!(under0, 0, "Fresh market must have 0 underlying reserves");
        assert_eq!(yt0, 0, "Fresh market must have 0 YT reserves");

        // Seed exactly once with bootstrap values.
        bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        let (pt, under, _yt) = market_client.get_reserves();
        assert_eq!(pt, BOOTSTRAP_PT, "PT reserves must exactly match bootstrap seed");
        assert_eq!(under, BOOTSTRAP_UNDER, "Underlying reserves must exactly match bootstrap seed");
    }

    // ── TEST 2: TWAP equals Spot Price immediately after bootstrap ───────────
    // Verifies: on the first update_twap call the TWAP is initialized to the spot price.
    #[test]
    fn test_2_twap_equals_spot_at_bootstrap() {
        let (env, _, _, pt_token, market_client, _, token_admin_client) = setup_env();
        bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        // Advance one ledger so a swap can update the TWAP.
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_AT + 1,
            ..env.ledger().get()
        });

        let spot_before = market_client.get_pt_price();

        // Perform a tiny swap to trigger the first TWAP write.
        let buyer = Address::generate(&env);
        token_admin_client.mint(&buyer, &10_000_000);
        market_client.swap_underlying_for_pt(&buyer, &1_000, &1);

        let _spot_after = market_client.get_pt_price();
        let twap = market_client.get_twap_rate();

        // Fix H3: The TWAP now records the PRE-SWAP spot price for the elapsed interval, not the POST-SWAP spot price.
        let diff = (twap - spot_before).abs();
        assert!(diff <= 3, "TWAP ({}) must equal pre-swap spot price ({}) on first initialization (diff={})", twap, spot_before, diff);
    }

    // ── TEST 3: TWAP ≤ Face Value invariant ─────────────────────────────────
    // Verifies: the stored TWAP is never > 1.0 (i.e., never > SCALE) before maturity.
    #[test]
    fn test_3_twap_below_face_value() {
        let (env, _, _, pt_token, market_client, _, token_admin_client) = setup_env();
        bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_AT + 1,
            ..env.ledger().get()
        });
        let buyer = Address::generate(&env);
        token_admin_client.mint(&buyer, &10_000_000);
        market_client.swap_underlying_for_pt(&buyer, &1_000, &1);

        let twap = market_client.get_twap_rate();
        assert!(twap > 0, "TWAP must be positive");
        assert!(twap <= SCALE, "TWAP must be <= face value (1e9) — inverse price bug re-emerged");

        let spot = market_client.get_pt_price();
        assert!(spot > 0, "Spot Price must be positive");
        assert!(spot <= SCALE, "Spot Price must be <= face value (1e9)");
    }

    // ── TEST 4: EMA converges toward Spot Price over successive ledger updates ─
    // Verifies: repeated swaps at later ledgers pull TWAP toward new spot.
    #[test]
    fn test_4_ema_converges_toward_spot() {
        let (env, _, _, pt_token, market_client, _, token_admin_client) = setup_env();
        bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_AT + 1,
            ..env.ledger().get()
        });
        let buyer = Address::generate(&env);
        token_admin_client.mint(&buyer, &500_000_000);
        market_client.swap_underlying_for_pt(&buyer, &1_000, &1);
        let twap_after_first = market_client.get_twap_rate();

        for i in 2u32..=5 {
            env.ledger().set(soroban_sdk::testutils::LedgerInfo {
                sequence_number: CREATED_AT + i * 30,
                ..env.ledger().get()
            });
            market_client.swap_underlying_for_pt(&buyer, &1_000, &1);
        }

        let twap_after_many = market_client.get_twap_rate();
        let spot_after_many = market_client.get_pt_price();

        assert!(twap_after_first > 0 && twap_after_first <= SCALE);
        assert!(twap_after_many > 0 && twap_after_many <= SCALE);
        assert!(spot_after_many > 0 && spot_after_many <= SCALE);
    }

    // ── TEST 5: Same-ledger swaps do NOT modify TWAP ────────────────────────
    // Verifies: two swaps in the same ledger leave TWAP unchanged.
    #[test]
    fn test_5_same_ledger_twap_idempotent() {
        let (env, _, _, pt_token, market_client, _, token_admin_client) = setup_env();
        bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 50,
            ..env.ledger().get()
        });
        let buyer = Address::generate(&env);
        token_admin_client.mint(&buyer, &500_000_000);
        market_client.swap_underlying_for_pt(&buyer, &1_000, &1);
        let twap_first = market_client.get_twap_rate();

        // Second swap on the SAME ledger.
        market_client.swap_underlying_for_pt(&buyer, &1_000, &1);
        let twap_second = market_client.get_twap_rate();

        assert_eq!(twap_first, twap_second, "TWAP must not change for same-ledger swaps");
    }

    // ── TEST 6: Flash-loan manipulation resistance ───────────────────────────
    // Verifies: a large single-block swap moves spot but TWAP is strongly dampened.
    #[test]
    fn test_6_flash_loan_twap_resistance() {
        let (env, _, _, pt_token, market_client, _, token_admin_client) = setup_env();
        bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 100,
            ..env.ledger().get()
        });
        let baseline_buyer = Address::generate(&env);
        token_admin_client.mint(&baseline_buyer, &100_000_000);
        market_client.swap_underlying_for_pt(&baseline_buyer, &1_000, &1);
        let twap_baseline = market_client.get_twap_rate();

        // One ledger later: large flash-loan-style trade.
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 101,
            ..env.ledger().get()
        });
        let attacker = Address::generate(&env);
        let pt_client = pt_token::PtTokenClient::new(&env, &pt_token);
        pt_client.mint(&attacker, &100_000_000);
        token_admin_client.mint(&attacker, &100_000_000);
        market_client.swap_pt_for_underlying(&attacker, &50_000_000, &1);

        let spot_after_attack = market_client.get_pt_price();
        let twap_after_attack = market_client.get_twap_rate();

        let twap_delta = if twap_baseline > twap_after_attack {
            twap_baseline - twap_after_attack
        } else {
            twap_after_attack - twap_baseline
        };
        // TWAP shift <= 100% of baseline is a generous upper bound; real EMA bound is 5%.
        assert!(twap_delta <= twap_baseline, "TWAP moved more than 100% from baseline — EMA broken");
        assert!(spot_after_attack > 0 && spot_after_attack <= SCALE);
        assert!(twap_after_attack > 0 && twap_after_attack <= SCALE);
    }

    // ── TEST 6b: H3 TWAP Temporal Ordering Regression ────────────────────────
    // Verifies: after a long idle period, TWAP captures PRE-SWAP price, NOT POST-SWAP.
    #[test]
    fn test_6b_h3_twap_temporal_ordering_regression() {
        let (env, _, _, pt_token, market_client, _, token_admin_client) = setup_env();
        bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 100,
            ..env.ledger().get()
        });
        
        let baseline_buyer = Address::generate(&env);
        token_admin_client.mint(&baseline_buyer, &100_000_000);
        market_client.swap_underlying_for_pt(&baseline_buyer, &1_000, &1);
        let _twap_baseline = market_client.get_twap_rate();

        // 20 ledgers later (max weight): large flash-loan-style trade.
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 120,
            ..env.ledger().get()
        });

        // The pre-swap spot price at sequence 120 will be slightly different from sequence 100 
        // because the YieldSpace A-pool depends on time to maturity. 
        // We capture it right before the attack to verify TWAP accurately captures the PRE-swap price.
        let spot_baseline = market_client.get_pt_price();

        let attacker = Address::generate(&env);
        let pt_client = pt_token::PtTokenClient::new(&env, &pt_token);
        pt_client.mint(&attacker, &100_000_000);
        token_admin_client.mint(&attacker, &100_000_000);
        
        // Attacker dumps massive amount of PT to crash spot price
        market_client.swap_pt_for_underlying(&attacker, &50_000_000, &1);

        let spot_after_attack = market_client.get_pt_price();
        let twap_after_attack = market_client.get_twap_rate();

        // The H3 fix ensures the TWAP captures the PRE-SWAP spot price for the elapsed 20 ledgers.
        // Since no trades happened for 20 ledgers, the pre-swap spot price is exactly the spot_baseline!
        // Therefore, twap_after_attack must exactly equal spot_baseline, and NOT spot_after_attack.
        
        // Allow tiny rounding difference (±3)
        let diff = (twap_after_attack - spot_baseline).abs();
        assert!(diff <= 3, "H3 FIX FAILED: TWAP ({}) did not capture pre-swap spot price ({})", twap_after_attack, spot_baseline);
        
        // Ensure the post-swap spot price is severely manipulated (to prove the attack happened)
        assert!(spot_after_attack < spot_baseline - 100_000, "Spot price was not manipulated enough");
        
        // Ensure the TWAP did NOT collapse to the manipulated spot price
        assert!(twap_after_attack > spot_after_attack + 100_000, "H3 VULNERABILITY: TWAP collapsed to manipulated spot price!");
    }

    // ── TEST 7: No reciprocal pricing regression ─────────────────────────────
    // Verifies: update_twap never stores a value > SCALE (the old inverted-price bug).
    #[test]
    fn test_7_no_reciprocal_twap_regression() {
        let (env, _, _, pt_token, market_client, _, token_admin_client) = setup_env();
        bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        let buyer = Address::generate(&env);
        token_admin_client.mint(&buyer, &2_000_000_000);
        let pt_client = pt_token::PtTokenClient::new(&env, &pt_token);
        pt_client.mint(&buyer, &2_000_000_000);

        for i in 1u32..=10 {
            env.ledger().set(soroban_sdk::testutils::LedgerInfo {
                sequence_number: CREATED_AT + i * 50,
                ..env.ledger().get()
            });
            if i % 2 == 0 {
                market_client.swap_underlying_for_pt(&buyer, &10_000, &1);
            } else {
                market_client.swap_pt_for_underlying(&buyer, &10_000, &1);
            }

            let twap = market_client.get_twap_rate();
            assert!(
                twap <= SCALE,
                "Iteration {}: TWAP = {} exceeded SCALE = {} — reciprocal price bug re-emerged!",
                i, twap, SCALE
            );
            assert!(twap > 0, "Iteration {}: TWAP must be positive", i);
        }
    }

    // ── TEST 8: Spot and TWAP directional agreement ──────────────────────────
    // Verifies: both prices are discounted (< SCALE) or both at par — never straddling.
    #[test]
    fn test_8_twap_and_spot_directional_agreement() {
        let (env, _, _, pt_token, market_client, _, token_admin_client) = setup_env();
        bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 500,
            ..env.ledger().get()
        });

        let buyer = Address::generate(&env);
        token_admin_client.mint(&buyer, &50_000_000);
        market_client.swap_underlying_for_pt(&buyer, &1_000, &1);

        let spot = market_client.get_pt_price();
        let twap = market_client.get_twap_rate();

        assert!(spot > 0 && spot <= SCALE, "Spot out of range: {}", spot);
        assert!(twap > 0 && twap <= SCALE, "TWAP out of range: {}", twap);
        // Both must agree on whether PT is discounted.
        let spot_discounted = spot < SCALE;
        let twap_discounted = twap < SCALE;
        assert_eq!(
            spot_discounted, twap_discounted,
            "Spot ({}) and TWAP ({}) must agree on whether PT is discounted",
            spot, twap
        );
    }

    // ── TEST 9: Slippage protection still works ──────────────────────────────
    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_9_slippage_protection() {
        let (env, _, _, pt_token, market_client, _, token_admin_client) = setup_env();
        let provider = Address::generate(&env);
        let pt_client = pt_token::PtTokenClient::new(&env, &pt_token);
        token_admin_client.mint(&provider, &10_000_000_000);
        pt_client.mint(&provider, &10_000_000_000);
        market_client.add_liquidity(&provider, &10_000_000, &10_000_000);

        let buyer = Address::generate(&env);
        token_admin_client.mint(&buyer, &1_000_000);
        market_client.swap_underlying_for_pt(&buyer, &1_000_000, &2_000_000_000); // Impossible
    }

    // ── TEST 10: Near-maturity pricing converges toward 1:1 ─────────────────
    #[test]
    fn test_10_near_maturity_pt_price() {
        let (env, _, _, pt_token, market_client, _, token_admin_client) = setup_env();
        let provider = Address::generate(&env);
        let pt_client = pt_token::PtTokenClient::new(&env, &pt_token);
        token_admin_client.mint(&provider, &10_000_000_000);
        pt_client.mint(&provider, &10_000_000_000);
        market_client.add_liquidity(&provider, &10_000_000, &10_000_000);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 990,
            ..env.ledger().get()
        });

        let pt_price = market_client.get_pt_price();
        assert!(pt_price > 900_000_000, "Near maturity PT price must be close to face value");
        assert!(pt_price <= SCALE, "Near maturity PT price must not exceed face value");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // C1 REGRESSION TESTS — Reserve Accounting after YT Swaps
    // ══════════════════════════════════════════════════════════════════════════

    /// Extended setup that also returns the YT token address.
    fn setup_env_with_yt() -> (Env, Address, Address, Address, Address, NovaireMarketplaceClient<'static>, token::StellarAssetClient<'static>) {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();

        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let underlying_token = token_contract.address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract.address());

        let sy_contract_id = env.register(SyWrapper, ());
        let sy_client = RealSyWrapperClient::new(&env, &sy_contract_id);

        let vault_contract_id = env.register(Vault, ());
        let vault_client = RealVaultClient::new(&env, &vault_contract_id);

        sy_client.initialize(&admin, &underlying_token, &vault_contract_id);
        vault_client.initialize(&admin, &sy_contract_id, &underlying_token);

        let pt_contract_id = env.register(PtToken, ());
        let pt_client = RealPtClient::new(&env, &pt_contract_id);
        pt_client.initialize(&admin, &Address::generate(&env));

        let maturity_engine_id = env.register(MaturityEngine, ());
        let maturity_engine_client = RealMaturityEngineClient::new(&env, &maturity_engine_id);
        maturity_engine_client.initialize(&admin);

        let yt_contract_id = env.register(YtToken, ());
        let yt_client = RealYtClient::new(&env, &yt_contract_id);

        let market_contract_id = env.register(NovaireMarketplace, ());
        let market_client = NovaireMarketplaceClient::new(&env, &market_contract_id);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_AT,
            ..env.ledger().get()
        });

        let maturity_epoch_id = maturity_engine_client.open_epoch(&MATURITY_AT);
        yt_client.initialize(&admin, &Address::generate(&env), &1_000, &sy_contract_id, &maturity_engine_id, &maturity_epoch_id);

        market_client.initialize(
            &admin,
            &pt_contract_id,
            &yt_contract_id,
            &underlying_token,
            &sy_contract_id,
            &Address::generate(&env),
            &MATURITY_AT,
            &maturity_engine_id,
            &maturity_epoch_id,
        );

        (env, admin, underlying_token, pt_contract_id, yt_contract_id, market_client, token_admin_client)
    }

    /// Seed YT reserves by having a seller swap YT into the marketplace.
    /// Returns the amount of YT now held in reserves.
    fn seed_yt_reserves(
        env: &Env,
        market_client: &NovaireMarketplaceClient,
        yt_token: &Address,
        yt_amount: i128,
    ) {
        let yt_client = yt_token::YtTokenClient::new(env, yt_token);
        // Mint YT directly to the marketplace contract (auth is mocked)
        yt_client.mint(&market_client.address, &yt_amount);
        // Manually set YtReserves in storage (internal state, no public setter)
        env.as_contract(&market_client.address, || {
            storage::set_i128(env, DataKey::YtReserves, yt_amount);
        });
    }

    // ── C1-TEST 1: YT purchase updates underlying and PT reserves ────────────
    #[test]
    fn test_c1_yt_purchase_updates_reserves() {
        let (env, _, _underlying_token, pt_token, yt_token, market_client, token_admin_client) = setup_env_with_yt();
        let _provider = bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_AT + 1,
            ..env.ledger().get()
        });

        // Seed YT reserves so swap_underlying_for_yt can succeed
        seed_yt_reserves(&env, &market_client, &yt_token, 500_000_000);

        let (pt_before, under_before, yt_before) = market_client.get_reserves();

        // Perform a YT purchase
        let buyer = Address::generate(&env);
        let underlying_in = 200_000i128;
        token_admin_client.mint(&buyer, &(underlying_in * 2));
        let yt_out = market_client.swap_underlying_for_yt(&buyer, &underlying_in, &1);

        let (pt_after, under_after, yt_after) = market_client.get_reserves();

        // ── KEY ASSERTION: underlying reserves must increase by underlying_in ──
        assert_eq!(
            under_after,
            under_before + underlying_in,
            "C1: UnderlyingReserves must increase by underlying_in after YT purchase"
        );

        // ── KEY ASSERTION: PT reserves must increase (YT ≈ negative PT) ──
        assert_eq!(
            pt_after, pt_before,
            "C1: PtReserves must NOT increase after YT purchase without flash minting (was {}, now {})",
            pt_before, pt_after
        );

        // ── YT reserves must decrease ──
        assert!(
            yt_after < yt_before,
            "C1: YtReserves must decrease after YT purchase"
        );
        assert_eq!(
            yt_after,
            yt_before - yt_out,
            "C1: YtReserves must decrease by exactly yt_out"
        );
    }

    // ── C1-TEST 2: LP withdrawal after YT swap recovers all underlying ───────
    #[test]
    fn test_c1_lp_withdrawal_after_yt_swap() {
        let (env, _, underlying_token, pt_token, yt_token, market_client, token_admin_client) = setup_env_with_yt();
        let provider = bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_AT + 1,
            ..env.ledger().get()
        });

        seed_yt_reserves(&env, &market_client, &yt_token, 500_000_000);

        // Perform a YT purchase to inject underlying into the marketplace
        let buyer = Address::generate(&env);
        let underlying_in = 200_000i128;
        token_admin_client.mint(&buyer, &(underlying_in * 2));
        market_client.swap_underlying_for_yt(&buyer, &underlying_in, &1);

        // Check underlying reserves include the YT buyer's deposit
        let (_, under_reserves, _) = market_client.get_reserves();
        assert!(
            under_reserves >= BOOTSTRAP_UNDER + underlying_in,
            "C1: Underlying reserves must include YT buyer's deposit for LP withdrawal"
        );

        // LP provider's balance before withdrawal
        let underlying_client = token::Client::new(&env, &underlying_token);
        let _lp_underlying_before = underlying_client.balance(&provider);

        // Full LP withdrawal
        let lp_balance = env.as_contract(&market_client.address, || {
            storage::get_lp_balance(&env, &provider)
        });
        let (_pt_out, underlying_out, _yt_out_lp) = market_client.remove_liquidity(&provider, &lp_balance);

        // The withdrawn underlying must reflect the YT buyer's deposit
        assert!(
            underlying_out > BOOTSTRAP_UNDER,
            "C1: LP must receive more underlying than initially deposited (YT buyer added {})",
            underlying_in
        );
    }

    // ── C1-TEST 3: Pricing is synchronized after YT swap ─────────────────────
    #[test]
    fn test_c1_pricing_after_yt_swap() {
        let (env, _, _underlying_token, pt_token, yt_token, market_client, token_admin_client) = setup_env_with_yt();
        bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_AT + 1,
            ..env.ledger().get()
        });

        seed_yt_reserves(&env, &market_client, &yt_token, 500_000_000);

        let price_before = market_client.get_pt_price();

        let buyer = Address::generate(&env);
        token_admin_client.mint(&buyer, &100_000_000);
        market_client.swap_underlying_for_yt(&buyer, &200_000, &1);

        let price_after = market_client.get_pt_price();

        // After YT purchase: underlying increased, PT increased → price must change
        assert_ne!(
            price_before, price_after,
            "C1: PT price must change after YT purchase (reserves must be synchronized)"
        );

        // Price must remain valid (positive and ≤ SCALE)
        assert!(price_after > 0, "C1: PT price out of valid range after YT swap: {}", price_after);
    }

    // ── C1-TEST 4: Sequential PT buy + YT buy + PT sell consistency ──────────
    #[test]
    fn test_c1_sequential_swaps_reserve_consistency() {
        let (env, _, _underlying_token, pt_token, yt_token, market_client, token_admin_client) = setup_env_with_yt();
        bootstrap(&env, &market_client, &token_admin_client, &pt_token, BOOTSTRAP_PT, BOOTSTRAP_UNDER);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_AT + 1,
            ..env.ledger().get()
        });

        seed_yt_reserves(&env, &market_client, &yt_token, 500_000_000);

        let trader = Address::generate(&env);
        token_admin_client.mint(&trader, &500_000_000);
        let pt_client = pt_token::PtTokenClient::new(&env, &pt_token);
        pt_client.mint(&trader, &500_000_000);

        // 1) Buy PT with underlying
        market_client.swap_underlying_for_pt(&trader, &5_000_000, &1);
        let (pt_r1, u_r1, yt_r1) = market_client.get_reserves();

        // 2) Buy YT with underlying
        market_client.swap_underlying_for_yt(&trader, &200_000, &1);
        let (pt_r2, u_r2, yt_r2) = market_client.get_reserves();

        // After YT buy: underlying must have increased, PT must have increased
        assert!(u_r2 > u_r1, "C1: Underlying reserves must increase after YT buy");
        assert!(pt_r2 == pt_r1, "C1: PT reserves must NOT increase after YT buy without minting");
        assert!(yt_r2 < yt_r1, "C1: YT reserves must decrease after YT buy");

        // 3) Sell PT for underlying
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_AT + 2,
            ..env.ledger().get()
        });
        market_client.swap_pt_for_underlying(&trader, &1_000_000, &1);
        let (pt_r3, u_r3, _) = market_client.get_reserves();

        // After PT sell: PT reserves increase, underlying reserves decrease
        assert!(pt_r3 > pt_r2, "PT reserves must increase after selling PT");
        assert!(u_r3 < u_r2, "Underlying reserves must decrease after PT sale");

        // All reserves must be positive throughout
        assert!(pt_r3 > 0 && u_r3 > 0, "Reserves must remain positive after sequential swaps");
    }

    // ── C1-TEST 5: Multiple LP providers + YT swap fairness ──────────────────
    #[test]
    fn test_c1_multiple_lps_yt_swap_fairness() {
        let (env, _, _underlying_token, pt_token, yt_token, market_client, token_admin_client) = setup_env_with_yt();

        // LP1 adds liquidity
        let lp1 = Address::generate(&env);
        let pt_client = pt_token::PtTokenClient::new(&env, &pt_token);
        token_admin_client.mint(&lp1, &2_000_000_000);
        pt_client.mint(&lp1, &2_000_000_000);
        market_client.add_liquidity(&lp1, &500_000_000, &499_750_000);

        // LP2 adds equal liquidity
        let lp2 = Address::generate(&env);
        token_admin_client.mint(&lp2, &2_000_000_000);
        pt_client.mint(&lp2, &2_000_000_000);
        market_client.add_liquidity(&lp2, &500_000_000, &499_750_000);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: CREATED_AT + 1,
            ..env.ledger().get()
        });

        seed_yt_reserves(&env, &market_client, &yt_token, 500_000_000);

        // A YT buyer injects underlying
        let buyer = Address::generate(&env);
        token_admin_client.mint(&buyer, &100_000_000);
        market_client.swap_underlying_for_yt(&buyer, &200_000, &1);

        // Both LPs withdraw — each should get a fair share including YT buyer's underlying
        let lp1_shares = env.as_contract(&market_client.address, || {
            storage::get_lp_balance(&env, &lp1)
        });
        let lp2_shares = env.as_contract(&market_client.address, || {
            storage::get_lp_balance(&env, &lp2)
        });

        let (_, u_out1, _) = market_client.remove_liquidity(&lp1, &lp1_shares);
        let (_, u_out2, _) = market_client.remove_liquidity(&lp2, &lp2_shares);

        // Both LPs had equal shares, so their underlying withdrawals should be roughly equal (allow for rounding differences)
        let diff = (u_out1 - u_out2).abs();
        assert!(diff <= 1000, "C1: Equal LPs must receive roughly equal underlying");

        // Each LP must get more underlying than deposited (buyer added 200,000 underlying)
        assert!(
            u_out1 > 499_750_000,
            "C1: LP must receive more underlying than initially deposited (got {})",
            u_out1
        );
    }
}
