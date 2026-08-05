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
  const { calculateMarketImpliedApy } = await import('../src/utils/apy');

  const clientOptions = {
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  };

  const marketClient = new MarketplaceClient({ ...clientOptions, contractId: CONTRACTS.MARKETPLACE });
  const tokenizerClient = new TokenizerClient({ ...clientOptions, contractId: CONTRACTS.TOKENIZER });

  const ptPriceTx = await marketClient.get_pt_price();
  const ptSpotPrice = Number(unwrapResult(ptPriceTx.result)) / 1e9;
  
  const twapTx = await marketClient.get_twap_rate();
  const ptTwapPrice = Number(unwrapResult(twapTx.result)) / 1e9;
  
  const metaTx = await tokenizerClient.metadata();
  const metadata = unwrapResult(metaTx.result);
  const maturityLedger = Number(metadata.maturity_ledger || 0);
  const faceValue = Number(metadata.epoch_start_index || 0) / 1e9; // 9 decimals probably, let's just use 1.0 if 0
  const actualFaceValue = faceValue > 0 ? faceValue : 1.0;

  let currentLedger = 0;
  const res = await fetch('https://horizon-testnet.stellar.org/');
  if (res.ok) {
    const horizonData = await res.json();
    currentLedger = Number(horizonData.history_latest_ledger || horizonData.core_latest_ledger);
  }
  
  const remainingLedgers = maturityLedger - currentLedger;
  const secondsRemaining = remainingLedgers * 5.5;
  const remainingDays = secondsRemaining / (60 * 60 * 24);
  const ratioTwap = actualFaceValue / ptTwapPrice;
  const ratioSpot = actualFaceValue / ptSpotPrice;
  const exponent = 365 / remainingDays;
  
  const twapApyDecimal = Math.pow(ratioTwap, exponent) - 1;
  const spotApyDecimal = Math.pow(ratioSpot, exponent) - 1;

  console.log("=== Novaire APY Debug Logs ===");
  console.log(`currentLedger: ${currentLedger}`);
  console.log(`maturityLedger: ${maturityLedger}`);
  console.log(`remainingLedgers: ${remainingLedgers}`);
  console.log(`remainingDays: ${remainingDays.toFixed(6)}`);
  console.log(`PT spot price: ${ptSpotPrice.toFixed(6)}`);
  console.log(`PT TWAP price: ${ptTwapPrice.toFixed(6)}`);
  console.log(`face value (epoch start index): ${actualFaceValue.toFixed(6)}`);
  
  console.log(`\n--- TWAP (Primary Yield) ---`);
  console.log(`ratio (faceValue / PT TWAP price): ${ratioTwap.toFixed(6)}`);
  console.log(`annualization exponent (365 / remainingDays): ${exponent.toFixed(6)}`);
  console.log(`final APY: ${(twapApyDecimal * 100).toFixed(4)}%`);
  
  console.log(`\n--- Spot (Executable Yield) ---`);
  console.log(`ratio (faceValue / PT spot price): ${ratioSpot.toFixed(6)}`);
  console.log(`annualization exponent (365 / remainingDays): ${exponent.toFixed(6)}`);
  console.log(`final APY: ${(spotApyDecimal * 100).toFixed(4)}%`);
}

run().catch(console.error);
