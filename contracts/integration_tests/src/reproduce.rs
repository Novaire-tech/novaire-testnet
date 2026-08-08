//! Reproduction harness for Soroban VM budget failures.
//!
//! Run with:
//!   cargo test -p integration_tests reproduce_budget -- --nocapture
//!
//! Each test here drives one protocol flow repeatedly against growing
//! protocol state, dumping the resource budget every N iterations so a
//! sudden jump (the "first budget spike") is visible in the log, and
//! writing a full failure bundle to artifacts/debug/ the moment any
//! iteration panics (HostError / BudgetExceeded / Memory(OutOfBoundsGrowth)
//! / ContractError all surface as a Rust panic under soroban-sdk testutils).
//!
//! IMPORTANT: as of this writing, no failing iteration has been observed
//! in these harnesses. That does not mean no such failure exists in
//! production — only that these specific flows, at this scale, have not
//! reproduced it locally. See DEBUGGING.md for how to point this harness
//! at a real failing transaction once one is captured.

#![cfg(test)]

use crate::budget_debug::{dump_budget, run_and_capture};
use crate::framework::Protocol;

/// Repeatedly call `mint_pt_yt` against an ever-larger set of positions and
/// users, dumping the budget every `DUMP_EVERY` calls. This is the flow
/// named in the original hypothesis (mint_pt_yt -> ... -> yt_token::mint),
/// which Explore-agent tracing already showed calls compute_surplus_raw
/// exactly once per mint. This harness exists to catch a REAL spike if one
/// exists elsewhere in that path (e.g. growth in vault/marketplace state
/// that mint_pt_yt reads), not to re-litigate the disproven hypothesis.
#[test]
fn reproduce_budget_mint_pt_yt() {
    const ITERATIONS: usize = 500;
    const DUMP_EVERY: usize = 50;

    let p = Protocol::new();
    let lp = p.create_user();
    p.bootstrap_marketplace(&lp);
    p.advance_ledger(1);

    let mut users = vec![];
    for _ in 0..ITERATIONS {
        let u = p.create_user();
        p.mint_mock_usdc(&u, 1_000_000_000);
        users.push(u);
    }

    for (i, user) in users.iter().enumerate() {
        p.advance_ledger(1);
        let shares = p.deposit(user, 10_000);

        let ctx = format!(
            "iteration={i} user={user:?} sy_shares={shares} ledger={}",
            p.current_ledger()
        );
        let env = &p.env;
        let p_ref = &p;
        run_and_capture(env, "mint_pt_yt", &ctx, || p_ref.mint_pt_yt(user, shares));

        if i % DUMP_EVERY == 0 {
            dump_budget(&p.env, &format!("mint_pt_yt iteration {i}"));
        }
    }

    dump_budget(&p.env, "mint_pt_yt final");
}

/// Same idea for the full lifecycle (deposit -> mint -> claim -> settle ->
/// redeem), which is the shape most likely to accumulate cross-contract
/// calls and storage growth over many epochs.
#[test]
fn reproduce_budget_full_lifecycle() {
    const EPOCHS: usize = 20;
    const POSITIONS_PER_EPOCH: usize = 20;

    let p = Protocol::new();
    let lp = p.create_user();
    p.bootstrap_marketplace(&lp);
    p.advance_ledger(1);

    for epoch in 0..EPOCHS {
        for pos in 0..POSITIONS_PER_EPOCH {
            let user = p.create_user();
            p.mint_mock_usdc(&user, 1_000_000_000);
            let shares = p.deposit(&user, 10_000);

            let ctx = format!("epoch={epoch} position={pos} sy_shares={shares}");
            let env = &p.env;
            let p_ref = &p;
            run_and_capture(env, "lifecycle_mint", &ctx, || {
                p_ref.mint_pt_yt(&user, shares)
            });

            run_and_capture(env, "lifecycle_claim", &ctx, || p_ref.claim_yield(&user));
        }

        p.advance_ledger(200);
        let ctx = format!("epoch={epoch} settle_epoch");
        run_and_capture(&p.env, "settle_epoch", &ctx, || p.settle_epoch());

        dump_budget(&p.env, &format!("epoch {epoch} settled"));
    }
}
