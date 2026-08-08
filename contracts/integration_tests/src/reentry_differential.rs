//! Randomized differential proof that `YtToken::claimable_yield_with_snapshot`
//! (the re-entry-safe replacement used by `Tokenizer::claim_yield`) computes
//! the mathematically identical result to `YtToken::claimable_yield` (the
//! original live-callback implementation, still present and used by external/
//! view callers) for every protocol state actually reachable by
//! `claim_yield`.
//!
//! Methodology: for each randomized trajectory, after
//! `Tokenizer::refresh_yield_index` has run (exactly as `claim_yield` always
//! does before touching YtToken), `LastRecordedSurplus == current surplus`.
//! At that instant:
//!   - `result_old` = a genuine call to the real, unmodified
//!     `YtToken::claimable_yield`, which performs the live cross-contract
//!     callback into `Tokenizer::get_surplus_snapshot` (legal here because
//!     the call originates from the test harness, not from inside
//!     Tokenizer's own frame).
//!   - `result_new` = a genuine call to `YtToken::claimable_yield_with_snapshot`,
//!     fed the snapshot read via the same `get_surplus_snapshot()` (also a
//!     plain external call here).
//! Both are real invocations of real, currently-compiled contract code — not
//! a hand-reimplemented model of either.

use crate::framework::Protocol;
use proptest::prelude::*;

#[derive(Clone, Debug)]
struct DiffCase {
    num_users: usize,
    deposit_amounts: Vec<i128>,
    mint_fractions: Vec<u32>, // percent of deposited SY to mint as PT/YT, 0..=100
    yield_injections: Vec<i128>,
    ledger_advances: Vec<u32>,
    claim_before_final_injection: bool,
    settle_before_claim: bool,
}

fn run_case(case: &DiffCase) -> Result<(), String> {
    let mut p = Protocol::new();
    // 10,000-case run: disable the (slow, disk-heavy) per-Env test-snapshot
    // dump — this test's assertions are the source of truth, not snapshots.
    p.env.set_config(soroban_sdk::testutils::EnvTestConfig {
        capture_snapshot_at_drop: false,
    });

    let n = case.num_users.max(1).min(6);
    let mut users = vec![];
    for i in 0..n {
        let u = p.create_user();
        let deposit = case
            .deposit_amounts
            .get(i)
            .copied()
            .unwrap_or(1_000_000)
            .abs()
            .max(1)
            % 500_000_000
            + 1_000;
        p.mint_mock_usdc(&u, deposit + 1_000);
        let shares = p.deposit(&u, deposit);

        let frac = (*case.mint_fractions.get(i).unwrap_or(&50)).min(100) as i128;
        let mint_amount = (shares * frac / 100).max(1);
        p.try_mint_pt_yt(&u, mint_amount);
        users.push(u);
    }

    // Randomized organic yield growth + ledger advancement, interleaved.
    for (i, inj) in case.yield_injections.iter().enumerate() {
        let amt = inj.abs() % 50_000_000;
        if amt > 0 {
            p.mint_mock_usdc(&p.sy_wrapper.address, amt);
            let _ = p.sy_wrapper.try_refresh_rate();
        }
        let adv = case.ledger_advances.get(i).copied().unwrap_or(1) % 50;
        if adv > 0 {
            p.advance_ledger(adv);
        }
    }

    if case.settle_before_claim {
        p.set_ledger(p.maturity_ledger + 50); // force past maturity, without over-advancing (avoids test-sandbox TTL archival)
        let _ = p.tokenizer.try_settle_epoch();
    } else if case.claim_before_final_injection {
        p.advance_ledger(1);
    }

    let mut mismatches = vec![];

    for user in &users {
        // Mirror exactly what claim_yield does before touching YtToken's
        // claim math, for every user, one at a time (checkpoint_user has no
        // callback so it's irrelevant to this comparison — see
        // reentry_regression.rs).
        let _ = p.tokenizer.try_refresh_yield_index();

        let result_old = p.yt_token.claimable_yield(user);

        let (current, _last) = p.tokenizer.get_surplus_snapshot();
        let result_new = p
            .yt_token
            .claimable_yield_with_snapshot(user, &current, &current);

        if result_old != result_new {
            mismatches.push(format!(
                "user={user:?} result_old={result_old} result_new={result_new} \
                 current_surplus_raw={current} stored_yield_index={} \
                 total_supply={} balance={} epoch_state={}",
                p.yt_token.get_yield_index(),
                p.yt_token.total_supply(),
                p.yt_token.balance(user),
                p.tokenizer.get_epoch_state(),
            ));
        }
    }

    if mismatches.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "MISMATCH(ES) FOUND\ncase={case:#?}\n\n{}",
            mismatches.join("\n")
        ))
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(10_000))]
    #[test]
    fn claimable_yield_with_snapshot_matches_original_callback_for_10000_random_states(
        num_users in 1usize..6,
        deposit_amounts in prop::collection::vec(1i128..500_000_000, 6),
        mint_fractions in prop::collection::vec(0u32..=100, 6),
        yield_injections in prop::collection::vec(0i128..50_000_000, 0..8),
        ledger_advances in prop::collection::vec(0u32..50, 0..8),
        claim_before_final_injection in any::<bool>(),
        settle_before_claim in any::<bool>(),
    ) {
        let case = DiffCase {
            num_users,
            deposit_amounts,
            mint_fractions,
            yield_injections,
            ledger_advances,
            claim_before_final_injection,
            settle_before_claim,
        };
        if let Err(msg) = run_case(&case) {
            prop_assert!(false, "{}", msg);
        }
    }
}
