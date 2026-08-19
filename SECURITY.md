# Security Policy

Novaire is a yield-tokenization protocol built on Soroban (Stellar smart contracts): users deposit an underlying asset, which is supplied to a Blend Capital lending pool and split into Principal Tokens (PT) and Yield Tokens (YT), tradable on a time-decay AMM until maturity. This document describes our security model, trust assumptions, known risks, and how to report vulnerabilities.

This protocol is currently deployed on **testnet only**. Treat all funds and deployments as experimental.

---

## Security Philosophy

- **Fail safe over fail permissive.** Arithmetic uses `checked_*` operations throughout, and the release build is compiled with `overflow-checks = true`, so an unexpected overflow aborts the transaction rather than silently corrupting state.
- **Invariants over trust.** Every state-mutating function in the tokenizer and AMM runs an explicit post-condition (`assert_invariant`) before returning, checking solvency and custody consistency rather than assuming the preceding logic was correct.
- **Minimal privilege for cross-contract calls.** Where one contract must move funds through another on a user's behalf, authorization is granted narrowly via `authorize_as_current_contract` scoped to a single `(contract, function, args)` triple with no further sub-delegation.
- **Liveness over convenience.** Users can always exit a position they own — `remove_liquidity` on the AMM remains callable even while the protocol is paused, so an admin pause can never lock user funds in place.
- **Single source of truth for time.** Maturity is stored in each contract's config and checked against the ledger timestamp; no separate maturity engine contract exists.

---

## Threat Model Summary

**In scope / defended against:**
- Unauthorized fund movement (every fund-moving call requires `require_auth()` from the fund owner).
- Integer overflow/underflow (checked arithmetic + overflow-checked release builds).
- First-depositor share-inflation attacks on the AMM and the SY wrapper (permanently locked minimum liquidity on first deposit).
- TWAP/flash-loan price manipulation within a single transaction (pre-trade price recorded before reserve mutation; dedicated regression tests).
- Storage archival/rent expiry for user-facing balance data (persistent storage TTL extended on every access, in all contracts).

**Explicitly out of scope / accepted trust:**
- **The external yield source (Blend Capital pool).** `sy-wrapper` fully trusts the pool's reported position value as the basis for the protocol's exchange rate, bounded only by a 10%-per-call rate-increase ratchet. A compromised or buggy pool is a systemic risk to the whole protocol. See "Known Risks" below.
- **The protocol admin key(s).** Admin functions (pause, config changes, and in token contracts, mint/burn-authority reassignment) are single-key-gated with no on-chain multisig or timelock today. See "Trust Assumptions."
- **Off-chain infrastructure** (RPC providers, frontends) is not covered by this policy; report issues with those to their respective operators.

---

## Trust Assumptions

| Actor | Trusted for | Not trusted for |
|---|---|---|
| Protocol admin | Pausing, config parameters, deploying new markets | Moving user funds directly — no admin function transfers user-owned token balances |
| External yield source (Blend Capital) | Reporting accurate position/supply values | Fully solvent, un-hacked, honest reporting is *assumed*, not verified on-chain beyond a rate-of-change limiter |
| Any user | Only their own funds, gated by `require_auth()` | Anyone else's balances or positions |

---

## Access Control

Every fund-moving entry point in every contract was verified to require `require_auth()` from the relevant party (depositor, withdrawer, redeemer, or admin as appropriate). Notable patterns:

- **Two-step admin transfer** (`transfer_admin` / `accept_admin`) is used in `sy-wrapper`, `pt-token`, and `yt-token` to prevent an admin from bricking a contract by transferring to an unreachable address.
- **Single-step authority reassignment** exists for `set_tokenizer` (pt_token, yt_token) and `set_sy_wrapper` (yt_token) — these take effect immediately on one admin signature and represent a real centralization risk if the admin key is compromised.
- **Intentionally permissionless functions** exist by design, always because the operation is either bounded/self-limiting or purely a "crank" that reads real on-chain state: `observe_rate` / `freeze_maturity_rate` (tokenizer), `refresh_rate` (sy-wrapper, rate-of-change limited), `mark_loss` (sy-wrapper, decrease-only and floor-bound at measured on-chain balance), and AMM swaps/liquidity operations (user-gated).

---

## Oracle Security

The protocol has two internal price/rate sources, both on-chain and derived from real reserve state (no external price feed dependency for AMM pricing):

