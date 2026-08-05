'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { YieldService } from '../../services/yieldService';
import { Vault } from '../../types';

export function ProtocolOverview() {
  const [vaults, setVaults] = useState<Vault[]>([]);

  useEffect(() => {
    YieldService.getVaults().then(setVaults).catch(console.error);
  }, []);

  const activeVaults = vaults.length;
  const avgApy = activeVaults > 0 
    ? (vaults.reduce((sum, v) => sum + v.fixedApy, 0) / activeVaults).toFixed(1) + '%'
    : 'Not available';

  const METRICS = [
    { label: 'Protocol TVL', value: 'Unavailable on Testnet' },
    { label: '30 Day Volume', value: 'Not available' },
    { label: 'Active Vaults', value: activeVaults > 0 ? activeVaults.toString() : 'Not available' },
    { label: 'Avg Fixed APY', value: avgApy },
    { label: 'Utilization', value: 'Not available' },
    { label: 'Total Users', value: 'Not available' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6, ease: 'easeOut' }}
      className="flex h-full flex-col rounded-2xl border border-nova-border bg-nova-surface p-6 transition-colors hover:border-nova-accent/50"
    >
      <h3 className="font-sans font-medium ">Protocol Overview</h3>
      <p className="mt-1 text-xs text-nova-muted">Network statistics</p>

      <div className="mt-6 flex flex-1 flex-col gap-4">
        {METRICS.map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.7 + i * 0.05 }}
            className="flex items-center justify-between border-b border-nova-border pb-4 last:border-0 last:pb-0"
          >
            <span className="text-sm text-nova-muted">{metric.label}</span>
            <span className="font-medium text-nova-text">{metric.value}</span>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 pt-4">
        <button className="w-full rounded-lg bg-white/5 py-2.5 text-xs font-medium text-nova-muted transition-colors hover:bg-white/10 hover:text-nova-text">
          View Full Analytics
        </button>
      </div>
    </motion.div>
  );
}
