import { WalletService, WalletAssetBalance } from './walletService';
import { PriceOracleService } from './priceOracleService';
import { YieldService } from './yieldService';

export interface PortfolioAsset {
  assetCode: string;
  issuer: string | null;
  balance: number;
  priceUsd: number;
  valueUsd: number;
  allocationPercent: number;
  isNative: boolean;
  // Extensibility hooks for future types of balances
  assetType: 'wallet' | 'pt' | 'yt' | 'vault' | 'yield';
  claimableYield?: number;
}

export interface PortfolioAllocation {
  assetCode: string;
  valueUsd: number;
  percentage: number;
}

export interface PortfolioMetrics {
  totalAssets: number;
  largestHoldingAsset: string | null;
  largestHoldingValue: number;
  activePositions: number;
  totalInvestedUsd: number;
  totalInvestedXlm: number;
  totalClaimableYieldUsd: number;
  totalClaimableYieldXlm: number;
  totalWalletUsd: number;
  totalVaultLpUsd: number;
}

export interface PortfolioSummary {
  totalValueUsd: number;
  totalValueXlm: number;
  assets: PortfolioAsset[];
  allocation: PortfolioAllocation[];
  metrics: PortfolioMetrics;
  error: string | null;
}

export class PortfolioService {
  /**
   * Retrieves the comprehensive portfolio combining wallet balances with live prices.
   * Future extensibility: Will merge Vault positions, PT/YT tokens, and Yield here.
   */
  static async getPortfolio(): Promise<PortfolioSummary> {
    try {
      const address = await WalletService.getWalletAddress();
      if (!address) {
        return this.emptyPortfolio('Wallet not connected');
      }

      let rawBalances: WalletAssetBalance[] = [];
      try {
        rawBalances = await WalletService.getBalances();
      } catch {
        return this.emptyPortfolio('Failed to fetch wallet balances');
      }

      const assets: PortfolioAsset[] = [];
      let totalValueUsd = 0;

      // Map over all balances and inject pricing
      for (const bal of rawBalances) {
        const balanceFloat = parseFloat(bal.amount) || 0;
        
        let priceUsd = 0;
        try {
          const priceData = await PriceOracleService.getAssetPrice(bal.assetCode);
          if (priceData && typeof priceData.priceUsd === 'number' && !isNaN(priceData.priceUsd)) {
            priceUsd = priceData.priceUsd;
          }
        } catch {
          console.warn(`Price API unavailable for ${bal.assetCode}, defaulting to 0`);
        }

        const valueUsd = (!isNaN(balanceFloat) && !isNaN(priceUsd)) ? balanceFloat * priceUsd : 0;

        assets.push({
          assetCode: bal.assetCode,
          issuer: bal.issuer,
          balance: balanceFloat,
          priceUsd,
          valueUsd,
          allocationPercent: 0,
          isNative: bal.isNative,
          assetType: 'wallet'
        });
      }

      // Fetch protocol positions DIRECTLY from on-chain contracts (bypassing broken Indexer/DB)
      try {
        const { Client: PtClient } = await import('../../../../packages/bindings/pt_token/src/index');
        const { Client: YtClient } = await import('../../../../packages/bindings/yt_token/src/index');
        const { Client: VaultClient } = await import('../../../../packages/bindings/vault/src/index');
        const { Client: MarketplaceClient } = await import('../../../../packages/bindings/marketplace/src/index');
        const { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } = await import('../config/contracts');

        const clientOptions = {
          rpcUrl: RPC_URL,
          networkPassphrase: NETWORK_PASSPHRASE,
          publicKey: address,
        };

        const ptClient = new PtClient({ ...clientOptions, contractId: CONTRACTS.PT_TOKEN });
        const ytClient = new YtClient({ ...clientOptions, contractId: CONTRACTS.YT_TOKEN });
        const vaultClient = new VaultClient({ ...clientOptions, contractId: CONTRACTS.VAULT });
        const marketplaceClient = new MarketplaceClient({ ...clientOptions, contractId: CONTRACTS.MARKETPLACE });

        const epochId = 'Epoch 17';
        const underlyingAsset = 'XLM'; // Configured underlying for Epoch 17

        // Get XLM spot price
        let underlyingSpotUsd = 0;
        try {
          const priceData = await PriceOracleService.getAssetPrice('XLM');
          if (priceData && typeof priceData.priceUsd === 'number' && !isNaN(priceData.priceUsd)) {
            underlyingSpotUsd = priceData.priceUsd;
          }
        } catch {
          console.warn("Could not fetch XLM price");
        }

        // Fetch vault data to calculate unified claimable yield
        let activeVaults: any[] = [];
        try {
          activeVaults = await YieldService.getVaults();
        } catch (e) {
          console.warn("Could not fetch vaults for yield calculation", e);
        }
        
        // Helper to get fixed APY for an underlying asset
        const getVaultApy = (asset: string) => {
          const vault = activeVaults.find(v => (Array.isArray(v.asset) ? v.asset.includes(asset) : v.asset === asset));
          return vault?.fixedApy || 0;
        };

        // Get PT spot price from the Marketplace AMM
        // Contract returns (A_pool + underlying) / (A_pool + pt) scaled to 1e9
        // This is pt-per-underlying. Invert to get underlying-per-pt.
        let ptSpotPriceUnderlying = 0; // strict zero default if no AMM reserve exists
        let ytSpotPriceUnderlying = 0;
        try {
          const priceTx = await marketplaceClient.get_pt_price();
          let rawResult: any = priceTx?.result;
          
          if (rawResult !== undefined) {
             // Soroban clients sometimes return Result types as { ok: value }
             if (typeof rawResult === 'object' && rawResult !== null) {
               if (typeof rawResult.unwrap === 'function') rawResult = rawResult.unwrap();
               else if ('ok' in rawResult) rawResult = rawResult.ok;
             }
             
             const parsedNumber = Number(rawResult);
             if (!isNaN(parsedNumber) && parsedNumber > 0) {
               const rawContractPrice = parsedNumber / 1_000_000_000;
               // Contract now correctly returns underlying-per-pt directly
               ptSpotPriceUnderlying = rawContractPrice;
               ytSpotPriceUnderlying = Math.max(0, 1.0 - ptSpotPriceUnderlying);
             }
          }
        } catch (e) {
          console.warn("Marketplace PT price fetch error", e);
        }

        const ptPriceUsd = (!isNaN(ptSpotPriceUnderlying) && !isNaN(underlyingSpotUsd)) ? (ptSpotPriceUnderlying * underlyingSpotUsd) : 0;
        const ytPriceUsd = (!isNaN(ytSpotPriceUnderlying) && !isNaN(underlyingSpotUsd)) ? (ytSpotPriceUnderlying * underlyingSpotUsd) : 0;

        // NOTE: Vault LP shares (UserShares) and PT/YT balances are independent on-chain
        // balances (contracts/vault/src/lib.rs UserShares vs pt_token/yt_token's own
        // Balance storage). Tokenizing only burns/transfers the specific share amount
        // passed to mint_pt_yt, so a user can hold untokenized LP AND PT/YT from a partial
        // tokenization, AND PT bought separately on the marketplace (which never touches
        // vault balances at all). These are genuinely separate positions and must both be
        // counted, not treated as alternate representations of the same deposit.
        let realVaultBalanceFloat = 0;
        let realVaultValueUsd = 0;
        try {
          const vaultTx = await vaultClient.balance_of({ user: address });
          let rawVault: any = vaultTx?.result;
          if (rawVault !== undefined) {
             if (typeof rawVault === 'object' && rawVault !== null) {
               if (typeof rawVault.unwrap === 'function') rawVault = rawVault.unwrap();
               else if ('ok' in rawVault) rawVault = rawVault.ok;
               else if ('value' in rawVault) rawVault = rawVault.value;
             }
             const parsedVault = Number(rawVault);
             if (!isNaN(parsedVault) && parsedVault > 0) {
                realVaultBalanceFloat = parsedVault / 10000000;
                realVaultValueUsd = (!isNaN(realVaultBalanceFloat) && !isNaN(underlyingSpotUsd)) ? realVaultBalanceFloat * underlyingSpotUsd : 0;
                if (isNaN(realVaultValueUsd) || !isFinite(realVaultValueUsd)) realVaultValueUsd = 0;
             }
          }
        } catch (e) { console.warn("Vault LP balance fetch error (expected for intent-flow users)", e); }

        // Fetch PT Balance
        // NOTE: The PT token balance represents the user's yield position.
        // We also synthesize a vault entry from it so VaultPositionsTable
        // can display the user's effective vault deposit.
        let ptBalanceFloat = 0;
        let ptValueUsd = 0;
        try {
          const ptTx = await ptClient.balance({ id: address });
          let rawPt: any = ptTx?.result;

          
          if (rawPt !== undefined) {
             if (typeof rawPt === 'object' && rawPt !== null) {
               if (typeof rawPt.unwrap === 'function') rawPt = rawPt.unwrap();
               else if ('ok' in rawPt) rawPt = rawPt.ok;
               else if ('value' in rawPt) rawPt = rawPt.value;
             }
             const parsedPt = Number(rawPt);
             
             if (!isNaN(parsedPt) && parsedPt > 0) {
                ptBalanceFloat = parsedPt / 10000000;
                ptValueUsd = (!isNaN(ptBalanceFloat) && !isNaN(ptPriceUsd)) ? ptBalanceFloat * ptPriceUsd : 0;
                if (isNaN(ptValueUsd) || !isFinite(ptValueUsd)) ptValueUsd = 0;
                totalValueUsd += ptValueUsd;

                // PT position entry (for Yield Positions table)
                assets.push({
                  assetCode: `PT-${underlyingAsset}`,
                  issuer: epochId,
                  balance: ptBalanceFloat,
                  priceUsd: ptPriceUsd,
                  valueUsd: ptValueUsd,
                  allocationPercent: 0,
                  isNative: false,
                  assetType: 'pt'
                });
             }
          }
        } catch (e) { console.warn("PT balance fetch error", e); }

        // Fetch YT Balance
        let ytBalanceFloat = 0;
        let ytValueUsd = 0;
        try {
          const ytTx = await ytClient.balance({ id: address });
          let rawYt: any = ytTx?.result;
          if (rawYt !== undefined) {
             if (typeof rawYt === 'object' && rawYt !== null) {
               if (typeof rawYt.unwrap === 'function') rawYt = rawYt.unwrap();
               else if ('ok' in rawYt) rawYt = rawYt.ok;
               else if ('value' in rawYt) rawYt = rawYt.value;
             }
             const parsedYt = Number(rawYt);
             if (!isNaN(parsedYt) && parsedYt > 0) {
                ytBalanceFloat = parsedYt / 10000000;
                ytValueUsd = (!isNaN(ytBalanceFloat) && !isNaN(ytPriceUsd)) ? ytBalanceFloat * ytPriceUsd : 0;
                if (isNaN(ytValueUsd) || !isFinite(ytValueUsd)) ytValueUsd = 0;
                
                totalValueUsd += ytValueUsd;
                assets.push({
                  assetCode: `YT-${underlyingAsset}`,
                  issuer: epochId,
                  balance: ytBalanceFloat,
                  priceUsd: ytPriceUsd,
                  valueUsd: ytValueUsd,
                  allocationPercent: 0,
                  isNative: false,
                  assetType: 'yt'
                });
             }
          }
        } catch (e) { console.warn("YT balance fetch error", e); }

        // Fetch claimable yield from the YT contract
        let claimableYieldNative = 0;
        try {
          const claimableTx = await ytClient.claimable_yield({ user: address });
          if (claimableTx.result !== undefined) {
             let rawClaimable: any = claimableTx.result;
             if (typeof rawClaimable === 'object' && rawClaimable !== null) {
               if (typeof rawClaimable.unwrap === 'function') rawClaimable = rawClaimable.unwrap();
               else if ('ok' in rawClaimable) rawClaimable = rawClaimable.ok;
               else if ('value' in rawClaimable) rawClaimable = rawClaimable.value;
             }
             const parsedClaimable = Number(rawClaimable);
             if (!isNaN(parsedClaimable) && parsedClaimable > 0) {
                 claimableYieldNative = parsedClaimable / 10000000;
             }
          }
        } catch (e) {
          console.warn("YT claimable yield fetch error", e);
        }

        // Intent-flow position (PT/YT balances), pushed as its own 'vault' entry. This is
        // additive with any untokenized raw LP entry pushed below — see note above.
        if (ptBalanceFloat > 0 || ytBalanceFloat > 0) {
           const currentVaultValue = ptValueUsd + ytValueUsd;
           const claimableYieldUsd = (!isNaN(claimableYieldNative) && !isNaN(underlyingSpotUsd)) ? (claimableYieldNative * underlyingSpotUsd) : 0;

           // NOTE: currentVaultValue is NOT added to totalValueUsd here — it's the
           // same money already counted above via ptValueUsd/ytValueUsd. This entry
           // is a display rollup (VaultPositionsTable) of the PT+YT position, not a
           // third independent value bucket. Adding it again previously double-counted
           // every intent-flow position 2x in "Portfolio Value" and allocation %.
           assets.push({
             assetCode: `Novaire Vault (${underlyingAsset})`,
             issuer: epochId,
             balance: ptBalanceFloat, // User's principal deposit essentially equals their PT balance
             priceUsd: underlyingSpotUsd,
             valueUsd: currentVaultValue,
             allocationPercent: 0,
             isNative: false,
             assetType: 'vault',
             claimableYield: (!isNaN(claimableYieldUsd) && isFinite(claimableYieldUsd)) ? claimableYieldUsd : 0
           });
        }
        // Untokenized raw LP is a separate position (see note above) and is additive with
        // any PT/YT position pushed above, not mutually exclusive with it.
        if (realVaultBalanceFloat > 0) {
           totalValueUsd += realVaultValueUsd;
           assets.push({
             assetCode: `Novaire Vault LP (${underlyingAsset})`,
             issuer: epochId,
             balance: realVaultBalanceFloat,
             priceUsd: underlyingSpotUsd,
             valueUsd: realVaultValueUsd,
             allocationPercent: 0,
             isNative: false,
             assetType: 'vault'
           });
        }

      } catch (err) {
        console.error('Failed to fetch protocol positions on-chain', err);
      }

      // Second pass: Calculate allocation percentages and metrics
      let largestValue = 0;
      let largestAsset: string | null = null;
      const allocation: PortfolioAllocation[] = [];

      for (const asset of assets) {
        if (asset.assetType === 'wallet') {
           asset.allocationPercent = 0;
           continue;
        }

        // The intent-flow 'vault' rollup entry (identified by having a claimableYield
        // field — see totalVaultLpUsd's filter below) duplicates value already counted
        // via its underlying PT/YT entries; it's a display-only summary for
        // VaultPositionsTable and must not get its own allocation share or count
        // toward "largest holding" on top of the PT/YT rows it summarizes.
        if (asset.assetType === 'vault' && asset.claimableYield !== undefined) {
           asset.allocationPercent = 0;
           continue;
        }

        if (totalValueUsd > 0 && !isNaN(totalValueUsd) && isFinite(totalValueUsd)) {
          const percent = (asset.valueUsd / totalValueUsd) * 100;
          asset.allocationPercent = (!isNaN(percent) && isFinite(percent)) ? percent : 0;
        } else {
          asset.allocationPercent = 0;
        }

        allocation.push({
          assetCode: asset.assetCode,
          valueUsd: asset.valueUsd,
          percentage: asset.allocationPercent
        });

        if (asset.valueUsd > largestValue) {
          largestValue = asset.valueUsd;
          largestAsset = asset.assetCode;
        }
      }

      // Sort assets by highest USD value
      assets.sort((a, b) => b.valueUsd - a.valueUsd);
      allocation.sort((a, b) => b.valueUsd - a.valueUsd);

      let xlmPriceUsd = 0;
      try {
        const xlmPriceData = await PriceOracleService.getAssetPrice('XLM');
        if (xlmPriceData && typeof xlmPriceData.priceUsd === 'number' && !isNaN(xlmPriceData.priceUsd) && xlmPriceData.priceUsd > 0) {
          xlmPriceUsd = xlmPriceData.priceUsd;
        }
      } catch {
        console.warn('Failed to fetch XLM price for conversions.');
      }

      let totalClaimableYieldUsd = 0;
      for (const asset of assets) {
        if (asset.assetType === 'vault' && asset.claimableYield) {
           totalClaimableYieldUsd += asset.claimableYield;
        }
      }

      // Ensure Portfolio Value strictly includes Claimable Yield
      if (totalClaimableYieldUsd > 0) {
        totalValueUsd += totalClaimableYieldUsd;
      }

      // Calculate invested amount based on principal balance, not current market value.
      // There can be up to two assetType: 'vault' entries per user: untokenized LP and a
      // PT/YT-derived position (see note above these are genuinely separate positions),
      // so both are summed here rather than picking one.
      const totalInvestedUsd = assets.filter(a => a.assetType === 'vault').reduce((sum, a) => (!isNaN(a.balance) && !isNaN(a.priceUsd)) ? sum + (a.balance * a.priceUsd) : sum, 0);

      const totalWalletUsd = assets.filter(a => a.assetType === 'wallet').reduce((sum, a) => (!isNaN(a.valueUsd) && isFinite(a.valueUsd)) ? sum + a.valueUsd : sum, 0);

      // Vault LP value specifically for a direct (non-intent-flow) deposit: identified by
      // the absence of `claimableYield`, which is only ever set on the intent-flow entry.
      const totalVaultLpUsd = assets.filter(a => a.assetType === 'vault' && a.claimableYield === undefined).reduce((sum, a) => (!isNaN(a.valueUsd) && isFinite(a.valueUsd)) ? sum + a.valueUsd : sum, 0);

      return {
        totalValueUsd,
        totalValueXlm: (xlmPriceUsd > 0) ? (totalValueUsd / xlmPriceUsd) : 0,
        assets,
        allocation,
        metrics: {
          totalAssets: assets.length,
          largestHoldingAsset: largestAsset,
          largestHoldingValue: isNaN(largestValue) ? 0 : largestValue,
          activePositions: assets.filter(a => a.assetType === 'vault').length,
          totalInvestedUsd,
          totalInvestedXlm: (xlmPriceUsd > 0) ? (totalInvestedUsd / xlmPriceUsd) : 0,
          totalClaimableYieldUsd,
          totalClaimableYieldXlm: (xlmPriceUsd > 0) ? (totalClaimableYieldUsd / xlmPriceUsd) : 0,
          totalWalletUsd,
          totalVaultLpUsd
        },
        error: null
      };

    } catch (error: any) {
      console.error('PortfolioService Error:', error);
      return this.emptyPortfolio(error.message || 'Failed to construct portfolio');
    }
  }