1. **AMM implied rate / TWAP** (`amm`): a time-weighted log-implied-rate accumulator. The pre-trade implied rate is recorded *before* reserve state is mutated by the same transaction, closing a same-block manipulation window. A `twap_warming_up()` accessor surfaces whether the window has enough history yet.
2. **SY exchange rate** (`sy-wrapper`): derived from the external yield source's reported position value plus idle balance, monotonic (never decreases), and rate-limited to a maximum 10% increase per call to bound the damage from any single bad report.

---

## Economic Security

- **First-depositor / share-inflation attack:** mitigated in both `amm` (LP shares) and `sy-wrapper` (SY shares) by permanently locking a minimum share amount to the contract itself on first deposit, following the standard "dead shares" pattern.
- **Solvency invariants:** `tokenizer` asserts that computed surplus is never negative (the protocol is always able to honor outstanding PT principal). `amm` asserts AMM reserves are never one-sided and that actual on-chain token balances are always ≥ tracked reserves.
- **Fee model:** a flat fee (configurable at deploy, default 0.3%) on PT/SY swaps; YT pricing (derived via flash-recombine against the same curve) uses the same fee structure.
- **Dust floors:** liquidity removal and swaps are blocked from leaving reserves below a minimum threshold on either side, preventing degenerate/manipulable near-empty pool states (except full-withdrawal, which is always allowed).

---

## Storage Security

Soroban contracts pay ongoing "rent" to keep storage entries alive; an unrefreshed entry can archive and become temporarily inaccessible. Our policy:

- All persistent storage holding user balances/positions is TTL-extended on every read and every write, verified across all contracts.
- Instance storage (admin, config, global counters) is extended on every meaningful call via a shared `bump_instance_ttl` helper.

---

## Protocol Invariants

The authoritative, code-referenced invariant list lives in [`docs/protocol/CONTRACTS.md`](docs/protocol/CONTRACTS.md). Summary of the invariants enforced in-code via `assert_invariant`-style post-conditions:

- Tokenizer: computed surplus is never negative; PT/YT minted in equal face amounts.
- AMM: reserves are never one-sided; no orphaned reserves without corresponding LP shares; on-chain token balances always ≥ tracked reserves.

---

## Emergency Controls

- **Pause:** `sy-wrapper` and `amm` expose admin-gated `pause`/`unpause`. Pausing blocks new deposits/swaps/mints but **never** blocks a user's ability to exit an existing position (`remove_liquidity` on AMM, `redeem` on SY wrapper, `redeem_at_maturity` / `claim_yield` on tokenizer are all pause-exempt by design).
- **Loss marking:** `sy-wrapper.mark_loss` is **deliberately permissionless** (not admin-gated). It can only ever *decrease* tracked underlying, floor-bound at the measured actual on-chain balance derived entirely from on-chain reads (this contract's own token balance plus the yield source's real reported position) — there is nothing caller-supplied for a caller to lie about, so an admin gate would add friction with no safety benefit. Being permissionless is what makes it safe to rely on: anyone (a keeper, a liquidator, an affected user, or an automated bot) can realize a real loss the moment it happens, so bad debt can never be hidden or delayed behind a single admin key that might be slow, absent, or compromised. `redeem` (sy-wrapper) also invokes this same loss-realization logic internally, atomically within the same transaction, before computing a payout — so a loss is realized either explicitly via `mark_loss` or implicitly the next time `redeem` runs, whichever comes first.
- There is currently no on-chain circuit breaker independent of the admin key (e.g. no automatic pause on anomalous activity) — pausing is a manual admin action today.

---

## Upgrade Strategy

Each market's contract set is deployed fresh (there is no factory). Contracts are immutable once deployed, and protocol evolution happens by deploying a new market's contract set. A new maturity or a new underlying is a fresh deployment, not an upgrade.

---

## Known Risks

1. **External yield-source trust.** The protocol's core exchange rate is fully dependent on the correctness and honesty of an external Blend Capital lending pool contract. This is an inherent risk of any yield-wrapping design and is only partially mitigated (rate-of-change limiter, not a correctness check). Users should understand that PT/YT value ultimately depends on a third-party contract outside this repository. `sy-wrapper`'s `pool` address is set once at `initialize_blend` with no rotation function, so the correctness of this trust boundary hinges entirely on the `pool` address passed at deploy time being the genuine, official Blend Capital pool — see "Deployment Verification" below.

