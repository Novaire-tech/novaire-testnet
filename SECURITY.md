# Security Policy

Novaire is a yield-tokenization protocol built on Soroban (Stellar smart contracts): users deposit an underlying asset, which is lent into an external yield source and split into Principal Tokens (PT) and Yield Tokens (YT), tradable on a purpose-built AMM until epoch maturity. This document describes our security model, trust assumptions, known risks, and how to report vulnerabilities.

This protocol is currently deployed on **testnet only**. Treat all funds and deployments as experimental.

---

## Security Philosophy

- **Fail safe over fail permissive.** Arithmetic uses `checked_*` operations throughout, and the release build is compiled with `overflow-checks = true`, so an unexpected overflow aborts the transaction rather than silently corrupting state.
- **Invariants over trust.** Every state-mutating function in the AMM, tokenizer, rollover, and maturity engine runs an explicit post-condition (`assert_invariant`) before returning, checking solvency and custody consistency rather than assuming the preceding logic was correct.
- **Minimal privilege for cross-contract calls.** Where one contract must move funds through another on a user's behalf (e.g. `intent_engine`, `rollover`), authorization is granted narrowly via `authorize_as_current_contract` scoped to a single `(contract, function, args)` triple with no further sub-delegation.
- **Liveness over convenience.** Users can always exit a position they own — `remove_liquidity` and `exit_rollover` remain callable even while the protocol is paused, so an admin pause can never lock user funds in place.
- **Single source of truth for time.** Epoch/maturity state lives in exactly one place (`maturity_engine`) and every other contract queries it rather than maintaining a local copy — eliminating an entire class of off-by-one/inconsistency bugs between contracts.

---

## Threat Model Summary

**In scope / defended against:**
- Unauthorized fund movement (every fund-moving call requires `require_auth()` from the fund owner).
- Integer overflow/underflow (checked arithmetic + overflow-checked release builds).
- First-depositor share-inflation attacks on the AMM and the yield-source wrapper (permanently locked minimum liquidity on first deposit).
- TWAP/flash-loan price manipulation within a single transaction (pre-trade price recorded before reserve mutation; dedicated regression tests).
- Storage archival/rent expiry for user-facing balance data (persistent storage TTL extended on every access, in all contracts).

**Explicitly out of scope / accepted trust:**
- **The external yield source (Blend Capital pool).** `sy_wrapper` fully trusts the pool's reported position value as the basis for the protocol's exchange rate, bounded only by a 10%-per-call rate-increase ratchet. A compromised or buggy pool is a systemic risk to the whole protocol. See "Known Risks" below.
- **The protocol admin key(s).** Admin functions (pause, epoch management, fee/config changes, and in two token contracts, mint/burn-authority reassignment) are single-key-gated with no on-chain multisig or timelock today. See "Trust Assumptions."
- **Off-chain infrastructure** (RPC providers, frontends, keeper bots) is not covered by this policy; report issues with those to their respective operators.

---

## Trust Assumptions

| Actor | Trusted for | Not trusted for |
|---|---|---|
| Protocol admin | Pausing, opening/archiving epochs, config/fee parameters, deploying new epochs via `factory` | Moving user funds directly — no admin function transfers user-owned token balances |
| Keeper (rollover) | Triggering `execute_rollover` on a user's behalf during a grace period | Nothing beyond triggering the pre-authorized flow; funds always land in the registering user's own next-epoch position |
| External yield source (Blend Capital) | Reporting accurate position/supply values | Fully solvent, un-hacked, honest reporting is *assumed*, not verified on-chain beyond a rate-of-change limiter |
| Any user | Only their own funds, gated by `require_auth()` | Anyone else's balances or positions |

---

## Access Control

Every fund-moving entry point in every contract was verified to require `require_auth()` from the relevant party (depositor, withdrawer, redeemer, or admin as appropriate). Notable patterns:

