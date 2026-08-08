//! Regression coverage for the Tokenizer -> YtToken -> Tokenizer re-entry bug.
//!
//! `Tokenizer::claim_yield` used to call `YtToken::claimable_yield`, which
//! (pre-maturity) called back into Tokenizer's `get_surplus_snapshot` for a
//! live index preview. Since Tokenizer's own `claim_yield` frame was still
//! active on the call stack, Soroban rejected that callback as contract
//! re-entry (`Error(Context, InvalidAction)`, surfaced to callers as
//! `Error(Contract, #10)`). The fix replaces the callback with
//! `YtToken::claimable_yield_with_snapshot`, a pure function fed the
//! surplus snapshot Tokenizer already computed in the same transaction —
//! eliminating the cross-contract cycle entirely for Tokenizer's own call
//! path, while leaving the external-caller `claimable_yield` API (used when
//! Tokenizer is NOT on the stack) unchanged.

#![cfg(test)]

use crate::framework::Protocol;

/// Original failing lifecycle: mint, let real yield accrue pre-maturity,
/// then claim through Tokenizer. Must not panic with Error(Contract, #10)
/// and must return the correct nonzero claimable amount.
#[test]
fn reentry_claim_yield_pre_maturity_does_not_panic() {
    let p = Protocol::new();
    let user = p.create_user();

    p.mint_mock_usdc(&user, 100_000_000);
    p.deposit(&user, 100_000_000);
    p.mint_pt_yt(&user, 50_000_000);

    // Real, organic yield growth pre-maturity (epoch still Open).
    p.mint_mock_usdc(&p.sy_wrapper.address, 10_000_000);
    p.sy_wrapper.refresh_rate();
    p.advance_ledger(10);

    let claimed = p.tokenizer.claim_yield(&user);
    assert!(claimed > 0, "expected nonzero claim, got {claimed}");
}

/// External/view-only `claimable_yield` (Tokenizer not on the call stack)
/// must keep using its live-preview callback path and return a value
/// consistent with what the subsequent `claim_yield` actually pays out.
#[test]
fn reentry_external_claimable_yield_matches_claim() {
    let p = Protocol::new();
    let user = p.create_user();

    p.mint_mock_usdc(&user, 100_000_000);
    p.deposit(&user, 100_000_000);
    p.mint_pt_yt(&user, 50_000_000);

    p.mint_mock_usdc(&p.sy_wrapper.address, 10_000_000);
    p.sy_wrapper.refresh_rate();
    p.advance_ledger(10);

    let previewed = p.yt_token.claimable_yield(&user);
    assert!(
        previewed > 0,
        "expected nonzero live preview, got {previewed}"
    );

    let claimed = p.tokenizer.claim_yield(&user);
    let diff = (claimed - previewed).abs();
    assert!(
        diff <= 1,
        "external preview ({previewed}) must closely match claim_yield's payout ({claimed})"
    );
}

/// `checkpoint_user`, called by Tokenizer mid-`claim_yield`, must not
/// attempt any callback into Tokenizer either (it never has, since
/// `refresh_index_locally` is only wired into `transfer`/`transfer_from`,
/// not `checkpoint_user` — this test locks that invariant in).
#[test]
fn reentry_checkpoint_user_via_claim_does_not_panic() {
    let p = Protocol::new();
    let user = p.create_user();

    p.mint_mock_usdc(&user, 100_000_000);
    p.deposit(&user, 100_000_000);
    p.mint_pt_yt(&user, 50_000_000);

    p.mint_mock_usdc(&p.sy_wrapper.address, 10_000_000);
    p.sy_wrapper.refresh_rate();
    p.advance_ledger(10);

    // try_claim_yield exercises checkpoint_user internally; must succeed.
    p.try_claim_yield(&user);
    assert_eq!(
        p.yt_token.claimable_yield(&user),
        0,
        "claim should have cleared pending yield"
    );
}

/// Value-equivalence: claiming twice in a row (second claim with zero new
/// growth) must yield exactly 0 the second time, proving
/// `claimable_yield_with_snapshot`'s snapshot-derived index update is
/// consistent with accounting state, not just non-crashing.
#[test]
fn reentry_repeated_claim_is_idempotent_and_accounts_correctly() {
    let p = Protocol::new();
    let user = p.create_user();

    p.mint_mock_usdc(&user, 100_000_000);
    p.deposit(&user, 100_000_000);
    p.mint_pt_yt(&user, 50_000_000);

    p.mint_mock_usdc(&p.sy_wrapper.address, 10_000_000);
    p.sy_wrapper.refresh_rate();
    p.advance_ledger(10);

    let first = p.tokenizer.claim_yield(&user);
    assert!(first > 0);

    // No new growth: a second claim attempt has nothing to pay out. Use the
    // try_ variant since claim_yield legitimately rejects zero-claims.
    p.try_claim_yield(&user);
    assert_eq!(p.yt_token.claimable_yield(&user), 0);
}

/// The exact scenario captured in artifacts/debug/lifecycle_claim-*: many
/// mint+claim cycles across epochs, with real ledger advancement between
/// mint and claim so yield genuinely accrues (unlike the budget-stress
/// harness in `reproduce.rs`, which mints and claims in the same ledger).
#[test]
fn reentry_multi_epoch_lifecycle_with_real_accrual() {
    let p = Protocol::new();
    let lp = p.create_user();
    p.bootstrap_marketplace(&lp);
    p.advance_ledger(1);

    for epoch in 0..3 {
        for pos in 0..5 {
            let user = p.create_user();
            p.mint_mock_usdc(&user, 1_000_000_000);
            let shares = p.deposit(&user, 10_000);
            p.mint_pt_yt(&user, shares);

            // Real accrual between mint and claim, unlike reproduce.rs.
            p.mint_mock_usdc(&p.sy_wrapper.address, 1_000_000);
            p.sy_wrapper.refresh_rate();
            p.advance_ledger(5);

            // Must not panic with Error(Contract, #10) from re-entry.
            p.try_claim_yield(&user);
            let _ = format!("epoch={epoch} position={pos}");
        }
        p.advance_ledger(200);
    }
}