  /**
   * Helper: Get only the total USD value of the portfolio
   */
  static async getPortfolioValue(): Promise<number> {
    const portfolio = await this.getPortfolio();
    return portfolio.totalValueUsd;
  }

  /**
   * Helper: Get the list of detailed portfolio assets
   */
  static async getPortfolioAssets(): Promise<PortfolioAsset[]> {
    const portfolio = await this.getPortfolio();
    return portfolio.assets;
  }

  /**
   * Helper: Get only the allocation percentages
   */
  static async getAllocation(): Promise<PortfolioAllocation[]> {
    const portfolio = await this.getPortfolio();
    return portfolio.allocation;
  }

  /**
   * Utility to return a standardized empty state gracefully
   */
  private static emptyPortfolio(errorMessage: string | null = null): PortfolioSummary {
    return {
      totalValueUsd: 0,
      totalValueXlm: 0,
      assets: [],
      allocation: [],
      metrics: {
        totalAssets: 0,
        largestHoldingAsset: null,
        largestHoldingValue: 0,
        activePositions: 0,
        totalInvestedUsd: 0,
        totalInvestedXlm: 0,
        totalClaimableYieldUsd: 0,
        totalClaimableYieldXlm: 0,
        totalWalletUsd: 0,
        totalVaultLpUsd: 0
      },
      error: errorMessage
    };
  }
}
