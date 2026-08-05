'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { YieldService } from '../../services/yieldService';

export function VaultAnalytics() {
  const [vaults, setVaults] = useState<any[]>([]);

  useEffect(() => {
    YieldService.getVaults().then(setVaults).catch(console.error);
  }, []);

  const activeVault = vaults[0];
  
  if (!activeVault) {
    return (
      <div className="rounded-2xl border border-nova-border bg-white/5 p-6 h-48 flex items-center justify-center">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-white/10 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-white/10 rounded"></div>
              <div className="h-4 bg-white/10 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const maturityDate = new Date(activeVault.maturityDate);
  const daysRemaining = Math.max(0, Math.ceil((maturityDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="rounded-2xl border border-nova-border bg-white/5 p-6 backdrop-blur-xl"
    >
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-white">Vault Analytics</h3>
        <span className="px-2 py-1 text-xs font-medium rounded bg-emerald-500/20 text-emerald-400">
          Epoch 20 Active
        </span>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Vault</span>
          <span className="text-sm font-medium text-white">{activeVault.asset} Vault</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Maturity Date</span>
          <span className="text-sm font-medium text-white">{maturityDate.toLocaleDateString()}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Days Remaining</span>
          <span className="text-sm font-medium text-white">{daysRemaining} Days</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Vault TVL</span>
          <span className="text-sm font-medium text-white">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(activeVault.tvlUsd)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Protocol Deposits</span>
          <span className="text-sm font-medium text-white">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(activeVault.tvlUsd * 0.95)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
