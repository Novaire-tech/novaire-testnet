# Security Policy

Novaire is a yield-tokenization protocol built on Soroban (Stellar smart contracts): users deposit an underlying asset, which is supplied to a Blend Capital lending pool and split into Principal Tokens (PT) and Yield Tokens (YT), tradable on a time-decay AMM until maturity. This document describes our security model, trust assumptions, known risks, and how to report vulnerabilities.

This protocol is currently deployed on **testnet only**. Treat all funds and deployments as experimental.

> **Note on this revision:** this document was rewritten after a full re-audit of the current codebase found significant drift from the previous version — several mechanisms described below (pause, permissionless loss-marking, two-step admin transfer, a runtime invariant check on every call, a rate-of-change ratchet, sy-wrapper dead-shares) had been removed or never shipped in the current contracts. This revision describes only what the code actually enforces today.

---

## Security Philosophy

- **Fail safe over fail permissive.** Arithmetic uses `checked_*` operations throughout, and the release build is compiled with `overflow-checks = true`, so an unexpected overflow aborts the transaction rather than silently corrupting state.
- **Minimal privilege for cross-contract calls.** Where one contract must move funds through another on a user's behalf, authorization is granted narrowly via `authorize_as_current_contract` scoped to a single `(contract, function, args)` triple with no further sub-delegation.
- **Single source of truth for time.** Maturity is stored in each contract's config and checked against the ledger timestamp; no separate maturity engine contract exists.
- **Fail-closed accounting under shortfall.** The tokenizer never assumes principal is fully backed; PT claims are senior to YT claims, and any shortfall is applied pro-rata against YT/surplus before it can touch PT. See "Economic Security."

---

## Threat Model Summary

**In scope / defended against:**
- Unauthorized fund movement (every fund-moving call requires `require_auth()` from the fund owner).
- Integer overflow/underflow (checked arithmetic + overflow-checked release builds).
- First-depositor share-inflation attacks on the **AMM** (permanently locked minimum LP shares on first deposit — see below for the sy-wrapper caveat).
- TWAP/flash-loan price manipulation within a single transaction (pre-trade price recorded before reserve mutation; dedicated regression tests).
- Storage archival/rent expiry for user-facing balance data (persistent storage TTL extended on every access, in all contracts).
- Manual/admin manipulation of the SY exchange rate — no such function exists; the rate is derived purely from the Blend pool's reported position.

**Explicitly out of scope / accepted trust:**
- **The external yield source (Blend Capital pool).** `sy-wrapper` fully trusts the pool's reported position value as the basis for the protocol's exchange rate, with **no on-chain bound on the rate's magnitude or rate of change**. A compromised or buggy pool is a systemic risk to the whole protocol and flows through to the SY rate unbounded. See "Known Risks" below.
- **The protocol admin key(s).** Admin authority exists in every contract but, as currently implemented, is limited to one-time initialization parameters and a small number of config/recovery entry points (see "Access Control") — it cannot move user funds, mint/burn tokens, or change the exchange-rate logic. See "Trust Assumptions."
- **Off-chain infrastructure** (RPC providers, frontends) is not covered by this policy; report issues with those to their respective operators.

---

## Trust Assumptions

| Actor | Trusted for | Not trusted for |
|---|---|---|
| Protocol admin | One-time initialization parameters; `sy-wrapper`'s `migrate_reserve_index` recovery path | Moving user funds, minting/burning tokens, setting/overriding the SY exchange rate, pausing the protocol (no such function exists) |
| External yield source (Blend Capital) | Reporting accurate position/supply values | Fully solvent, un-hacked, honest reporting is *assumed*, not verified on-chain — there is currently no rate-of-change bound or independent cross-check |
| Any user | Only their own funds, gated by `require_auth()` | Anyone else's balances or positions |

---

## Access Control

Every fund-moving entry point in every contract was verified to require `require_auth()` from the relevant party (depositor, withdrawer, redeemer). Notable patterns:

- **No admin transfer/reassignment functions exist.** There is no `transfer_admin`/`accept_admin`, no `set_tokenizer`, and no `set_sy_wrapper` in the current code. Whatever authority relationships (e.g. tokenizer as the sole minter/burner for `pt-token`/`yt-token`) are established at initialization are immutable for the life of the deployed contract.
- **Mint/burn authority is fixed at init.** `pt-token` and `yt-token` gate mint/burn to a single configured `tokenizer` address checked via `require_auth()`; there is no runtime path to change which address holds that authority.
- **`sy-wrapper.pool` is fixed at `initialize_blend`** with no rotation function — see "Deployment Verification" below.
- **Intentionally permissionless functions**: rate/state "crank" reads that only surface real on-chain state and cannot be abused to move funds — e.g. `observe_rate` / `freeze_maturity_rate` (tokenizer) and AMM swap/liquidity entry points (individually user-gated by `require_auth()`, not admin-gated, by design — this is a permissionless AMM).
- **`migrate_reserve_index`** (sy-wrapper) is the one remaining admin-gated, state-changing recovery function; it re-points the wrapper at a corrected Blend reserve index and cross-checks the new index against the pool before accepting it. It cannot set an arbitrary exchange rate or move user funds.

