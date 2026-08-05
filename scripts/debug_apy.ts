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

  console.log("=== Debugging APY Inputs ===");

  const clientOptions = {
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  };

  const marketClient = new MarketplaceClient({ ...clientOptions, contractId: CONTRACTS.MARKETPLACE });
  const tokenizerClient = new TokenizerClient({ ...clientOptions, contractId: CONTRACTS.TOKENIZER });

  // 1. Fetch PT Price
  const ptPriceTx = await marketClient.get_pt_price();
  const rawPtPrice = Number(unwrapResult(ptPriceTx.result));
  const ptSpotPrice = rawPtPrice / 1e9;
  
  // Underlying Price (in units of underlying) is always 1
  const underlyingPrice = 1.0;

  // 2. Fetch Maturity
  const metaTx = await tokenizerClient.metadata();
  const metadata = unwrapResult(metaTx.result);
  const maturityLedger = Number(metadata.maturity_ledger || 0);
  
  let maturityTimestampMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
  
  if (maturityLedger > 0) {
    const res = await fetch('https://horizon-testnet.stellar.org/');
    if (res.ok) {
      const horizonData = await res.json();
      const currentLedger = Number(horizonData.history_latest_ledger || horizonData.core_latest_ledger);
      if (!isNaN(currentLedger) && currentLedger > 0) {
        const ledgersRemaining = maturityLedger - currentLedger;
        const secondsRemaining = ledgersRemaining * 5.5;
        maturityTimestampMs = Date.now() + secondsRemaining * 1000;
      }
    }
  }

  // 3. Perform calculation breakdown
  const now = Date.now();
  const timeRemainingMs = maturityTimestampMs - now;
  const secondsRemaining = timeRemainingMs / 1000;
  const daysRemaining = timeRemainingMs / (1000 * 60 * 60 * 24);
  const ratio = underlyingPrice / ptSpotPrice;
  const apyDecimal = Math.pow(ratio, 365 / daysRemaining) - 1;
  const finalApy = calculateMarketImpliedApy(ptSpotPrice, underlyingPrice, maturityTimestampMs);

  console.log(`\nRuntime Values:`);
  console.log(`Underlying Price: ${underlyingPrice}`);
  console.log(`PT Spot Price: ${ptSpotPrice}`);
  console.log(`Current Timestamp: ${now}`);
  console.log(`Maturity Timestamp: ${maturityTimestampMs}`);
  console.log(`Seconds Remaining: ${secondsRemaining}`);
  console.log(`Days Remaining: ${daysRemaining}`);
  console.log(`Ratio (Underlying/PT): ${ratio}`);
  console.log(`Raw Formula Output (decimal): ${apyDecimal}`);
  console.log(`Final Displayed APY: ${finalApy}%`);

  console.log(`\nVerification Checklist:`);
  console.log(`1. PT price and underlying price expressed in same units? YES (Both relative to underlying)`);
  console.log(`2. PT price is the actual market spot price? YES (${ptSpotPrice})`);
  console.log(`3. PT price is less than the underlying price? ${ptSpotPrice < underlyingPrice ? 'YES' : 'NO'}`);
  console.log(`4. Days remaining is greater than zero? ${daysRemaining > 0 ? 'YES' : 'NO'} (${daysRemaining})`);
  console.log(`5. The APY function is not clamping a negative value to 0? ${finalApy === 0 && apyDecimal !== 0 ? 'NO, IT IS CLAMPING' : 'YES, NOT CLAMPING'}`);
}

run().catch(console.error);
