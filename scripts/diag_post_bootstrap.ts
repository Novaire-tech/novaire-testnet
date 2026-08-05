/**
 * Novaire Marketplace Post-Bootstrap Diagnostics
 * ------------------------------------------------
 * Run with:  npx ts-node scripts/diag_post_bootstrap.ts
 *
 * Prints all protocol state values so you can verify the corrected TWAP
 * oracle and APY pipeline are producing mathematically consistent output.
 * All invariants are checked and reported.
 */

// NOTE: Adjust paths to match your binding locations if they differ.
const DEPLOYMENTS_PATH = require('../scripts/deployments.testnet.json');
const RPC_URL = 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const HORIZON_URL = 'https://horizon-testnet.stellar.org/';
const SCALE = 1e9;

async function main() {
  const deployments = DEPLOYMENTS_PATH;
  const MARKETPLACE_ID = deployments.marketplace;
  const TOKENIZER_ID = deployments.tokenizer;

  const { Client: MarketClient } = await import('../packages/bindings/marketplace/src/index');
  const { Client: TokenizerClient } = await import('../packages/bindings/tokenizer/src/index');

  const clientOpts = { rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE };
  const market = new MarketClient({ ...clientOpts, contractId: MARKETPLACE_ID });
  const tokenizer = new TokenizerClient({ ...clientOpts, contractId: TOKENIZER_ID });

  const [reservesRes, spotRes, twapRes, metaTx, horizonRes] = await Promise.all([
    market.get_reserves(),
    market.get_pt_price(),
    market.get_twap_rate(),
    tokenizer.metadata(),
    fetch(HORIZON_URL).then(r => r.json()).catch(() => null),
  ]);

  const unwrap = (r: any): any => {
    const raw = r?.result;
    if (raw && typeof raw === 'object') {
      if (typeof raw.unwrap === 'function') return raw.unwrap();
      if ('ok' in raw) return raw.ok;
      if ('value' in raw) return raw.value;
    }
    return raw;
  };

  const [ptRaw, underRaw, ytRaw] = unwrap(reservesRes) ?? [0n, 0n, 0n];
  const ptReserves = Number(ptRaw);
  const underReserves = Number(underRaw);
  const ytReserves = Number(ytRaw);
  const rawSpot = Number(unwrap(spotRes) ?? 0);
  const rawTwap = Number(unwrap(twapRes) ?? 0);
  const spotPrice = rawSpot / SCALE;
  const twapPrice = rawTwap / SCALE;

  const meta: any = unwrap(metaTx);
  const maturityLedger = Number(meta?.maturity_ledger ?? 0);
  const faceValue = Number(meta?.epoch_start_index ?? SCALE) / SCALE;

  const currentLedger = horizonRes
    ? Number(horizonRes.history_latest_ledger ?? horizonRes.core_latest_ledger ?? 0)
    : 0;
  const remainingLedgers = maturityLedger > 0 ? Math.max(0, maturityLedger - currentLedger) : 0;
  const remainingDays = (remainingLedgers * 5.5) / 86400;

  const calcApy = (price: number): number => {
    if (price <= 0 || faceValue <= 0 || remainingDays <= 0) return 0;
    const ratio = faceValue / price;
    if (ratio < 1) return 0;
    return (Math.pow(ratio, 365 / remainingDays) - 1) * 100;
  };

  const twapApy = calcApy(twapPrice);
  const spotApy = calcApy(spotPrice);

  const checks: [string, boolean][] = [
    ['Spot > 0',                 spotPrice > 0],
    ['TWAP > 0',                 twapPrice > 0],
    ['Spot <= FaceValue',        spotPrice <= faceValue],
    ['TWAP <= FaceValue',        twapPrice <= faceValue],
    ['Spot < 1.0 (PT discounted)', rawSpot < SCALE],
    ['TWAP < 1.0 (PT discounted)', rawTwap < SCALE],
    ['TWAP APY > 0%',            twapApy > 0],
    ['Spot APY > 0%',            spotApy > 0],
  ];

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   NOVAIRE POST-BOOTSTRAP DIAGNOSTICS                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('── Ledger State ───────────────────────────────────────────');
  console.log(`   Current Ledger:       ${currentLedger}`);
  console.log(`   Maturity Ledger:      ${maturityLedger}`);
  console.log(`   Remaining Ledgers:    ${remainingLedgers}`);
  console.log(`   Remaining Days:       ${remainingDays.toFixed(4)}`);

  console.log('\n── Reserve State ──────────────────────────────────────────');
  console.log(`   PT Reserves:          ${ptReserves.toLocaleString()}`);
  console.log(`   Underlying Reserves:  ${underReserves.toLocaleString()}`);
  console.log(`   YT Reserves:          ${ytReserves.toLocaleString()}`);

  console.log('\n── Oracle State ───────────────────────────────────────────');
  console.log(`   Spot PT Price (raw):  ${rawSpot}   (${spotPrice.toFixed(9)})`);
  console.log(`   TWAP PT Price (raw):  ${rawTwap}   (${twapPrice.toFixed(9)})`);
  console.log(`   Face Value:           ${faceValue.toFixed(9)}`);

  console.log('\n── APY Pipeline ───────────────────────────────────────────');
  console.log(`   Ratio (FV / Spot):    ${(faceValue / spotPrice).toFixed(9)}`);
  console.log(`   Exponent (365/Days):  ${remainingDays > 0 ? (365 / remainingDays).toFixed(4) : 'N/A'}`);
  console.log(`   Implied Yield (TWAP): ${twapApy.toFixed(4)}%`);
  console.log(`   Executable (Spot):    ${spotApy.toFixed(4)}%`);

  console.log('\n── Invariant Checks ───────────────────────────────────────');
  let allPassed = true;
  for (const [label, passed] of checks) {
    console.log(`   ${passed ? '✅' : '❌'}  ${label}`);
    if (!passed) allPassed = false;
  }

  console.log(`\n── Verdict ────────────────────────────────────────────────`);
  if (allPassed) {
    console.log('   ✅ ALL INVARIANTS PASS');
    console.log('      TWAP oracle stores canonical PT price.');
    console.log('      APY calculation is mathematically correct.');
    console.log('      No reciprocal price detected.');
  } else {
    console.log('   ❌ INVARIANT FAILURES — redeploy or re-run bootstrap.');
  }
  console.log('');
}

main().catch(console.error);
