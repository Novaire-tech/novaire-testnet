'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { YieldService } from '../../services/yieldService';
import { ProtocolService } from '../../services/protocolService';
import { Vault } from '../../types';
import { CardWaveDecoration } from '../ui/CardWaveDecoration';

export function ProtocolOverview() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [tvlUsd, setTvlUsd] = useState<number | null>(null);
  const [priceUnavailable, setPriceUnavailable] = useState(false);

  useEffect(() => {
    YieldService.getVaults().then(setVaults).catch(console.error);
    ProtocolService.getProtocolState().then(state => {
      setTvlUsd(state.tvlUsd);
      setPriceUnavailable(state.priceUnavailable);
    }).catch(console.error);
  }, []);

  const activeVaults = vaults.length;
  const avgApy = activeVaults > 0
    ? (vaults.reduce((sum, v) => sum + v.fixedApy, 0) / activeVaults).toFixed(1) + '%'
    : 'Not available';

  const formatUsd = (value: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

  const METRICS = [
    { label: 'Protocol TVL', value: priceUnavailable ? 'Price feed unavailable' : (tvlUsd !== null && tvlUsd > 0 ? formatUsd(tvlUsd) : 'Not available') },
    // No on-chain volume/utilization/user-count indexer exists yet for this protocol,
    // so these remain legitimate "Not available" stubs until that data source ships.
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
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-[#BEB7A7]/50"
    >
      <CardWaveDecoration />
      <h3 className="relative z-10 font-sans font-medium ">Protocol Overview</h3>
      <p className="relative z-10 mt-1 text-xs text-[#F5F5F2]/60">Network statistics</p>

      <div className="relative z-10 mt-6 flex flex-1 flex-col gap-4">
        {METRICS.map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.7 + i * 0.05 }}
            className="flex items-center justify-between border-b border-white/10 pb-4 last:border-0 last:pb-0"
          >
            <span className="text-sm text-[#F5F5F2]/60">{metric.label}</span>
            <span className="font-medium text-[#F5F5F2]">{metric.value}</span>
          </motion.div>
        ))}
      </div>

      <div className="relative z-10 mt-8 pt-4">
        <button className="w-full rounded-lg bg-white/5 py-2.5 text-xs font-medium text-[#F5F5F2]/60 transition-colors hover:bg-white/10 hover:text-[#F5F5F2]">
          View Full Analytics
        </button>
      </div>
    </motion.div>
  );
}
