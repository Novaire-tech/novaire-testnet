'use client';

import { motion } from 'framer-motion';
import { usePortfolio } from '../../hooks/usePortfolio';
import { Vault } from '../../types';

interface MyVaultPositionsProps {
  vaults: Vault[];
}

export function MyVaultPositions({ vaults }: MyVaultPositionsProps) {
  const { portfolio, loading, error } = usePortfolio();
  
  const isDisconnected = error === 'Wallet not connected' || portfolio?.error === 'Wallet not connected';
  const vaultAssets = portfolio?.assets.filter(a => a.assetType === 'vault') || [];
  
  const positions = vaultAssets.map(asset => {
    const match = asset.assetCode.match(/\((.*?)\)/);
    const underlying = match ? match[1] : 'Unknown';
    const activeVault = vaults.find(v => (Array.isArray(v.asset) ? v.asset.includes(underlying) : v.asset === underlying));
    
    let fixedApy = 0;
    let maturityDate = '--';
    let status = 'Active';

    if (activeVault) {
      fixedApy = activeVault.fixedApy;
      maturityDate = new Date(activeVault.maturityDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      
      const timeDiff = new Date(activeVault.maturityDate).getTime() - new Date().getTime();
      if (timeDiff <= 0) status = 'Matured';
    }

    // Attempt to find PT and YT balances for this underlying
    const ptBalance = portfolio?.assets.find(a => a.assetType === 'pt' && a.assetCode.includes(underlying))?.balance || 0;
    const ytBalance = portfolio?.assets.find(a => a.assetType === 'yt' && a.assetCode.includes(underlying))?.balance || 0;
    
    // Claimable yield and Current Value (PT + YT sum) are now natively provided by PortfolioService SSOT
    const claimableYield = typeof asset.claimableYield === 'number' ? asset.claimableYield : 0;
    const currentValue = asset.valueUsd;

    return {
      vaultName: `${activeVault?.protocol || 'Novaire'} ${underlying} Vault`,
      underlying,
      depositAmount: asset.balance,
      ptBalance,
      ytBalance,
      claimableYield,
      currentValue,
      maturityDate,
      status
    };
  });

  const isEmpty = !loading && !isDisconnected && positions.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
      className="flex flex-col overflow-hidden rounded-2xl border border-nova-border bg-nova-surface"
    >
      <div className="border-b border-nova-border p-6 flex justify-between items-center">
        <h3 className="font-sans font-medium ">My Vault Positions</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-nova-bg/50 text-xs text-nova-muted">
            <tr>
              <th className="px-6 py-4 font-medium">Vault Name</th>
              <th className="px-6 py-4 font-medium text-right">Deposit</th>
              <th className="px-6 py-4 font-medium text-right">PT Balance</th>
              <th className="px-6 py-4 font-medium text-right">YT Balance</th>
              <th className="px-6 py-4 font-medium text-right">Claimable Yield</th>
              <th className="px-6 py-4 font-medium text-right">Current Value</th>
              <th className="px-6 py-4 font-medium">Maturity</th>
              <th className="px-6 py-4 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="h-4 w-full max-w-lg animate-pulse rounded bg-white/5"></div>
                  </div>
                </td>
              </tr>
            )}

            {isDisconnected && (
              <tr>
                <td colSpan={8} className="px-6 py-16 text-center">
                  <p className="text-nova-muted">Connect Wallet to view your active vault positions.</p>
                </td>
              </tr>
            )}

            {isEmpty && (
              <tr>
                <td colSpan={8} className="px-6 py-20 text-center">
                  <p className="text-nova-muted text-base mb-2">You don't have any active vault positions.</p>
                  <p className="text-nova-muted text-sm">Deposit into a vault to begin earning fixed or variable yield.</p>
                </td>
              </tr>
            )}

            {!loading && !isDisconnected && !isEmpty && positions.map((pos, i) => (
              <motion.tr
                key={`${pos.vaultName}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.05 }}
                className="group transition-colors hover:bg-white/5"
              >
                <td className="whitespace-nowrap px-6 py-4 font-medium text-nova-text">
                  {pos.vaultName}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right font-medium text-nova-text">
                  {pos.depositAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right font-medium text-nova-text">
                  {pos.ptBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right font-medium text-nova-text">
                  {pos.ytBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right font-medium text-nova-accent">
                  +{pos.claimableYield.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right font-medium text-nova-text">
                  ${pos.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-nova-text">
                  {pos.maturityDate}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    pos.status === 'Active' ? 'bg-nova-accent/10 text-nova-accent' : 'bg-white/10 text-white/70'
                  }`}>
                    {pos.status}
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
