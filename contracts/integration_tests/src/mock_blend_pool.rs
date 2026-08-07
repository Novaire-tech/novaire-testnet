//! Minimal stand-in for the real Blend Capital Pool contract, mirroring the
//! `MockBlendPool` used in `sy_wrapper`'s own unit tests (see
//! `sy_wrapper/src/audit_tests.rs`). It implements just enough of the
//! `submit` / `get_positions` surface (see `sy_wrapper::{BlendPool, Request, Positions}`)
//! to exercise sy_wrapper's Blend integration inside the shared integration-test
//! framework: a single-asset, non-collateralized Supply/Withdraw ledger keyed by the
//! calling contract's address, with a test-only `simulate_yield` hook to model interest
//! accruing on a supplied position (as real Blend interest accrual would, via a rising
//! b_rate).
#![cfg(test)]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Map};
use sy_wrapper::{Positions, Request, Reserve, ReserveConfig, ReserveData, BLEND_RATE_SCALAR};

#[contracttype]
#[derive(Clone)]
enum PoolDataKey {
    Underlying,
    Supply(Address),
}

#[contract]
pub struct MockBlendPool;

#[contractimpl]
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
                // Supply: pull underlying from `spender` (who must have approved this pool)
                // into the pool, and credit `from`'s tracked supply.
                token_client.transfer_from(&this, &spender, &this, &req.amount);
                supply += req.amount;
            } else if req.request_type == 1 {
                // Withdraw: pay `to` out of the pool's own balance, debiting `from`'s supply.
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

    /// Identity `b_rate` (1 bToken == 1 underlying): this mock tracks `supply` directly
    /// in underlying units (see `submit` above), so `pool_supplied_value`'s
    /// bToken * b_rate / BLEND_RATE_SCALAR conversion must be a no-op to keep this mock's
    /// existing 1:1 test behavior unchanged.
    pub fn get_reserve(env: Env, asset: Address) -> Reserve {
        Reserve {
            asset,
            config: ReserveConfig {
                index: 0,
                decimals: 7,
                c_factor: 0,
                l_factor: 0,
                util: 0,
                max_util: 0,
                r_base: 0,
                r_one: 0,
                r_two: 0,
                r_three: 0,
                reactivity: 0,
                supply_cap: 0,
                enabled: true,
            },
            data: ReserveData {
                d_rate: BLEND_RATE_SCALAR,
                b_rate: BLEND_RATE_SCALAR,
                ir_mod: 0,
                b_supply: 0,
                d_supply: 0,
                backstop_credit: 0,
                last_time: env.ledger().timestamp(),
            },
            scalar: 10_000_000,
        }
    }

    /// Test-only: simulates interest accruing on `depositor`'s supplied position by
    /// crediting `extra` underlying units directly to their tracked supply. The caller is
    /// responsible for also minting the matching underlying into the pool's own balance
    /// (mirroring real Blend, where accrued interest is backed by borrower repayments)
    /// so a subsequent Withdraw can actually be paid out.
    pub fn simulate_yield(env: Env, depositor: Address, extra: i128) {
        let mut supply: i128 = env
            .storage()
            .instance()
            .get(&PoolDataKey::Supply(depositor.clone()))
            .unwrap_or(0);
        supply += extra;
        env.storage()
            .instance()
            .set(&PoolDataKey::Supply(depositor), &supply);
    }

    fn positions_for(env: &Env, supply: i128) -> Positions {
        let mut supply_map = Map::new(env);
        if supply > 0 {
            // Reserve index is arbitrary here - sy_wrapper sums every entry rather than
            // looking up a specific key (see the `Positions` doc comment in sy_wrapper).
            supply_map.set(1u32, supply);
        }
        Positions {
            collateral: Map::new(env),
            liabilities: Map::new(env),
            supply: supply_map,
        }
    }
}
