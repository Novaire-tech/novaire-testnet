import { PriceOracleService } from './priceOracleService';

export interface ProtocolState {
  tvlXlm: number;
  tvlUsd: number;
  /** True when the XLM/USD oracle could not be read. tvlUsd is meaningless (0) in this case — never display it as a real dollar value. */
  priceUnavailable: boolean;
  totalDepositsXlm: number;
  ptSupplyXlm: number;
  ytSupplyXlm: number;
  dexLiquidityXlm: number;
  impliedYieldApy: number;
  /** True when the on-chain TWAP checkpoint is stale (older than MAX_TWAP_AGE_LEDGERS). impliedYieldApy is 0 and must not be treated as real in this case. */
  twapStale: boolean;
  executableApy: number;
  ptPriceUnderlying: number;
}

export class ProtocolService {
  /**
   * Helper to unwrap Soroban Result types
   */
  private static unwrapResult(rawResult: any): any {
    if (rawResult !== undefined && typeof rawResult === 'object' && rawResult !== null) {
      if (typeof rawResult.unwrap === 'function') return rawResult.unwrap();
      if ('ok' in rawResult) return rawResult.ok;
      if ('value' in rawResult) return rawResult.value;
    }
    return rawResult;
  }

  static async getProtocolState(): Promise<ProtocolState> {
    const defaultState: ProtocolState = {
      tvlXlm: 0,
      tvlUsd: 0,
      priceUnavailable: true,
      totalDepositsXlm: 0,
      ptSupplyXlm: 0,
      ytSupplyXlm: 0,
      dexLiquidityXlm: 0,
      impliedYieldApy: 0,
      twapStale: true,
      executableApy: 0,
      ptPriceUnderlying: 1.0,
    };

    try {
      // Dynamic imports to match portfolioService architecture
      const { Client: PtClient } = await import('../../../../packages/bindings/pt_token/src/index');
      const { Client: YtClient } = await import('../../../../packages/bindings/yt_token/src/index');
      const { Client: VaultClient } = await import('../../../../packages/bindings/vault/src/index');
      const { Client: MarketplaceClient } = await import('../../../../packages/bindings/marketplace/src/index');
      const { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } = await import('../config/contracts');

      const clientOptions = {
        rpcUrl: RPC_URL,
        networkPassphrase: NETWORK_PASSPHRASE,
      };

      const ptClient = new PtClient({ ...clientOptions, contractId: CONTRACTS.PT_TOKEN });
      const ytClient = new YtClient({ ...clientOptions, contractId: CONTRACTS.YT_TOKEN });
      const vaultClient = new VaultClient({ ...clientOptions, contractId: CONTRACTS.VAULT });
      const marketClient = new MarketplaceClient({ ...clientOptions, contractId: CONTRACTS.MARKETPLACE });

      // Fetch all state concurrently
      const [
        ptSupplyRes,
        ytSupplyRes,
        vaultSharesRes,
        reservesRes,
        ptPriceRes,
        twapRes
      ] = await Promise.allSettled([
        ptClient.total_supply(),
        ytClient.total_supply(),
        vaultClient.total_vault_shares(),
        marketClient.get_reserves(),
        marketClient.get_pt_price(),
        marketClient.get_twap_rate_checked()
      ]);

      // Parse Results
      const ptSupplyXlm = ptSupplyRes.status === 'fulfilled' ? Number(this.unwrapResult(ptSupplyRes.value.result) || 0) / 1e7 : 0;
      const ytSupplyXlm = ytSupplyRes.status === 'fulfilled' ? Number(this.unwrapResult(ytSupplyRes.value.result) || 0) / 1e7 : 0;
      const totalDepositsXlm = vaultSharesRes.status === 'fulfilled' ? Number(this.unwrapResult(vaultSharesRes.value.result) || 0) / 1e7 : 0;

      let dexLiquidityXlm = 0;
      if (reservesRes.status === 'fulfilled') {
        const reserves = this.unwrapResult(reservesRes.value.result);
        if (Array.isArray(reserves) && reserves.length >= 2) {
          // reserves[1] is underlying_reserve. Assuming 50/50 AMM, total liquidity = underlying * 2
          const underlyingReserve = Number(reserves[1]) / 1e7;
          dexLiquidityXlm = underlyingReserve * 2;
        }
      }

      let ptPriceUnderlying = 1.0;
      let impliedYieldApy = 0;
      let executableApy = 0;

      const rawPtPrice = ptPriceRes.status === 'fulfilled' ? Number(this.unwrapResult(ptPriceRes.value.result)) : 0;

      // get_twap_rate_checked reverts (InvariantViolated) when the on-chain TWAP
      // checkpoint is older than MAX_TWAP_AGE_LEDGERS. Treat that — and any failure
      // to reach the contract — as "stale", never fabricate an implied APY from it.
      let rawTwap = 0;
      let twapStale = true;
      if (twapRes.status === 'fulfilled') {
        try {
          rawTwap = Number(this.unwrapResult(twapRes.value.result));
          twapStale = false;
        } catch {
          console.warn('TWAP is stale or unavailable (get_twap_rate_checked reverted)');
        }
      }

      if (!isNaN(rawPtPrice) && rawPtPrice > 0) {
        ptPriceUnderlying = rawPtPrice / 1e9;

        const { YieldService } = await import('./yieldService');
        const [maturityTimestampMs, ptFaceValueInUnderlying] = await Promise.all([
          YieldService.getActiveMaturityTimestampMs(),
          YieldService.getEpochStartIndex()
        ]);

        const { calculateMarketImpliedApy } = await import('../utils/apy');

        // Executable APY (Spot Price) — priced off live curve state, unaffected by TWAP freshness.
        executableApy = calculateMarketImpliedApy(ptPriceUnderlying, ptFaceValueInUnderlying, maturityTimestampMs);

        // Primary Implied Yield APY: only derived from TWAP when the checkpoint is fresh.
        // A stale TWAP must never be used to compute a displayed APY.
        if (!twapStale && !isNaN(rawTwap) && rawTwap > 0) {
          const twapUnderlying = rawTwap / 1e9;
          impliedYieldApy = calculateMarketImpliedApy(twapUnderlying, ptFaceValueInUnderlying, maturityTimestampMs);
        } else {
          impliedYieldApy = 0;
        }
      }

      // XLM Price for TVL calculation. Never fabricate a price: if the oracle is
      // unavailable, tvlUsd must be surfaced as unavailable, not computed from a guess.
      let xlmPriceUsd = 0;
      let priceUnavailable = true;
      try {
        const priceData = await PriceOracleService.getAssetPrice('XLM');
        if (priceData && priceData.priceUsd > 0) {
          xlmPriceUsd = priceData.priceUsd;
          priceUnavailable = false;
        }
      } catch {
        console.warn('Could not fetch XLM price: oracle unavailable');
      }

      // TVL = Total Deposits (Vault) + DEX Underlying Reserves
      const tvlXlm = totalDepositsXlm + (dexLiquidityXlm / 2);
      const tvlUsd = priceUnavailable ? 0 : tvlXlm * xlmPriceUsd;

      return {
        tvlXlm,
        tvlUsd,
        priceUnavailable,
        totalDepositsXlm,
        ptSupplyXlm,
        ytSupplyXlm,
        dexLiquidityXlm,
        impliedYieldApy,
        twapStale,
        executableApy,
        ptPriceUnderlying
      };
    } catch (e) {
      console.error('Failed to fetch protocol state:', e);
      return defaultState;
    }
  }
}
