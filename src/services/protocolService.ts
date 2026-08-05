import { PriceOracleService } from './priceOracleService';

export interface ProtocolState {
  tvlXlm: number;
  tvlUsd: number;
  totalDepositsXlm: number;
  ptSupplyXlm: number;
  ytSupplyXlm: number;
  dexLiquidityXlm: number;
  impliedYieldApy: number;
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
      totalDepositsXlm: 0,
      ptSupplyXlm: 0,
      ytSupplyXlm: 0,
      dexLiquidityXlm: 0,
      impliedYieldApy: 0,
      executableApy: 0,
      ptPriceUnderlying: 1.0,
    };

    try {
      // Dynamic imports to match portfolioService architecture
      const { Client: PtClient } = await import('../../packages/bindings/pt_token/src/index');
      const { Client: YtClient } = await import('../../packages/bindings/yt_token/src/index');
      const { Client: VaultClient } = await import('../../packages/bindings/vault/src/index');
      const { Client: MarketplaceClient } = await import('../../packages/bindings/marketplace/src/index');
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
        marketClient.get_twap_rate()
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
      const rawTwap = twapRes.status === 'fulfilled' ? Number(this.unwrapResult(twapRes.value.result)) : 0;
      
      if (!isNaN(rawPtPrice) && rawPtPrice > 0) {
        ptPriceUnderlying = rawPtPrice / 1e9;
        
        const { YieldService } = await import('./yieldService');
        const [maturityTimestampMs, ptFaceValueInUnderlying] = await Promise.all([
          YieldService.getActiveMaturityTimestampMs(),
          YieldService.getEpochStartIndex()
        ]);
        
        const { calculateMarketImpliedApy } = await import('../utils/apy');
        
        // Executable APY (Spot Price)
        console.log(`[Novaire Price Debug - Spot] PT Price: ${ptPriceUnderlying.toFixed(6)}`);
        executableApy = calculateMarketImpliedApy(ptPriceUnderlying, ptFaceValueInUnderlying, maturityTimestampMs);
        
        // Primary Implied Yield APY (TWAP, fallback to Spot if TWAP uninitialized)
        const twapUnderlying = (!isNaN(rawTwap) && rawTwap > 0) ? rawTwap / 1e9 : ptPriceUnderlying;
        console.log(`[Novaire Price Debug - TWAP] TWAP Price: ${twapUnderlying.toFixed(6)}`);
        impliedYieldApy = calculateMarketImpliedApy(twapUnderlying, ptFaceValueInUnderlying, maturityTimestampMs);
      }

      // XLM Price for TVL calculation
      let xlmPriceUsd = 0.1; // Fallback
      try {
        const priceData = await PriceOracleService.getAssetPrice('XLM');
        if (priceData && priceData.priceUsd) {
          xlmPriceUsd = priceData.priceUsd;
        }
      } catch (e) {
        console.warn("Could not fetch XLM price");
      }

      // TVL = Total Deposits (Vault) + DEX Underlying Reserves
      const tvlXlm = totalDepositsXlm + (dexLiquidityXlm / 2);
      const tvlUsd = tvlXlm * xlmPriceUsd;

      return {
        tvlXlm,
        tvlUsd,
        totalDepositsXlm,
        ptSupplyXlm,
        ytSupplyXlm,
        dexLiquidityXlm,
        impliedYieldApy,
        executableApy,
        ptPriceUnderlying
      };
    } catch (e) {
      console.error('Failed to fetch protocol state:', e);
      return defaultState;
    }
  }
}
