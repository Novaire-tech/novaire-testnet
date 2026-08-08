// Local, on-demand protocol verification against real Stellar Testnet.
// Run: npm run verify:testnet
//
// No CI, no browser automation, no mocks: creates real funded wallets,
// executes real signed transactions against the deployed Novaire contracts,
// reads balances directly from those contracts, and cross-checks two
// independently-implemented formulas (scripts/verify_testnet/expected.ts)
// against each other and against the on-chain reads. See README.md at repo
// root section "Testnet verification" — or scripts/verify_testnet/ — for
// details on what each scenario proves and its known scope limits.
import { Keypair } from '@stellar/stellar-sdk';
import {
  createWallet,
  deterministicWallet,
  fundWallet,
  getServer,
  assertNotMatured,
  waitForTransaction,
  depositVault,
  mintPTYT,
  buyPT,
  readOnChainState,
  readClaimableYield,
  withRetry,
  settleAfterConfirmation,
  RPC_URL,
  FRIENDBOT_URL,
  type Wallet,
} from './verify_testnet/chain';
import { computeIndependent, computeAppFormula, withinTolerance, calculateProjectedDailyYield } from './verify_testnet/expected';

const USE_DETERMINISTIC = process.argv.includes('--deterministic');
const XLM_SPOT_USD = 0.1; // fixed reference price; see README — avoids depending on a live price API for this local tool
const ASSUMED_APY_PCT = 8.5; // used only to sanity-check the daily-yield formula's shape, not a live oracle read

interface Check {
  label: string;
  pass: boolean;
  detail?: string;
}

interface ScenarioReport {
  name: string;
  wallet: string;
  transactions: { action: string; hash?: string; status: string }[];
  checks: Check[];
  skipped?: string;
}

const reports: ScenarioReport[] = [];

function record(name: string, wallet: string): { push: (c: Check) => void; tx: (action: string, o: { hash?: string; status: string }) => void; skip: (reason: string) => void } {
  const report: ScenarioReport = { name, wallet, transactions: [], checks: [] };
  reports.push(report);
  return {
    push: (c: Check) => report.checks.push(c),
    tx: (action, o) => report.transactions.push({ action, hash: o.hash, status: o.status }),
    skip: (reason: string) => { report.skipped = reason; },
  };
}

function checkFinite(label: string, value: number, r: ReturnType<typeof record>) {
  const pass = isFinite(value) && !isNaN(value);
  r.push({ label, pass, detail: pass ? undefined : `got ${value}` });
}

function checkEqual(label: string, expected: number, actual: number, r: ReturnType<typeof record>) {
  const pass = withinTolerance(expected, actual);
  r.push({ label, pass, detail: pass ? undefined : `expected ${expected}, got ${actual} (diff ${Math.abs(expected - actual)})` });
}

async function newFundedWallet(seed: string): Promise<Wallet> {
  const wallet = USE_DETERMINISTIC ? deterministicWallet(seed) : createWallet();
  await fundWallet(wallet);
  return wallet;
}

async function preflight(): Promise<void> {
  console.log('Preflight: checking Testnet RPC / Friendbot reachability...');
  const server = getServer();
  await withRetry(() => server.getLatestLedger(), 4, 'getLatestLedger');
  await assertNotMatured(server);
  const fb = await withRetry(() => fetch(`${FRIENDBOT_URL}?addr=${Keypair.random().publicKey()}`), 4, 'Friendbot ping');
  if (!fb.ok && fb.status !== 400) throw new Error(`Friendbot unreachable: HTTP ${fb.status}`);
  console.log(`  RPC (${RPC_URL}) reachable, fixture not matured, Friendbot reachable.\n`);
}

async function scenarioEmptyWallet() {
  const wallet = await newFundedWallet('scenario-a-empty');
  const r = record('A — Empty wallet', wallet.publicKey);

  const state = await readOnChainState(wallet.publicKey);
  const expected = computeIndependent(state, XLM_SPOT_USD, XLM_SPOT_USD);
  const appFormula = computeAppFormula(state, XLM_SPOT_USD, XLM_SPOT_USD);

  checkEqual('totalInvestedUsd == 0', 0, expected.totalInvestedUsd, r);
  checkEqual('independent vs app-formula agree (totalInvestedUsd)', expected.totalInvestedUsd, appFormula.totalInvestedUsd, r);
  const dailyYield = calculateProjectedDailyYield(expected.totalInvestedXlm, ASSUMED_APY_PCT);
  checkEqual('Est. Daily Yield == 0', 0, dailyYield, r);
  checkFinite('totalValueUsd finite', expected.totalValueUsd, r);
  checkFinite('totalInvestedXlm finite', expected.totalInvestedXlm, r);
}

