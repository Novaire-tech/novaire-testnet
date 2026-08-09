//! Minimal stand-in for the real `factory` contract's `FactoryInterface` surface
//! (`latest_epoch` / `get_epoch_by_maturity` / `get_next_epoch`), used only to wire
//! `rollover::AutonomousRollover::initialize`'s `factory` parameter to something that
//! actually answers those calls in the shared integration-test framework.
//!
//! H-2 fix: `rollover::register_rollover` now resolves each position's own PT
//! contract via `Factory::get_epoch_by_maturity` instead of trusting a single mutable
//! global `DataKey::PtToken` slot (see `rollover/src/lib.rs`). This framework
//! previously passed the bare `admin` address as `factory` (fine when nothing ever
//! called into it); now that `register_rollover` genuinely calls it, it needs a real
//! (if minimal) contract behind that address. This framework only ever has a single
//! PT token / maturity in play, so every method just echoes that one epoch back.
#![cfg(test)]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
#[derive(Clone)]
enum MockFactoryKey {
    PtToken,
    MaturityLedger,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EpochRecord {
    pub epoch_id: u32,
    pub maturity_ledger: u32,
    pub created_ledger: u32,
    pub pt_token: Address,
}

#[contract]
pub struct MockFactory;

#[contractimpl]
impl MockFactory {
    pub fn init(env: Env, pt_token: Address, maturity_ledger: u32) {
        env.storage()
            .instance()
            .set(&MockFactoryKey::PtToken, &pt_token);
        env.storage()
            .instance()
            .set(&MockFactoryKey::MaturityLedger, &maturity_ledger);
    }

    fn record(env: &Env) -> EpochRecord {
        let pt_token: Address = env
            .storage()
            .instance()
            .get(&MockFactoryKey::PtToken)
            .unwrap();
        let maturity_ledger: u32 = env
            .storage()
            .instance()
            .get(&MockFactoryKey::MaturityLedger)
            .unwrap();
        EpochRecord {
            epoch_id: 1,
            maturity_ledger,
            created_ledger: 0,
            pt_token,
        }
    }

    pub fn latest_epoch(env: Env) -> EpochRecord {
        Self::record(&env)
    }

    pub fn get_epoch_by_maturity(env: Env, _maturity_ledger: u32) -> EpochRecord {
        Self::record(&env)
    }

    pub fn get_next_epoch(env: Env, _current_epoch_id: u32) -> EpochRecord {
        Self::record(&env)
    }
}