2. **Single-key admin.** Admin authority in every contract is currently a single `Address`, not a multisig or timelock-gated address. A compromised admin key could pause the protocol, reassign mint/burn authority (in `pt_token`/`yt_token`, instantly, with no delay), or misconfigure new market deployments.

3. **No independent oracle verification.** The SY exchange rate derives entirely from Blend's self-reported `b_rate` with no on-chain cross-check against an independent price source.

---

### Deployment Verification (required before every deploy)

Because `sy-wrapper`'s `pool` address is set once at `initialize_blend` and cannot be rotated, a wrong or malicious address wired in at deploy time is **not** caught by any on-chain validation. Whoever deploys MUST, before submitting the transaction:

- [ ] Confirm the `pool` address matches the official Blend Capital pool listed in Blend's own deployment registry/docs for the target network (mainnet vs. testnet), not a value copied from a prior deployment, a fork, or an unverified third-party source.
- [ ] Confirm the underlying asset accepted by that pool matches `params.underlying` for this market.
- [ ] Record the verified `pool` address (and the source used to verify it) alongside the market's deployment record for later audit.

This is an operational step, not a code-enforceable one — no on-chain check can distinguish a genuine Blend pool address from a convincing fake at deploy time.

---

## Testing Strategy

- Unit and integration tests exist per-contract under `contracts/*/src/test.rs`, plus `contracts/integration_tests/` for cross-contract invariants, economics, and regression suites.
- `amm` additionally carries a `proptest`-based property fuzzer exercising AMM invariants under randomized operation sequences.
- `sy-wrapper` carries a dedicated `audit_tests.rs` with randomized stress and donation-attack scenarios.
- Known gaps: several boundary and adversarial-dependency scenarios are not yet covered.

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

**Severity classification:**
- **Critical** — direct, unconditional loss or freezing of user funds, or a way to mint/redeem tokens outside protocol rules.
- **High** — fund loss achievable under plausible (not contrived) conditions, or a way to break a core protocol invariant.
- **Medium** — fund loss only under narrow/unlikely conditions, or a way to degrade protocol integrity without direct loss.
- **Low** — fails safe (reverts rather than corrupts), narrow theoretical exposure, or a defense-in-depth gap.
- **Informational** — code quality, documentation, or centralization observations with no direct exploit path.

**Disclosure timeline:** we ask reporters to give us 90 days from acknowledgment before any public disclosure, or until a fix is shipped, whichever is sooner. We will keep you updated on remediation progress throughout.

---

## Remediation Roadmap

All items below are **outstanding** as of this document's publication.

### Critical
- [ ] None identified.

### High
- [ ] None identified.

### Medium
- [ ] None identified.

### Low / Best Practices / Informational
- [ ] Replace the placeholder security contact email and PGP key above before mainnet launch.
- [ ] Consider timelock or multisig for admin functions, especially `set_tokenizer`/`set_sy_wrapper`, given the outsized blast radius of a single compromised admin key.
- [ ] Align `soroban-sdk` dependency versions across all workspace crates.
- [ ] Add adversarial/dishonest-yield-source test scenarios to `sy-wrapper`'s test suite.

---

## Current Architecture (6 Contracts)

| Contract | Role | Custodies Funds? |
|---|---|---|
| `sy-wrapper` | Wraps Blend position into ERC-4626-style SY shares; exchange rate oracle | Yes |
| `tokenizer` | Splits SY into equal-face PT/YT; holds escrow; settles yield/redemptions | Yes (escrowed SY) |
| `pt-token` | Fixed-principal claim token (SEP-41), mint/burn gated to tokenizer | No (ledger only) |
| `yt-token` | Variable-yield claim token (SEP-41), checkpoint/accrual, mint/burn gated to tokenizer | No (ledger only) |
| `amm` | Time-decay AMM (PT↔SY direct, SY↔YT flash-routed via tokenizer); TWAP | Yes (reserves) |
| `blend-adapter` | Library crate: rate derivation math + Blend pool client trait | N/A (not deployed) |

**Dependency graph:**
```
sy-wrapper ──(reads via BlendPoolClient)──▶ Blend Capital Pool
tokenizer ──▶ sy-wrapper (exchange_rate)
tokenizer ──▶ pt-token (mint/burn)
tokenizer ──▶ yt-token (mint/burn/settle/consume)
amm ──▶ pt-token / sy-wrapper / yt-token / tokenizer (flash split/recombine)
```

No factory, no vault, no marketplace, no maturity_engine, no rollover, no intent_engine.