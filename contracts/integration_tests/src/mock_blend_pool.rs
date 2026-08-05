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
use sy_wrapper::{Positions, Request};

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
        env.storage().instance().set(&PoolDataKey::Underlying, &underlying);
    }

    pub fn submit(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: soroban_sdk::Vec<Request>,
    ) -> Positions {
        let underlying: Address = env.storage().instance().get(&PoolDataKey::Underlying).unwrap();
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
                let amt = if req.amount > supply { supply } else { req.amount };
                token_client.transfer(&this, &to, &amt);
                supply -= amt;
            }
        }

        env.storage().instance().set(&PoolDataKey::Supply(from), &supply);
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
        env.storage().instance().set(&PoolDataKey::Supply(depositor), &supply);
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