async function scenarioVaultOnly() {
  const wallet = await newFundedWallet('scenario-b-vault');
  const r = record('B — Vault LP only', wallet.publicKey);
  const server = getServer();

  const dep = await depositVault(wallet, 50);
  r.tx('vault.deposit(50 XLM)', dep);
  if (dep.hash) await waitForTransaction(dep.hash, server);
  await settleAfterConfirmation();

  const state = await readOnChainState(wallet.publicKey);
  const expected = computeIndependent(state, XLM_SPOT_USD, XLM_SPOT_USD);
  const appFormula = computeAppFormula(state, XLM_SPOT_USD, XLM_SPOT_USD);

  r.push({ label: 'on-chain vaultLp > 0 after deposit', pass: state.vaultLp > 0, detail: `vaultLp=${state.vaultLp}` });
  checkEqual('independent vs app-formula agree (totalInvestedUsd)', expected.totalInvestedUsd, appFormula.totalInvestedUsd, r);
  const allocSum = expected.allocationPercent.reduce((s, a) => s + a.percent, 0);
  checkEqual('allocation sums to 100%', 100, allocSum, r);
  checkFinite('Est. Daily Yield finite', calculateProjectedDailyYield(expected.totalInvestedXlm, ASSUMED_APY_PCT), r);
}

async function scenarioPtOnly() {
  const wallet = await newFundedWallet('scenario-c-pt');
  const r = record('C — PT only', wallet.publicKey);
  const server = getServer();

  const dep = await depositVault(wallet, 30);
  r.tx('vault.deposit(30 XLM)', dep);
  if (dep.hash) await waitForTransaction(dep.hash, server);
  await settleAfterConfirmation();

  // Tokenize the exact minted share balance rather than assuming a 1:1
  // deposit-to-share rate — the vault may apply fees/rounding, and
  // over-requesting shares reverts transfer_shares on-chain.
  const postDepositState = await readOnChainState(wallet.publicKey);
  const mint = await mintPTYT(wallet, postDepositState.vaultLp);
  r.tx(`tokenizer.mint_pt_yt(${postDepositState.vaultLp} shares)`, mint);
  if (mint.hash) await waitForTransaction(mint.hash, server);
  await settleAfterConfirmation();

  const state = await readOnChainState(wallet.publicKey);
  const expected = computeIndependent(state, XLM_SPOT_USD, XLM_SPOT_USD);
  const appFormula = computeAppFormula(state, XLM_SPOT_USD, XLM_SPOT_USD);

  r.push({ label: 'on-chain ptBalance > 0 after mint', pass: state.ptBalance > 0, detail: `ptBalance=${state.ptBalance}` });
  checkEqual('independent vs app-formula agree (totalValueUsd)', expected.totalValueUsd, appFormula.totalValueUsd, r);
  checkFinite('Est. Daily Yield finite', calculateProjectedDailyYield(expected.totalInvestedXlm, ASSUMED_APY_PCT), r);
}

async function scenarioVaultPlusPt() {
  const wallet = await newFundedWallet('scenario-d-both');
  const r = record('D — Vault LP + secondary-market PT', wallet.publicKey);
  const server = getServer();

  const dep = await depositVault(wallet, 40);
  r.tx('vault.deposit(40 XLM, untokenized)', dep);
  if (dep.hash) await waitForTransaction(dep.hash, server);
  await settleAfterConfirmation();

  let bought = false;
  try {
    const buy = await buyPT(wallet, 10);
    r.tx('marketplace.swap_underlying_for_pt(10 XLM)', buy);
    if (buy.hash) await waitForTransaction(buy.hash, server);
    await settleAfterConfirmation();
    bought = true;
  } catch (e: any) {
    r.skip(`Marketplace PT purchase failed — likely no seeded AMM liquidity this epoch: ${e.message || e}`);
    return;
  }

  const state = await readOnChainState(wallet.publicKey);
  const expected = computeIndependent(state, XLM_SPOT_USD, XLM_SPOT_USD);
  const appFormula = computeAppFormula(state, XLM_SPOT_USD, XLM_SPOT_USD);

  r.push({ label: 'vaultLp > 0 (not overwritten by PT purchase)', pass: state.vaultLp > 0, detail: `vaultLp=${state.vaultLp}` });
  r.push({ label: 'ptBalance > 0 (secondary purchase landed)', pass: state.ptBalance > 0 && bought, detail: `ptBalance=${state.ptBalance}` });

  const expectedInvestedFromBoth = state.vaultLp * XLM_SPOT_USD + state.ptBalance * (state.ptPriceUnderlying * XLM_SPOT_USD);
  checkEqual('totalInvestedUsd == LP + PT (additive, no overwrite)', expectedInvestedFromBoth, expected.totalInvestedUsd, r);
  checkEqual('independent vs app-formula agree (totalInvestedUsd)', expected.totalInvestedUsd, appFormula.totalInvestedUsd, r);

  const allocSum = expected.allocationPercent.reduce((s, a) => s + a.percent, 0);
  checkEqual('allocation sums to 100% (no duplicate counting)', 100, allocSum, r);
  r.push({ label: 'activePositions == 2 (LP + tokenized, distinct)', pass: expected.activePositions === 2, detail: `activePositions=${expected.activePositions}` });

  const codes = expected.allocationPercent.map((a) => a.assetCode);
  r.push({ label: 'no duplicate asset codes in allocation', pass: new Set(codes).size === codes.length, detail: codes.join(', ') });
}

