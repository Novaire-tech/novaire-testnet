# Protocol Invariants

Source-of-truth reference for invariants enforced (or assumed) across the Novaire contracts. All citations are `file:line` in `contracts/`.

## 1. PT Supply

- Mint/burn gated to the `tokenizer` address only (`require_auth`). — `tokenizer/pt_token/src/lib.rs:216-217,255-256`
- No negative supply/balance: `checked_add`/`checked_sub` on `total_supply` and per-user balances. — `pt_token/src/lib.rs:224-234,263-276,313-326,388-401`
- Pause blocks mint/burn only, not transfers (secondary-market liquidity preserved). — `pt_token/src/lib.rs:218,257` vs `301-331,366-406`
- Tokenizer tracks `TotalPtMinted` independently, incremented by `sy_shares` per mint. — `tokenizer/tokenizer/src/lib.rs:330-334`
- PT principal backed 1:1 in vault shares at `epoch_start_index`: `pt_liability_raw = pt_outstanding * epoch_start_index`. — `tokenizer/src/lib.rs:621-623`
- **INVARIANT 2** (`assert_invariant`): `compute_surplus_raw(env) >= 0` — Tokenizer must always hold enough vault shares to cover outstanding PT principal. Checked after `mint_pt_yt`, `claim_yield`, `settle_epoch`, `redeem_pt`. — `tokenizer/src/lib.rs:602-631,793-797`, call sites `341,445,492,566`
- Redemption is exact via cross-multiplication (`epoch_start_index`/`settlement_rate`) to avoid double rounding. — `tokenizer/src/lib.rs:530-536`
- **Documented but not independently enforced**: `pt_token`'s own comment claims PT can never exist without SY-backing, but `pt_token` has no visibility into the SY wrapper — this is enforced solely by Tokenizer's `assert_invariant`. — `pt_token/src/lib.rs:162`

## 2. YT Supply