- **Two-step admin transfer** (`transfer_admin` / `accept_admin`) is used in `vault`, `sy_wrapper`, `pt_token`, and `yt_token` to prevent an admin from bricking a contract by transferring to an unreachable address.
- **Single-step authority reassignment** exists for `set_tokenizer` (pt_token, yt_token) and `set_sy_wrapper` (yt_token) — these take effect immediately on one admin signature and represent a real centralization risk if the admin key is compromised. Tracked as a remediation item below.
- **Intentionally permissionless functions** exist by design, always because the operation is either bounded/self-limiting or purely a "crank" that reads real on-chain state: `settle_epoch` (maturity_engine, tokenizer), `refresh_rate` (sy_wrapper, rate-of-change limited), `refresh_yield_index` (tokenizer, monotonic-only), `claim_amm_yield` (marketplace, can only pull the marketplace's own legitimately-claimable yield), and `execute_rollover` after its keeper grace period expires (a liveness guarantee).

---

## Oracle Security

The protocol has two internal price/rate sources, both on-chain and derived from real reserve state (no external price feed dependency for AMM pricing):

1. **AMM TWAP** (`marketplace`): a 20-ledger weighted EMA of the implied rate. The pre-trade spot price is recorded *before* reserve state is mutated by the same transaction, closing a same-block manipulation window (verified by a dedicated regression test). A staleness-checked accessor (`get_twap_rate_checked`, 200-ledger max age) exists but is not yet wired into every consumer — see Known Risks.
2. **SY exchange rate** (`sy_wrapper`): derived from the external yield source's reported position value plus idle balance, monotonic (never decreases), and rate-limited to a maximum 10% increase per call to bound the damage from any single bad report.

---

## Economic Security

- **First-depositor / share-inflation attack:** mitigated in both `marketplace` (LP shares) and `sy_wrapper` (SY shares) by permanently locking a minimum share amount to the contract itself on first deposit, following the standard "dead shares" pattern.
- **Solvency invariants:** `tokenizer` asserts that outstanding PT always equals outstanding YT while an epoch is open, and that computed surplus is never negative (the protocol is always able to honor outstanding PT principal). `marketplace` asserts AMM reserves are never one-sided and that actual on-chain token balances are always ≥ tracked reserves.
- **Fee model:** a flat 0.3% fee on PT/underlying swaps; YT pricing (derived via bisection against the same curve) uses a flat output-side fee rather than baking it into the curve, specifically to avoid the fee dominating a near-zero genuine spread at epoch bootstrap.
- **Dust floors:** liquidity removal and swaps are blocked from leaving reserves below a minimum threshold on either side, preventing degenerate/manipulable near-empty pool states (except full-withdrawal, which is always allowed).

---

## Storage Security

Soroban contracts pay ongoing "rent" to keep storage entries alive; an unrefreshed entry can archive and become temporarily inaccessible. Our policy:

- All persistent storage holding user balances/positions is TTL-extended on every read and every write, verified across all ten contracts.
- Instance storage (admin, config, global counters) is generally refreshed incidentally by any function that also touches per-call address lookups; this is functionally sufficient today but is a fragile pattern we are consolidating (see roadmap).
- One contract (`sy_wrapper`) currently has no explicit TTL-extension calls at all — the highest-priority storage fix outstanding.

---

## Protocol Invariants

The authoritative, code-referenced invariant list lives in [`docs/PROTOCOL_INVARIANTS.md`](docs/PROTOCOL_INVARIANTS.md). Summary of the invariants enforced in-code via `assert_invariant`-style post-conditions:

- Tokenizer: outstanding PT == outstanding YT while an epoch is Open; computed surplus is never negative.
- Marketplace: reserves are never one-sided; no orphaned reserves without corresponding LP shares; on-chain token balances always ≥ tracked reserves.
- Rollover: the contract's own underlying balance is always exactly zero between operations (never warehouses funds); tracked total PT held always matches actual on-chain PT balance.
- Maturity Engine: epoch creation ledger is always strictly before its maturity ledger; the currently-active epoch ID is always internally consistent.
- Intent Engine: the contract holds zero residual balance of any intermediate token after any operation completes (asserted directly in tests).

---

## Emergency Controls

- **Pause:** `vault`, `sy_wrapper`, `marketplace`, `intent_engine`, and `rollover` each expose admin-gated `pause`/`unpause`. Pausing blocks new deposits/swaps/mints but **never** blocks a user's ability to exit an existing position (`remove_liquidity`, `exit_rollover`, and equivalent withdrawal paths are explicitly pause-exempt by design).
- **Loss marking:** `sy_wrapper.mark_loss` is an admin-gated function that can only ever *decrease* tracked underlying, floor-bound at the measured actual balance — used to formally recognize a loss from the external yield source rather than letting accounting silently drift from reality.
- There is currently no on-chain circuit breaker independent of the admin key (e.g. no automatic pause on anomalous activity) — pausing is a manual admin action today.

---

## Upgrade Strategy

Each epoch's contract set is deployed fresh by `factory.deploy_epoch`, which wires nine contracts together and then cross-validates every contract's self-reported metadata against the deployment parameters before considering the epoch live — this catches misconfigured deployments (wrong address wired to the wrong role) at deploy time rather than at runtime. Epochs link to their successor via `factory.link_epochs` to support `rollover`. There is currently no contract-code upgrade mechanism (e.g. no upgradeable-proxy pattern) observed in the audited contracts — each epoch's contracts are immutable once deployed, and protocol evolution happens by deploying a new epoch's contract set.

---

## Known Risks

1. **External yield-source trust.** The protocol's core exchange rate is fully dependent on the correctness and honesty of an external Blend Capital lending pool contract. This is an inherent risk of any yield-wrapping design and is only partially mitigated (rate-of-change limiter, not a correctness check). Users should understand that PT/YT value ultimately depends on a third-party contract outside this repository. `sy_wrapper`'s `YieldSource` is set once at `initialize` with no rotation function, so the correctness of this trust boundary hinges entirely on the `blend_pool` address passed at deploy time being the genuine, official Blend Capital pool — see "Deployment Verification" below. (SEC-10)
2. **Single-key admin.** Admin authority in every contract is currently a single `Address`, not a multisig or timelock-gated address. A compromised admin key could pause the protocol, reassign mint/burn authority (in `pt_token`/`yt_token`, instantly, with no delay), or misconfigure new epoch deployments.
3. ~~**TWAP staleness not yet enforced protocol-wide.**~~ **Fixed.** `intent_engine` now calls `marketplace`'s staleness-checked `get_twap_rate_checked()` for its slippage gate (previously used the plain, unchecked variant) — see SEC-01 in the audit.
4. ~~**`sy_wrapper` storage TTL is not actively managed.**~~ **Fixed.** Instance storage TTL is now extended on every meaningful call via `storage::get_admin` — see SEC-02 in the audit.

For the complete, code-cited list of findings, see [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md).

### Deployment Verification (required before every deploy)

Because `sy_wrapper`'s `blend_pool` address is set once at `initialize` and cannot be rotated, a wrong or malicious address wired in at deploy time is **not** caught by `factory.deploy_epoch`'s metadata cross-validation (that check confirms the *contracts wired to each other* are self-consistent, not that `blend_pool` is the genuine Blend Capital deployment). Whoever runs `factory.deploy_epoch` MUST, before submitting the transaction:

- [ ] Confirm the `blend_pool` address matches the official Blend Capital pool listed in Blend's own deployment registry/docs for the target network (mainnet vs. testnet), not a value copied from a prior epoch, a fork, or an unverified third-party source.
- [ ] Confirm the underlying asset accepted by that pool matches `params.underlying_token` for this epoch.
- [ ] Record the verified `blend_pool` address (and the source used to verify it) alongside the epoch's deployment record for later audit.

This is an operational step, not a code-enforceable one — no on-chain check can distinguish a genuine Blend pool address from a convincing fake at deploy time.

---

## Testing Strategy

- Unit and integration tests exist per-contract under `contracts/*/src/test.rs` (or `tests/` for `rollover`), plus recorded test snapshots under each contract's `test_snapshots/`.
- `marketplace` additionally carries a `proptest`-based property fuzzer exercising AMM invariants under randomized operation sequences — the only property-based testing in the workspace today.
- `sy_wrapper` carries a dedicated `audit_tests.rs` with randomized stress and donation-attack scenarios.
- Known gaps: `pt_token` and `yt_token` currently have zero dedicated unit tests (coverage is transitive via `tokenizer`'s integration tests only); several boundary and adversarial-dependency scenarios are not yet covered — see `SECURITY_AUDIT.md` §6 for the full list.

---

## Vulnerability Reporting

If you discover a security vulnerability in this protocol, **please do not open a public GitHub issue.**

**Contact:** security@novaire.xyz *(placeholder — replace with a monitored address before mainnet)*
**PGP key:** *(placeholder — publish a PGP key fingerprint here before mainnet; encrypt any report containing exploit details)*

**What to include:** affected contract(s) and function(s), a description of the issue, and if possible a minimal reproduction (test case, transaction sequence, or PoC contract). We do not require a working exploit — a clearly described theoretical vulnerability with code citations is enough to start triage.

**Response times (target, testnet-stage):**
- Acknowledgment of report: within 48 hours.
- Initial severity assessment: within 5 business days.
- Fix or mitigation for Critical/High findings: best-effort, prioritized immediately; no funds are at mainnet risk today, so no bounty program is active yet.

**Severity classification** (used consistently with `SECURITY_AUDIT.md`):
- **Critical** — direct, unconditional loss or freezing of user funds, or a way to mint/redeem tokens outside protocol rules.
- **High** — fund loss achievable under plausible (not contrived) conditions, or a way to break a core protocol invariant.
- **Medium** — fund loss only under narrow/unlikely conditions, or a way to degrade protocol integrity without direct loss.
- **Low** — fails safe (reverts rather than corrupts), narrow theoretical exposure, or a defense-in-depth gap.
- **Informational** — code quality, documentation, or centralization observations with no direct exploit path.

**Disclosure timeline:** we ask reporters to give us 90 days from acknowledgment before any public disclosure, or until a fix is shipped, whichever is sooner. We will keep you updated on remediation progress throughout.

---

## Remediation Roadmap

All items below are **outstanding** as of this document's publication (none have been fixed as part of this audit pass — this audit is read-only). Cited findings refer to `SECURITY_AUDIT.md`.

### Critical
- [ ] None identified.

### High
- [ ] None identified.

### Medium
- [ ] None identified as pure Medium; SEC-01 is rated Low-Medium — see below.

### Low
- [x] SEC-01 — Wire `intent_engine`'s rate gate to `marketplace.get_twap_rate_checked()` instead of the unstaleness-checked variant. *(Fixed: `contracts/intent_engine/src/lib.rs`)*
- [x] SEC-02 — Add `extend_ttl` calls throughout `sy_wrapper` (currently has none). *(Fixed: `contracts/sy_wrapper/src/lib.rs`)*
- [x] SEC-03 — Convert raw division to `checked_div` in `tokenizer`'s `claim_yield`/`redeem_pt` settlement math. *(Fixed: `contracts/tokenizer/tokenizer/src/lib.rs`)*
- [x] SEC-04 — Convert raw multiply/divide to `checked_*` in `intent_engine`'s YT-sale-percentage calculation. *(Fixed: `contracts/intent_engine/src/lib.rs`)*
- [x] SEC-05 — Restrict `tokenizer.record_surplus_baseline_pub` to `require_auth()` by the registered YtToken address. *(Fixed: `contracts/tokenizer/tokenizer/src/lib.rs`, `contracts/tokenizer/yt_token/src/lib.rs`)*
- [x] SEC-06 — Add a two-step or timelocked handoff for `set_tokenizer`/`set_sy_wrapper`. *(Fixed: `contracts/tokenizer/pt_token/src/lib.rs`, `contracts/tokenizer/yt_token/src/lib.rs` — `set_tokenizer`/`set_sy_wrapper` now stage a pending address; `accept_tokenizer`/`accept_sy_wrapper` confirm it with a second admin-signed call.)*
- [x] SEC-07 — Consolidate instance-storage TTL-bump logic into a single shared helper used by all read paths. *(Fixed: `contracts/sy_wrapper/src/lib.rs` — added `bump_instance_ttl`, called from every instance-storage getter instead of relying on `get_admin` incidentally running first.)*

### Best Practices / Informational
- [x] SEC-08 — Replace silent `max(0, …)` floors in `rollover` with explicit error handling where a negative delta indicates a real anomaly. *(Fixed: `contracts/rollover/src/lib.rs` — `yt_proceeds`, `pt_growth`, and `new_pt` now use `checked_sub(...).ok_or(NovaireRolloverError::MathOverflow)?` instead of `core::cmp::max(0, …)`. `expected_balance` keeps its floor, documented in place, since `balance_before` is 0 by the contract's own zero-custody invariant and a negative delta there is the expected case, not an anomaly.)*
- [x] SEC-09 — Restore a live test for rollover's keeper-vs-permissionless access-control boundary. *(Fixed: `contracts/rollover/src/test.rs` — added `test_execute_rollover_keeper_vs_permissionless_boundary`, which rolls one position through three phases and inspects `env.auths()` to confirm the keeper's authorization is requested while inside the grace period, still requested exactly at `grace_expiration` (inclusive boundary), and not requested once the grace period has strictly passed.)*
- [x] SEC-10 — Yield-source trust assumption documented ("Deployment Verification" above); independent on-chain address verification remains a required manual operational step at every deploy (see `factory::DeployEpochParams::blend_pool` doc comment), not code-enforceable.
- [ ] SEC-11 — Reorder `sy_wrapper.deposit` to decrement/commit state before the external Blend `submit` call, mirroring `withdraw`.
- [ ] SEC-12 — Remove or wire up the unused `_maturity_ledger` parameter in `intent_engine.execute_fixed_yield_intent`.
- [ ] SEC-13 — Make `yt_token.add_accrued_yield` explicitly reject (or explicitly no-op with a comment) on zero amount, for convention consistency.
- [ ] SEC-14 — Add unit test suites for `pt_token` and `yt_token`.
- [x] Add adversarial/dishonest-yield-source test scenarios to `sy_wrapper`'s test suite. *(Fixed: `contracts/sy_wrapper/src/audit_tests.rs` — dishonest-pool inflated-report clamp, persistent-lying bound, and under-report tests.)*
- [x] Add a boundary test at exactly `grace_expiration` in `rollover`. *(Already covered by `test_execute_rollover_keeper_vs_permissionless_boundary` in `contracts/rollover/src/test.rs`, verified.)*
- [x] Add a test for `tokenizer.mint_pt_yt` with `sy_shares <= 0`. *(Fixed: `contracts/tokenizer/tokenizer/src/lib.rs` — `test_mint_pt_yt_rejects_non_positive_sy_shares`.)*
- [x] Add a dedicated test for `tokenizer`'s late-minter `add_accrued_yield` historical-credit path. *(Fixed: `contracts/tokenizer/tokenizer/src/lib.rs` — `test_mint_pt_yt_late_minter_gets_historical_yield_credit`.)*
- [x] Align `soroban-sdk` dependency versions across all workspace crates (22.0.0 vs 22.0.11 skew). *(Fixed: all workspace `Cargo.toml`s now pin `22.0.11`.)*
- [ ] Replace the placeholder security contact email and PGP key above before mainnet launch.

Full findings, code citations, and risk matrix: see [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md).