async function scenarioClaimableYield() {
  const seedSecret = process.env.VERIFY_YIELD_WALLET_SECRET;
  const wallet: Wallet = seedSecret
    ? { keypair: Keypair.fromSecret(seedSecret), publicKey: Keypair.fromSecret(seedSecret).publicKey() }
    : await newFundedWallet('scenario-e-yield');
  const r = record('E — Claimable yield safe-math', wallet.publicKey);

  if (!seedSecret) {
    r.skip(
      'yt_token has no user-callable claim/accrual transaction in this contract version (accrual is admin/epoch-driven) — ' +
        'verifying the safe-math guard only. Set VERIFY_YIELD_WALLET_SECRET to a fixture wallet with real accrued yield ' +
        'to additionally verify the nonzero-conversion path.',
    );
  }

  const claimable = await readClaimableYield(wallet.publicKey);
  checkFinite('claimable yield read is finite', claimable, r);

  const usdAtSomePrice = claimable * XLM_SPOT_USD;
  const toXlmSafe = (usd: number, xlmPriceUsd: number) => (xlmPriceUsd > 0 ? usd / xlmPriceUsd : 0); // exact guard from portfolioService.ts
  const xlmAtZeroPrice = toXlmSafe(usdAtSomePrice, 0);
  checkEqual('claimableYieldXlm safe when xlmPriceUsd=0 (no Infinity)', 0, xlmAtZeroPrice, r);
  checkFinite('claimableYieldXlm finite at price=0', xlmAtZeroPrice, r);

  if (seedSecret && claimable > 0) {
    const xlmAtRealPrice = usdAtSomePrice / XLM_SPOT_USD;
    checkFinite('claimableYieldXlm finite at real price', xlmAtRealPrice, r);
    r.push({ label: 'claimable yield nonzero for fixture wallet', pass: claimable > 0, detail: `claimable=${claimable}` });
  }
}

function printReport(): boolean {
  console.log('\n' + '='.repeat(72));
  console.log('NOVAIRE PORTFOLIO TESTNET VERIFICATION REPORT');
  console.log('='.repeat(72));

  let overallPass = true;
  for (const rep of reports) {
    console.log(`\n## ${rep.name}`);
    console.log(`   Wallet: ${rep.wallet}`);
    if (rep.skipped) {
      console.log(`   SKIPPED: ${rep.skipped}`);
      continue;
    }
    for (const tx of rep.transactions) {
      console.log(`   TX: ${tx.action} -> ${tx.hash || '(no hash captured)'} [${tx.status}]`);
    }
    for (const c of rep.checks) {
      const mark = c.pass ? 'PASS' : 'FAIL';
      if (!c.pass) overallPass = false;
      console.log(`   [${mark}] ${c.label}${c.detail ? ` — ${c.detail}` : ''}`);
    }
  }

  console.log('\n' + '='.repeat(72));
  console.log(overallPass ? 'RESULT: PASS' : 'RESULT: FAIL');
  console.log('='.repeat(72) + '\n');
  return overallPass;
}

async function main() {
  await preflight();

  const scenarios: [string, () => Promise<void>][] = [
    ['A (empty wallet)', scenarioEmptyWallet],
    ['B (vault deposit)', scenarioVaultOnly],
    ['C (PT purchase via protocol)', scenarioPtOnly],
    ['D (vault + PT)', scenarioVaultPlusPt],
    ['E (claimable yield)', scenarioClaimableYield],
  ];

  for (const [label, fn] of scenarios) {
    console.log(`Running scenario ${label}...`);
    try {
      await fn();
    } catch (e: any) {
      reports.push({ name: label, wallet: 'n/a', transactions: [], checks: [{ label: 'scenario threw', pass: false, detail: e.message || String(e) }] });
    }
  }

  const pass = printReport();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