- Mint/burn gated to `tokenizer` only. — `tokenizer/yt_token/src/lib.rs:571-572,611-612`
- PT and YT minted in equal `sy_shares` amounts in the same call (Open phase). — `tokenizer/src/lib.rs:284-294`
- **INVARIANT 1** (`assert_invariant`): `pt_outstanding == yt_outstanding`, strictly required while `EpochState::Open` (not enforced post-Matured, since PT can redeem/burn while YT can't). — `tokenizer/src/lib.rs:788-791`
- `update_yield_index` cannot decrease (`IndexCannotDecrease`). — `yt_token/src/lib.rs:378-381`
- Yield accrual freezes at/after maturity (`is_expired` via `MaturityEngine::live_state`). — `yt_token/src/lib.rs:446-452,283-288`
- Transfers checkpoint both sender and receiver before mutating balances (no retroactive yield theft). — `yt_token/src/lib.rs:672-699,736-770`
- Late-minter historical yield is self-funded: `add_accrued_yield = (exchange_rate - epoch_start_index) * sy_shares`, never draws on other holders' surplus. — `tokenizer/src/lib.rs:296-314`
- **Test-level note**: integration harness's `INV-4` is skipped (test bootstrap mints "naked PT" directly); real enforcement is Tokenizer's INVARIANT 1 above. — `integration_tests/src/invariants.rs:93-99`

## 3. Treasury / Solvency

No standalone treasury contract; accounting is distributed:

- SY Wrapper: `refresh_rate` only ratchets `TotalUnderlying` up, rejects any decrease (`RateCannotDecrease`), and clamps increases to max 10% per call (anti donation-DoS). — `sy_wrapper/src/lib.rs:340-379`
- `mark_loss` (admin-only) can only decrease `TotalUnderlying` down to measured actual balance, never below. — `sy_wrapper/src/lib.rs:393-415`
- Marketplace swap fee: `997/1000` (0.3%) on PT-leg input; YT-leg fee applied as output haircut. — `marketplace/src/lib.rs:249-250,378-384,804-808,881-885`
- Marketplace collateralization (`assert_invariant`): on-chain PT/underlying balance must be `>=` tracked reserves; rejects one-sided/orphaned reserves. — `marketplace/src/lib.rs:1284-1313`
- Rollover must never warehouse underlying between ops (`balance(contract) > 0` → `InvariantViolation`). — `rollover/src/lib.rs:565-571`
- Intent Engine must hold zero PT/YT/underlying after every op (test-level, INV-8). — `integration_tests/src/invariants.rs:146-160`

## 4. Settlement

- Settlement only from `Matured` state, exactly once (`AlreadySettled`/`EpochNotMatured`). — `tokenizer/src/lib.rs:452-459`
- Sequence: (1) `refresh_rate` to avoid stale settlement, (2) final yield-index refresh for current YT holders, (3) freeze `settlement_rate`, (4) advance `MaturityEngine::settle_epoch` in the same tx. — `tokenizer/src/lib.rs:462-484`
- Settlement rate is immutable once set; used in preference to live SY rate thereafter, insulating PT holders from post-settlement rate crashes. — `tokenizer/src/lib.rs:614-617,530-536`
- `claim_yield` branches on live rate pre-settlement vs. locked rate post-settlement. — `tokenizer/src/lib.rs:360-373`
- Redemption only in `Settled` state, amount positive and `<=` balance. — `tokenizer/src/lib.rs:506-520`
- MaturityEngine `settle_epoch` requires dynamic state `Matured` (not `Active`/`Settled`/`Archived`). — `maturity_engine/src/lib.rs:189-208`
- MaturityEngine `assert_invariant`: `creation_ledger < maturity_ledger` and `epoch.epoch_id == current_id` for the current epoch. — `maturity_engine/src/lib.rs:318-330`

## 5. Epochs

- State machine: `NO_EPOCH -> ACTIVE -(ledger>=maturity)-> MATURED -(settle_epoch)-> SETTLED -(admin archive_epoch)-> ARCHIVED`. — `maturity_engine/src/lib.rs:25-37,229-240`
- `open_epoch` requires `maturity_ledger > current_sequence` (strict). — `maturity_engine/src/lib.rs:152-155`
- Only one Active/unsettled-Matured epoch at a time. — `maturity_engine/src/lib.rs:157-165`
- `archive_epoch` only from `Settled`, admin-gated. — `maturity_engine/src/lib.rs:210-227`
- Dynamic state is lazily derived (`ledger.sequence() >= maturity_ledger`), no tx required. — `maturity_engine/src/lib.rs:229-240`
- Tokenizer/YtToken/Marketplace all delegate epoch-state queries to `MaturityEngine::live_state` (no duplicated local logic). — `tokenizer/src/lib.rs:163-189`; `yt_token/src/lib.rs:278-288`; `marketplace/src/lib.rs:529-541`
- Factory `deploy_epoch` rejects past maturities (`MaturityInPast`) and duplicate maturities (`EpochAlreadyExists`). — `factory/src/lib.rs:395-402`
- Factory post-deploy wiring check cross-validates every contract's `metadata()` against passed params; any mismatch aborts the whole deployment (`WiringMismatch`). — `factory/src/lib.rs:510-549`
- Factory rejects duplicate contract addresses across the 9 wired contracts (`DuplicateAddress`). — `factory/src/lib.rs:404-422`

## 6. Rollover — PT Custody

- `assert_invariant` after every state-changing op (`register_rollover`, `execute_rollover`, `exit_rollover`):
  1. Underlying balance held by rollover contract must be exactly `0`.
  2. **PT custody**: `pt_client.balance(contract) == storage::get_total_pt_held(env)` — actual on-chain PT must exactly match tracked accounting.
  — `rollover/src/lib.rs:562-586`
- Recent fix (`398b178`) guards against two bugs:
  - `execute_rollover` previously wrote Intent Engine's cross-user cumulative `total_pt_held` directly into a single position instead of computing this call's delta; now snapshots `pt_held_before` and diffs (`new_pt = max(0, total_pt_held - pt_held_before)`). — `rollover/src/lib.rs:423-439,470-471`
  - Rollover's tracked `PtToken` pointer went stale across epoch rolls (fresh PT contract per epoch); `EpochRecord` now carries `pt_token`, persisted on execute. — `rollover/src/lib.rs:477-481`; `factory/src/lib.rs:29`
- `total_pt_held` bookkeeping: incremented on register (`321-327`), delta-adjusted on execute (`483-489`), decremented on exit (`524-530`).
- Position lifecycle: `register_rollover` rejects double-registration while active (`289-293`); `execute_rollover` requires active, `current_ledger >= current_epoch_maturity`, and `next_epoch.maturity_ledger > current_ledger` (`344-350,381-383`).
- Keeper-gated grace period: only registered keeper may execute within grace period; permissionless after, for liveness. — `rollover/src/lib.rs:353-365`
- Mirrored at test level: `INV-9b` (`actual_pt == tracked_pt`), `INV-9a` (rollover holds zero YT). — `integration_tests/src/invariants.rs:162-177`

## 7. AMM (Marketplace)

- YieldSpace-style curve: `k = A_pool*(x+y) + x*y`, `A_pool` grows from 0 toward constant-sum (1:1) as maturity approaches. — `marketplace/src/lib.rs:158-246`
- First deposit permanently locks `MINIMUM_LIQUIDITY = 1000` LP shares to the contract itself (anti inflation-attack); rejects `initial_lp <= MINIMUM_LIQUIDITY`. — `marketplace/src/lib.rs:248,573-593`
- Subsequent deposits get `min(pt_ratio, underlying_ratio)` shares, floor-rounded (anti donation-dilution). — `marketplace/src/lib.rs:594-606`
- `remove_liquidity` can't drain reserves below `1000` dust unless removing the whole pool (`BelowMinimumLiquidity`). — `marketplace/src/lib.rs:727-732`
- `add_yt_liquidity` is a one-way donation — no LP shares minted for YT. — `marketplace/src/lib.rs:640-689`
- Swap fee `997/1000` on PT-leg input; YT-leg priced fee-free in-curve, fee applied as output haircut. — `marketplace/src/lib.rs:274-284,376-384,804-808,881-885`
- Slippage guard on every swap (`out < min_out` → `SlippageExceeded`). — `marketplace/src/lib.rs:816-818,893-895,973-978,1060-1070`
- Post-swap opposite-side reserve must stay `>= 1000` or revert. — `marketplace/src/lib.rs:820-822,897-899`
- YT reserves can't go negative (checked before subtract). — `marketplace/src/lib.rs:980-988`
- `assert_invariant` after every mutating call: no one-sided reserves; no orphaned reserves without LP shares; on-chain balances `>=` recorded reserves. — `marketplace/src/lib.rs:1284-1313`
- Mirrored at test level (`INV-5a/b/c`): actual balances `>=` each stored reserve. — `integration_tests/src/invariants.rs:101-115`
- Trading blocked once epoch expired (`require_not_expired` via `MaturityEngine::live_state`). — `marketplace/src/lib.rs:533-541`, call sites `795,872,949,1042`
- Pause blocks swaps/new liquidity but not `remove_liquidity` (LPs can always exit). — `marketplace/src/lib.rs:496-498`

## 8. Oracle (spot / TWAP)

- Spot price: `P = (A_pool + y) / (A_pool + x)` scaled 1e9; degenerate case returns par (`1_000_000_000`). — `marketplace/src/lib.rs:231-246`
- TWAP is an EMA with fixed 20-ledger window; initializes to spot; same-ledger repeats are no-ops. — `marketplace/src/lib.rs:1241-1282`
- TWAP updated using **pre-swap** spot price (prevents same-block manipulation from being recorded). — `marketplace/src/lib.rs:824-825,901-902,990-994,1091-1094`
- Staleness guard: `get_twap_rate_checked` reverts (`InvariantViolated`) if age `> MAX_TWAP_AGE_LEDGERS (200)`. — `marketplace/src/lib.rs:255-259,1168-1182`
- Bounds check (test-level, `INV-6/INV-7`): spot and TWAP must be `> 0`; in positive-yield regime (`under_res <= pt_res`) both must be `<= SCALE*2` (guards against historical reciprocal-pricing bug). — `integration_tests/src/invariants.rs:117-144`; `marketplace/src/lib.rs:212-225`
- `get_twap_rate_checked` is **not** used by any swap path — swaps price off live curve state only; TWAP is analytics/oracle-signal only.
- SY Wrapper exchange rate (the protocol's other oracle) is monotonic non-decreasing, capped at +10%/call. — `sy_wrapper/src/lib.rs:350-376`
- **Documented but not enforced**: unchecked `get_twap_rate` has no staleness protection — callers must opt into `get_twap_rate_checked` explicitly.

## 9. Storage / Versioning

- Per-contract `DataKey` enum (`contracttype`); instance storage for globals/config, persistent storage with explicit TTL bump (`PERSISTENT_LIFETIME_THRESHOLD`/`PERSISTENT_BUMP_AMOUNT`, 30/60 days) for per-user keyed data. — e.g. `pt_token/src/lib.rs:48-134`; `rollover/src/lib.rs:117-201`; `maturity_engine/src/lib.rs:68-126`
- One-shot `initialize`: gated behind `has(&DataKey::Admin)` → `AlreadyInitialized`, no re-init path. — `pt_token/src/lib.rs:57-59,182-184`; `tokenizer/src/lib.rs:122-124,214-216`
- Two-step admin transfer (`transfer_admin`/`accept_admin`, pending admin must self-auth) in `pt_token`, `yt_token`, `vault`. — `pt_token/src/lib.rs:454-479`; `vault/src/lib.rs:492-519`
- Each contract exposes a hardcoded `version()`; purely informational, no on-chain enforcement or migration path tied to it. — `pt_token/src/lib.rs:46,521-523`; `yt_token/src/lib.rs:88,951-953`; `tokenizer/src/lib.rs:49,575-577`
- Factory tracks `ProtocolVersion`, stamped into each `EpochRecord.version` at deploy — also informational only. — `factory/src/lib.rs:371-384,551-567,601-602`
- No contract upgrade / WASM-swap function exists anywhere; "upgrade" = deploy a fresh contract set per epoch via `Factory::deploy_epoch` (architectural invariant, not a single assert).
- Factory wiring/versioning check cross-validates dependent contracts' `metadata()` at deploy time, aborting the whole deployment on mismatch (`WiringMismatch`) — a transactional storage-consistency invariant. — `factory/src/lib.rs:510-549`