---

## Oracle Security

The protocol has two internal price/rate sources, both on-chain and derived from real reserve state (no external price feed dependency for AMM pricing):

1. **AMM implied rate / TWAP** (`amm`): a time-weighted log-implied-rate accumulator. The pre-trade implied rate is recorded *before* reserve state is mutated by the same transaction, closing a same-block manipulation window. A `twap_warming_up()` accessor surfaces whether the window has enough history yet.
2. **SY exchange rate** (`sy-wrapper`): derived directly from the external yield source's reported position value (Blend's `b_rate` applied to the wrapper's own `b_token` balance) plus idle balance. There is currently **no monotonicity guarantee and no rate-of-change bound** — a single anomalous value reported by Blend flows through to the SY rate on the very next read. See "Known Risks."

---

## Economic Security

- **First-depositor / share-inflation attack:**
  - `amm`: mitigated via `MINIMUM_LIQUIDITY` — a fixed amount of LP shares permanently unminted (locked) on the first liquidity provision, the standard "dead shares" pattern.
  - `sy-wrapper`: **no equivalent dead-shares mechanism exists.** Shares are minted as a plain ratio (`assets_credited * WAD / rate`) with no minimum lock on first deposit. The classic ERC-4626 inflation attack (attacker deposits a trivial amount, then donates directly to the vault's tracked assets to inflate the rate before a victim deposits, rounding the victim's shares to zero) requires a way to inflate the wrapper's tracked AUM *without* depositing through the wrapper. Because AUM is computed from the wrapper's own `b_token` balance at the pool's `b_rate` rather than a raw, externally-toppable balance, a third party cannot directly donate to inflate it — but this has **not** been proven with a dedicated regression test in the current suite. Treat as unconfirmed-low until such a test exists (see Remediation Roadmap).
- **PT/YT solvency model:** the tokenizer does **not** assume PT principal is unconditionally backed. On `recombine` / `redeem_at_maturity`, PT claims are senior: any shortfall between escrowed SY value and PT face value is absorbed pro-rata by YT holders' surplus claim first. `claim_yield` reserves the senior PT claim before allowing YT to draw down surplus, so YT cannot be paid out in a way that leaves PT under-collateralized by the escrowed balance at that moment.
- **Maturity-rate freeze:** the tokenizer freezes the observed exchange rate at maturity (`freeze_maturity_rate` / `MaturityRate`) so that post-maturity Blend rate movement cannot leak into or out of matured PT/YT redemption value.
- **Fee model:** a flat fee (configurable at deploy, default 0.3%) on PT/SY swaps; YT pricing (derived via flash-recombine against the same curve) uses the same fee structure.
- **AMM bounds:** market proportion, scalar root, anchor, and reserve size are all bounds-checked at initialization and on every trade (`MAX_MARKET_PROPORTION`, `MAX_RESERVE_UNITS`, `MAX_SCALAR_ROOT`, `MAX_ANCHOR`), preventing degenerate or unbounded curve configurations.

---

## Storage Security

Soroban contracts pay ongoing "rent" to keep storage entries alive; an unrefreshed entry can archive and become temporarily inaccessible. Our policy:

- All persistent storage holding user balances/positions is TTL-extended on every read and every write, verified across all contracts.
- Instance storage (admin, config, global counters) is extended on every meaningful call via a shared `bump_instance_ttl` helper.

---

## Protocol Invariants

The authoritative, code-referenced invariant list lives in [`docs/protocol/CONTRACTS.md`](docs/protocol/CONTRACTS.md). These invariants are exercised by the test suite (unit, integration, and — for the AMM — property-based fuzzing); they are **not** re-asserted as a runtime post-condition inside the deployed contract logic itself (see "Known Risks" — there is no equivalent to a runtime `assert_invariant` call on the hot path today):

- Tokenizer: PT claims are senior to YT claims; any shortfall is absorbed pro-rata by YT before PT; PT/YT minted in equal face amounts.
- AMM: reserves are never one-sided; `MINIMUM_LIQUIDITY` LP shares are permanently locked from the first deposit; on-chain token balances are always ≥ tracked reserves in the property-fuzzer model.

---

## Emergency Controls

**There is currently no pause mechanism, circuit breaker, or emergency-halt capability of any kind in any contract.** Deposits, swaps, mints, and redemptions cannot be paused by the admin or by any automated trigger. If a critical bug or a Blend-side incident is discovered post-deployment, the only mitigation available is off-chain (frontend takedown, public advisory) — there is no on-chain lever to stop new activity against an already-deployed market.

This is a deliberate simplification relative to an earlier design that included admin-gated pause and a permissionless, decrease-only loss-marking function; both were removed and are not present in the current contracts. Reintroducing an incident-response lever (or formally re-affirming its absence as an accepted trade-off) is tracked in the Remediation Roadmap below.

---

## Upgrade Strategy

Each market's contract set is deployed fresh (there is no factory). Contracts are immutable once deployed, and protocol evolution happens by deploying a new market's contract set. A new maturity or a new underlying is a fresh deployment, not an upgrade.

