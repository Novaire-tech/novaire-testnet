'use client';

import { motion } from 'framer-motion';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useYield } from '../../hooks/useYield';

export function PositionsTable() {
  const { portfolio, loading: portfolioLoading, error: portfolioError } = usePortfolio();
  const { vaults, loading: vaultsLoading } = useYield();

  const isDisconnected = portfolioError === 'Wallet not connected' || portfolio?.error === 'Wallet not connected';
  const loading = portfolioLoading || vaultsLoading;
  
  // Vault assets contain the claimable yield computation in PortfolioService
  const vaultAssets = portfolio?.assets?.filter(a => a.assetType === 'vault') || [];
  const ptAssets = portfolio?.assets?.filter(a => a.assetType === 'pt') || [];
  const ytAssets = portfolio?.assets?.filter(a => a.assetType === 'yt') || [];
  
  const groupedPositions = vaults.map(vault => {
    // Find the corresponding assets for this vault's underlying asset (e.g., 'XLM')
    const vaultAsset = vaultAssets.find(a => a.assetCode.includes(vault.asset));
    const ptAsset = ptAssets.find(a => a.assetCode === `PT-${vault.asset}` || a.assetCode.includes(vault.asset));
    const ytAsset = ytAssets.find(a => a.assetCode === `YT-${vault.asset}` || a.assetCode.includes(vault.asset));
    
    const ptBalance = ptAsset ? ptAsset.balance : 0;
    const ytBalance = ytAsset ? ytAsset.balance : 0;
    
    // Values
    const ptValue = ptAsset ? ptAsset.valueUsd : 0;
    const ytValue = ytAsset ? ytAsset.valueUsd : 0;
    const currentValue = ptValue + ytValue;

    // Claimable Yield: Extracted directly from the matching vault asset
    const claimableYield = vaultAsset && typeof vaultAsset.claimableYield === 'number' 
      ? vaultAsset.claimableYield 
      : 0;

    // Dates
    const maturityDate = new Date(vault.maturityDate);
    const daysRemaining = Math.max(0, Math.ceil((maturityDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    
    // Status
    let status = 'Active';
    if (daysRemaining === 0) status = 'Matured';

    return {
      vaultName: `${vault.asset} Core Vault`,
      underlyingAsset: vault.asset,
      ptBalance,
      ytBalance,
      currentValue,
      claimableYield,
      fixedApy: vault.fixedApy,
      maturityDate: maturityDate.toLocaleDateString(),
      daysRemaining,
      status,
      hasPosition: ptBalance > 0 || ytBalance > 0
    };
  }).filter(p => p.hasPosition);

  const isEmpty = !loading && !isDisconnected && groupedPositions.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.55, ease: 'easeOut' }}
      className="flex flex-col overflow-hidden rounded-2xl border border-nova-border bg-nova-surface"
    >
      <div className="border-b border-nova-border p-6 flex justify-between items-center">
        <h3 className="font-sans font-medium ">My Active Positions</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-nova-bg/50 text-xs text-nova-muted">
            <tr>
              <th className="px-6 py-4 font-medium">Vault Name</th>
              <th className="px-6 py-4 font-medium">Asset</th>
              <th className="px-6 py-4 font-medium text-right">PT Balance</th>
              <th className="px-6 py-4 font-medium text-right">YT Balance</th>
              <th className="px-6 py-4 font-medium text-right">Current Value</th>
              <th className="px-6 py-4 font-medium text-right">Claimable Yield</th>
              <th className="px-6 py-4 font-medium text-right">Fixed APY</th>
              <th className="px-6 py-4 font-medium text-right">Maturity Date</th>
              <th className="px-6 py-4 font-medium text-right">Days Remaining</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && (
              <tr>
                <td colSpan={11} className="px-6 py-8 text-center">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-white/5"></div>
                    <div className="h-4 w-full max-w-xl animate-pulse rounded bg-white/5"></div>
                    <div className="h-4 w-full max-w-lg animate-pulse rounded bg-white/5"></div>
                  </div>
                </td>
              </tr>
            )}

            {isDisconnected && (
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center text-nova-muted">
                  Connect Wallet to view positions
                </td>
              </tr>
            )}

            {isEmpty && (
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center text-nova-muted">
                  No open positions.<br/>Deposit assets to open a position.
                </td>
              </tr>
            )}

            {!loading && !isDisconnected && !isEmpty && groupedPositions.map((pos, i) => (
              <motion.tr
                key={`${pos.vaultName}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.05 }}
                className="group transition-colors hover:bg-white/5"
              >
                <td className="whitespace-nowrap px-6 py-4 font-medium text-nova-text">
                  {pos.vaultName}
                </td>
                <td className="whitespace-nowrap px-6 py-4 font-medium text-nova-muted">
                  {pos.underlyingAsset}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right font-medium text-nova-text">
                  {pos.ptBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right font-medium text-nova-text">
                  {pos.ytBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right font-medium text-nova-text">
                  ${pos.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right font-medium text-nova-accent">
                  {pos.claimableYield === 0 ? '--' : `+${pos.claimableYield.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right font-medium text-nova-accent">
                  {pos.fixedApy.toFixed(1)}%
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-nova-muted">
                  {pos.maturityDate}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-nova-text">
                  {pos.daysRemaining}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  {pos.status === 'Matured' ? (
                    <span className="inline-flex rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400">
                      Matured
                    </span>
                  ) : (
                    <span className="inline-flex rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-nova-accent/10 text-nova-accent">
                      Active
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button className="rounded-lg border border-nova-border px-3 py-1.5 text-xs font-medium text-nova-muted transition-all hover:bg-white/10 hover:text-white">
                      Trade PT
                    </button>
                    <button className="rounded-lg border border-nova-border px-3 py-1.5 text-xs font-medium text-nova-muted transition-all hover:bg-white/10 hover:text-white">
                      Trade YT
                    </button>
                    <button disabled={pos.status !== 'Matured'} className="rounded-lg border border-nova-border px-3 py-1.5 text-xs font-medium text-nova-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:border-nova-accent hover:bg-nova-accent hover:text-black">
                      Redeem
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
