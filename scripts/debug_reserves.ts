import { fileURLToPath } from 'url';
import { dirname } from 'path';

function unwrapResult(rawResult: any): any {
  if (rawResult !== undefined && typeof rawResult === 'object' && rawResult !== null) {
    if (typeof rawResult.unwrap === 'function') return rawResult.unwrap();
    if ('ok' in rawResult) return rawResult.ok;
    if ('value' in rawResult) return rawResult.value;
  }
  return rawResult;
}

async function run() {
  const { Client: MarketplaceClient } = await import('../packages/bindings/marketplace/src/index');
  const { Client: TokenizerClient } = await import('../packages/bindings/tokenizer/src/index');
  const { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } = await import('../src/config/contracts');

  const clientOptions = {
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  };

  const marketClient = new MarketplaceClient({ ...clientOptions, contractId: CONTRACTS.MARKETPLACE });
  const tokenizerClient = new TokenizerClient({ ...clientOptions, contractId: CONTRACTS.TOKENIZER });

  const reservesTx = await marketClient.get_reserves();
  const reserves = unwrapResult(reservesTx.result);
  const ptReserves = Number(reserves[0]);
  const underlyingReserves = Number(reserves[1]);
  const ytReserves = Number(reserves[2]);
  
  const ptPriceTx = await marketClient.get_pt_price();
  const ptSpotPrice = Number(unwrapResult(ptPriceTx.result)) / 1e9;
  
  const twapTx = await marketClient.get_twap_rate();
  const ptTwapPrice = Number(unwrapResult(twapTx.result)) / 1e9;
  
  const metaTx = await tokenizerClient.metadata();
  const metadata = unwrapResult(metaTx.result);
  const maturityLedger = Number(metadata.maturity_ledger || 0);

  let currentLedger = 0;
  const res = await fetch('https://horizon-testnet.stellar.org/');
  if (res.ok) {
    const horizonData = await res.json();
    currentLedger = Number(horizonData.history_latest_ledger || horizonData.core_latest_ledger);
  }
  
  console.log("=== On-Chain Marketplace Reserves ===");
  console.log(`PT Reserves: ${ptReserves}`);
  console.log(`Underlying Reserves: ${underlyingReserves}`);
  console.log(`YT Reserves: ${ytReserves}`);
  console.log(`PT Spot Price: ${ptSpotPrice.toFixed(6)}`);
  console.log(`PT TWAP Price: ${ptTwapPrice.toFixed(6)}`);
  console.log(`Current Ledger: ${currentLedger}`);
  console.log(`Maturity Ledger: ${maturityLedger}`);
  
  const ptExpected = 999500000;
  const undExpected = 1000000000;
  console.log(`\n=== Verification ===`);
  console.log(`Expected PT (from bootstrap): ${ptExpected}`);
  console.log(`Actual PT: ${ptReserves}`);
  console.log(`Match? ${ptExpected === ptReserves ? 'YES' : 'NO'}`);
  console.log(`Expected Underlying: ${undExpected}`);
  console.log(`Actual Underlying: ${underlyingReserves}`);
  console.log(`Match? ${undExpected === underlyingReserves ? 'YES' : 'NO'}`);
}

run().catch(console.error);
