/**
 * AnalyticsHistoryService
 *
 * Manages the analytics history pipeline:
 *   1. Triggers server-side protocol sync (new on-chain events → protocol snapshot)
 *   2. Fetches historical snapshots from /api/history
 *   3. On each poll, captures the CURRENT wallet state and writes a new client-side
 *      snapshot into the history store via /api/history/snapshot so that portfolio
 *      and yield-position charts use HISTORICAL balances × HISTORICAL prices.
 *
 * Key invariant: every chart data point uses the ptBalance/ytBalance/xlmBalance
 * recorded at THAT timestamp — never the current balance projected backwards.
 */
import { PriceOracleService } from './priceOracleService';
import { PortfolioService } from './portfolioService';
import { YieldService } from './yieldService';

export interface AnalyticsSnapshot {
  timestamp: number;

  // Portfolio / position values (computed from snapshot balances × snapshot prices)
  portfolioValue: number;
  yieldPositionValue: number;

  // Protocol prices at this instant
  ptPrice: number;
  ytPrice: number;
  fixedApy: number;
  tvl: number;
  volume: number;

  // Raw balances at this instant (for UI detail panels)
  ptBalance: number;
  ytBalance: number;
  xlmBalance: number;
  claimableYield: number;
}

export class AnalyticsHistoryService {
  private static snapshots: AnalyticsSnapshot[] = [];
  private static listeners: Array<(snapshots: AnalyticsSnapshot[]) => void> = [];
  private static pollInterval: ReturnType<typeof setInterval> | null = null;
  private static isInitialized = false;

  static initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
  }

  static subscribe(listener: (snapshots: AnalyticsSnapshot[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  static getSnapshots() {
    return this.snapshots;
  }

  static startPolling(intervalMs = 10000) {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(async () => {
      await this.syncAndFetch();
    }, intervalMs);

    // Initial fetch
    this.syncAndFetch();
  }

  static stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  static async syncAndFetch() {
    try {
      // Step 1: Get current XLM spot price (shared denominator for all USD values)
      const prices = await PriceOracleService.getPrices().catch(() => null);
      const xlmPriceRaw = prices?.find((p: any) => p.asset === 'XLM')?.priceUsd;
      const xlmPrice = (typeof xlmPriceRaw === 'number' && !isNaN(xlmPriceRaw) && xlmPriceRaw > 0)
        ? xlmPriceRaw
        : 0.1;

      // Step 2: Fetch live wallet state so we can write a client-side snapshot
      //         with accurate balances BEFORE triggering the server sync.
      let currentPtBalance = 0;
      let currentYtBalance = 0;
      let currentXlmBalance = 0;
      let currentWalletAssetsUsd = 0;
      let currentVaultLpUsd = 0;
      let currentClaimableYield = 0;
      let currentPortfolioValue = 0;
      let currentPositionValue = 0;

      const portfolio = await PortfolioService.getPortfolio().catch(() => null);
      if (portfolio && !portfolio.error && portfolio.assets) {
        portfolio.assets.forEach((a: any) => {
          if (a.assetType === 'pt') currentPtBalance += Number(a.balance) || 0;
          else if (a.assetType === 'yt') currentYtBalance += Number(a.balance) || 0;
          else if (a.assetType === 'wallet' && a.isNative) {
            currentXlmBalance += Number(a.balance) || 0;
          }
        });
        if (portfolio.metrics) {
          currentClaimableYield = portfolio.metrics.totalClaimableYieldUsd || 0;
          currentWalletAssetsUsd = portfolio.metrics.totalWalletUsd || 0;
          currentVaultLpUsd = portfolio.metrics.totalVaultLpUsd || 0;
        }
        currentPortfolioValue = portfolio.totalValueUsd;
        // Position value = PT + YT holdings + claimable yield
        currentPositionValue = portfolio.assets
          .filter((a: any) => a.assetType === 'pt' || a.assetType === 'yt')
          .reduce((sum: number, a: any) => sum + (Number(a.valueUsd) || 0), 0)
          + currentClaimableYield;
      }

      // Step 3: Push a client-side wallet snapshot to the server store.
      //         This snapshot will carry the actual balances at this moment so that
      //         future replays of history always use historical balances × historical prices.
      //         We do NOT overwrite server-generated protocol snapshots; we augment them.
      if (currentPortfolioValue > 0 || currentPtBalance > 0 || currentYtBalance > 0) {
        await fetch('/api/history/snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ptBalance: currentPtBalance,
            ytBalance: currentYtBalance,
            xlmBalance: currentXlmBalance,
            walletAssetsUsd: currentWalletAssetsUsd,
            vaultLpUsd: currentVaultLpUsd,
            claimableYield: currentClaimableYield,
            portfolioValue: currentPortfolioValue,
            positionValue: currentPositionValue,
          }),
        }).catch(() => null); // Fire and forget — failures are non-fatal
      }

      // Step 4: Trigger server-side protocol sync (on-chain events → ptPrice/tvl/apy)
      await fetch('/api/history/sync').catch(() => null);

      // Step 5: Fetch the full persisted history
      const res = await fetch('/api/history');
      if (!res.ok) return;
      const history: any[] = await res.json();

      if (!Array.isArray(history) || history.length === 0) return;

      // Step 6: Map stored snapshots → AnalyticsSnapshot
      //         CRITICAL: use the STORED balances from each historical snapshot.
      //         Never project current balances backwards onto old prices.
      this.snapshots = history.map((h: any) => {
        const ptPrice = (h.ptPrice || 0) * xlmPrice;
        const ytPrice = (h.ytPrice || 0) * xlmPrice;

        // If this snapshot has stored balances, use them; otherwise fall back to 0
        // (protocol-only server-sync snapshots have 0 balances by design).
        const snapshotPtBalance = Number(h.ptBalance) || 0;
        const snapshotYtBalance = Number(h.ytBalance) || 0;
        const snapshotClaimable = Number(h.claimableYield) || 0;
        const snapshotWalletAssetsUsd = Number(h.walletAssetsUsd) || 0;
        const snapshotVaultLpUsd = Number(h.vaultLpUsd) || 0;

        const positionValue = snapshotPtBalance > 0 || snapshotYtBalance > 0
          ? snapshotPtBalance * ptPrice + snapshotYtBalance * ytPrice + snapshotClaimable
          : Number(h.positionValue) || 0;

        const portfolioValue = Number(h.portfolioValue) > 0
          ? Number(h.portfolioValue)
          : positionValue + snapshotWalletAssetsUsd + snapshotVaultLpUsd;

        return {
          timestamp: new Date(h.timestamp).getTime(),
          portfolioValue,
          yieldPositionValue: positionValue,
          ptPrice,
          ytPrice,
          fixedApy: h.fixedApy || 0,
          tvl: h.tvl || 0,
          volume: h.tradingVolume || 0,
          ptBalance: snapshotPtBalance,
          ytBalance: snapshotYtBalance,
          xlmBalance: Number(h.xlmBalance) || 0,
          claimableYield: snapshotClaimable,
        };
      });

      this.listeners.forEach((l) => l([...this.snapshots]));
    } catch (error) {
      console.error('[AnalyticsHistoryService] Error syncing analytics history:', error);
    }
  }
}
