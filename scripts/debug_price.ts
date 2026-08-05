import { Client as MarketplaceClient } from '../packages/bindings/marketplace/src/index';
import { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } from '../src/config/contracts';

function unwrapResult(rawResult: any): any {
  if (rawResult !== undefined && typeof rawResult === 'object' && rawResult !== null) {
    if (typeof rawResult.unwrap === 'function') return rawResult.unwrap();
    if ('ok' in rawResult) return rawResult.ok;
    if ('value' in rawResult) return rawResult.value;
  }
  return rawResult;
}

async function run() {
  console.log("=== Auditing PT Pricing Pipeline ===");

  const clientOptions = {
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  };

  const marketClient = new MarketplaceClient({ ...clientOptions, contractId: CONTRACTS.MARKETPLACE });

  console.log("\n1. Fetching reserves from Marketplace Contract...");
  const reservesTx = await marketClient.get_reserves();
  const rawReserves = unwrapResult(reservesTx.result);
  console.log("Raw get_reserves() output:", rawReserves);

  let ptReserve = 0;
  let underlyingReserve = 0;
  let ytReserve = 0;

  if (Array.isArray(rawReserves) && rawReserves.length >= 3) {
    ptReserve = Number(rawReserves[0]);
    underlyingReserve = Number(rawReserves[1]);
    ytReserve = Number(rawReserves[2]);
  }

  console.log("\n2. Interpreting Reserves (assumed 1e7 decimal scaling on Stellar):");
  console.log(`PT Reserve: ${ptReserve} raw => ${ptReserve / 1e7} scaled`);
  console.log(`Underlying Reserve: ${underlyingReserve} raw => ${underlyingReserve / 1e7} scaled`);
  console.log(`YT Reserve: ${ytReserve} raw => ${ytReserve / 1e7} scaled`);

  console.log("\n3. Intermediate AMM calculations:");
  // A standard AMM would price PT as underlyingReserve / ptReserve or similar
  const derivedPtPrice = ptReserve > 0 ? underlyingReserve / ptReserve : 0;
  console.log(`Derived PT Price (Underlying / PT reserve ratio): ${derivedPtPrice}`);

  console.log("\n4. Fetching PT Spot Price directly from Contract:");
  const ptPriceTx = await marketClient.get_pt_price();
  const rawPtPrice = Number(unwrapResult(ptPriceTx.result));
  console.log(`Raw get_pt_price() output: ${rawPtPrice}`);

  const ptSpotPrice = rawPtPrice / 1e9; // 9 decimals expected
  console.log(`Decimal scaled (1e9): ${ptSpotPrice}`);
}

run().catch(console.error);
