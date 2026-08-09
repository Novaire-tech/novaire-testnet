/**
 * Calculates the market-implied Fixed APY based on the zero-coupon bond formula.
 * 
 * Formula: APY = (PTFaceValue / PTPrice) ^ (365 / DaysRemaining) - 1
 * 
 * @param ptPriceInUnderlying The spot price of 1 PT in terms of the Underlying asset.
 * @param ptFaceValueInUnderlying The guaranteed redemption value of 1 PT at maturity in terms of Underlying.
 * @param maturityTimestampMs The exact epoch maturity timestamp in milliseconds.
 * @returns The implied APY as a percentage (e.g., 5.2 for 5.2%).
 */
export function calculateMarketImpliedApy(ptPriceInUnderlying: number, ptFaceValueInUnderlying: number, maturityTimestampMs: number): number {
  if (ptPriceInUnderlying <= 0 || isNaN(ptPriceInUnderlying) || ptFaceValueInUnderlying <= 0 || isNaN(ptFaceValueInUnderlying)) return 0;
  
  const now = Date.now();
  const timeRemainingMs = maturityTimestampMs - now;
  
  // If we've passed maturity, APY is technically 0 for new positions
  if (timeRemainingMs <= 0) return 0;
  
  // Clamp daysRemaining to 1.0 minimum to prevent astronomical APY spikes 
  // on testnet where maturity may be extremely close (e.g., 1.5 hours).
  const rawDays = timeRemainingMs / (1000 * 60 * 60 * 24);
  const daysRemaining = Math.max(1.0, rawDays);
  
  const ratio = ptFaceValueInUnderlying / ptPriceInUnderlying;
  
  // If ratio < 1 (PT is somehow more expensive than face value), APY is technically negative or zero.
  if (ratio < 1) return 0;
  
  const apyDecimal = Math.pow(ratio, 365 / daysRemaining) - 1;
  const apy = isNaN(apyDecimal) ? 0 : apyDecimal * 100;

  return apy;
}