---

## Known Risks

1. **External yield-source trust, currently unbounded.** The protocol's core exchange rate is fully dependent on the correctness and honesty of an external Blend Capital lending pool contract, with no on-chain rate-of-change limiter today (a previous design included one; it is not present in the current `sy-wrapper`). A single bad or malicious `b_rate` report from Blend flows directly into the SY exchange rate on the next read, with no dampening. This is an inherent risk of any yield-wrapping design, currently **unmitigated on-chain**. Users should understand that PT/YT value ultimately depends on a third-party contract outside this repository. `sy-wrapper`'s `pool` address is set once at `initialize_blend` with no rotation function, so the correctness of this trust boundary hinges entirely on the `pool` address passed at deploy time being the genuine, official Blend Capital pool — see "Deployment Verification" below.

2. **No emergency pause.** See "Emergency Controls" above — there is no way to halt an already-deployed market on-chain if an issue is found.

3. **sy-wrapper first-depositor inflation attack — likely but not conclusively mitigated.** See "Economic Security" above. AUM is derived from the wrapper's own `b_token` position rather than a directly-donatable balance, which likely closes the classic attack path, but this has not been proven by a dedicated test.

4. **No independent oracle verification.** The SY exchange rate derives entirely from Blend's self-reported `b_rate` with no on-chain cross-check against an independent price source.

5. **Single-key admin, narrow but nonzero blast radius.** Admin authority is a single `Address` per contract with no multisig or timelock. Its current on-chain capability is limited (see "Access Control") but a compromised key could still, e.g., call `migrate_reserve_index` on `sy-wrapper` with an incorrect (though pool-cross-checked) reserve index.

---

### Deployment Verification (required before every deploy)

Because `sy-wrapper`'s `pool` address is set once at `initialize_blend` and cannot be rotated, a wrong or malicious address wired in at deploy time is **not** caught by any on-chain validation beyond a reserve-index/decimals consistency check against that pool. Whoever deploys MUST, before submitting the transaction:

- [ ] Confirm the `pool` address matches the official Blend Capital pool listed in Blend's own deployment registry/docs for the target network (mainnet vs. testnet), not a value copied from a prior deployment, a fork, or an unverified third-party source.
- [ ] Confirm the underlying asset accepted by that pool matches `params.underlying` for this market.
- [ ] Record the verified `pool` address (and the source used to verify it) alongside the market's deployment record for later audit.

This is an operational step, not a code-enforceable one — no on-chain check can distinguish a genuine Blend pool address from a convincing fake at deploy time.

---

## Security Note: ExchangeRateBelowOne

`ExchangeRateBelowOne` is an intentional AMM invariant. Trades that would
produce an exchange rate below `WAD` are reverted before the resulting
`last_ln_implied_rate` can be persisted.

The transaction is atomic, so the failed trade leaves the pool state unchanged
and the market remains usable.

A previously reported concern was that this error could persist an invalid
market state and cause a trading DoS. It was investigated against the current
source (`contracts/amm/src/lib.rs`) and the deployed testnet WASM. Multiple
oversized-trade, boundary, repeated-swap, and near-expiry scenarios were
reproduced. In every case the triggering transaction reverted atomically and
subsequent quotes remained functional; the live testnet market was also
queried directly and confirmed healthy.

No alternate state-write path or separate AMM implementation was found.

**Disposition:** Not reproducible in the current implementation or deployment.
No protocol change required. On-chain history beyond the RPC retention window
was not inspected — a specific transaction hash or ledger sequence would be
required to investigate any future claim of a historical incident.

---

## Testing Strategy

- Unit and integration tests exist per-contract under `contracts/*/src/test.rs`, plus `contracts/integration_tests/` for cross-contract invariants, economics, and regression suites.
- `amm` additionally carries a `proptest`-based property fuzzer exercising AMM invariants under randomized operation sequences.
- Known gaps: no dedicated sy-wrapper donation/inflation-attack regression test (see Known Risks #3); no adversarial/dishonest-yield-source test scenarios for an out-of-bounds or decreasing Blend `b_rate`.

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
- [ ] Decide whether to reintroduce an emergency pause mechanism (or formally accept its absence as a permanent design trade-off) before mainnet.
- [ ] Decide whether to reintroduce a rate-of-change bound on the SY exchange rate (or formally accept unbounded Blend trust as a permanent design trade-off) before mainnet.
- [ ] Add a dedicated sy-wrapper first-depositor donation/inflation-attack regression test to conclusively confirm or refute the risk noted above.

### Low / Best Practices / Informational
- [ ] Replace the placeholder security contact email and PGP key above before mainnet launch.
- [ ] Consider multisig or timelock for the remaining admin surface (`migrate_reserve_index`, market deployment parameters), even though current blast radius is narrow.
- [ ] Align `soroban-sdk` dependency versions across all workspace crates.
- [ ] Add adversarial/out-of-bounds Blend `b_rate` test scenarios to `sy-wrapper`'s test suite.

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
