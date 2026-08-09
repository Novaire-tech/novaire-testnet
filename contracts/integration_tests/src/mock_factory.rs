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
//!
//! Core rollover refactor: `execute_rollover` now also resolves the current epoch's
//! Tokenizer and the next epoch's IntentEngine from Factory rather than from rollover's
//! own long-lived storage, so this mock's `EpochRecord` must carry those addresses too.
#![cfg(test)]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
#[derive(Clone)]
enum MockFactoryKey {
    PtToken,
    Tokenizer,
    IntentEngine,
    MaturityLedger,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RolloverEpochView {
    pub epoch_id: u32,
    pub maturity_ledger: u32,
    pub pt_token: Address,
    pub tokenizer: Address,
    pub intent_engine: Address,
}

#[contract]
pub struct MockFactory;

#[contractimpl]
impl MockFactory {
    pub fn init(
        env: Env,
        pt_token: Address,
        tokenizer: Address,
        intent_engine: Address,
        maturity_ledger: u32,
    ) {
        env.storage()
            .instance()
            .set(&MockFactoryKey::PtToken, &pt_token);
        env.storage()
            .instance()
            .set(&MockFactoryKey::Tokenizer, &tokenizer);
        env.storage()
            .instance()
            .set(&MockFactoryKey::IntentEngine, &intent_engine);
        env.storage()
            .instance()
            .set(&MockFactoryKey::MaturityLedger, &maturity_ledger);
    }

    fn record(env: &Env) -> RolloverEpochView {
        let pt_token: Address = env
            .storage()
            .instance()
            .get(&MockFactoryKey::PtToken)
            .unwrap();
        let tokenizer: Address = env
            .storage()
            .instance()
            .get(&MockFactoryKey::Tokenizer)
            .unwrap();
        let intent_engine: Address = env
            .storage()
            .instance()
            .get(&MockFactoryKey::IntentEngine)
            .unwrap();
        let maturity_ledger: u32 = env
            .storage()
            .instance()
            .get(&MockFactoryKey::MaturityLedger)
            .unwrap();
        RolloverEpochView {
            epoch_id: 1,
            maturity_ledger,
            pt_token,
            tokenizer,
            intent_engine,
        }
    }

    pub fn latest_epoch_view(env: Env) -> RolloverEpochView {
        Self::record(&env)
    }

    pub fn epoch_view_by_maturity(env: Env, _maturity_ledger: u32) -> RolloverEpochView {
        Self::record(&env)
    }

    pub fn next_epoch_view(env: Env, _current_epoch_id: u32) -> RolloverEpochView {
        Self::record(&env)
    }
}
