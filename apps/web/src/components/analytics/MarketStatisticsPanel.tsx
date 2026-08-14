'use client';

import { motion } from 'framer-motion';
import { usePrices } from '../../hooks/usePrices';
import { useState, useEffect } from 'react';
import { YieldService } from '../../services/yieldService';
import type { Vault } from '../../types';
import { ProtocolService, ProtocolState } from '../../services/protocolService';
import { getUnderlyingApy } from '../../services/underlyingYieldService';
import { CardWaveDecoration } from '../ui/CardWaveDecoration';

export function MarketStatisticsPanel() {
  const { prices, loading: pricesLoading } = usePrices();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [protocolState, setProtocolState] = useState<ProtocolState | null>(null);
  const [underlyingApyLabel, setUnderlyingApyLabel] = useState('Loading...');

  useEffect(() => {
    YieldService.getVaults().then(setVaults).catch(console.error);
    ProtocolService.getProtocolState().then(setProtocolState).catch(console.error);
    getUnderlyingApy().then(result => {
      setUnderlyingApyLabel(result.status === 'ok' ? `${result.apy.toFixed(2)}%` : 'Insufficient data');
    }).catch(() => setUnderlyingApyLabel('Insufficient data'));
  }, []);

  const activeVault = vaults[0];
  const xlmPrice = prices.find(p => p.asset === 'XLM')?.priceUsd || 0;
  
  const ptPriceUsd = (protocolState?.ptPriceUnderlying || 0) * xlmPrice;
  const ytPriceUsd = Math.max(0, 1.0 - (protocolState?.ptPriceUnderlying || 0)) * xlmPrice;
  const ptDiscount = Math.max(0, (1.0 - (protocolState?.ptPriceUnderlying || 1.0)) * 100);
  
  const stats = [
    { label: 'Current PT Price', value: `$${ptPriceUsd.toFixed(3)}`, subtext: `${(protocolState?.ptPriceUnderlying || 0).toFixed(3)} XLM` },
    { label: 'Current YT Price', value: `$${ytPriceUsd.toFixed(3)}`, subtext: `${(1.0 - (protocolState?.ptPriceUnderlying || 1.0)).toFixed(3)} XLM` },
    { label: 'PT Discount', value: `${ptDiscount.toFixed(2)}%`, highlight: true },
    { label: 'Underlying APY', value: underlyingApyLabel, subtext: 'Actual Blend-backed yield, from SY exchange-rate growth' },
    { label: 'Implied APY', value: `${(protocolState?.impliedYieldApy || 0).toFixed(2)}%`, subtext: 'Market-implied yield from PT price (TWAP)' },
    { label: 'Executable APY', value: `${(protocolState?.executableApy || 0).toFixed(2)}%`, subtext: 'Implied yield from current spot PT price' },
    { label: 'Vault Fixed APY', value: `${activeVault?.fixedApy || 0}%`, subtext: 'Locked-in rate for the active vault' },
    { label: 'Market TVL', value: `$${(protocolState?.tvlUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, subtext: `${(protocolState?.tvlXlm || 0).toLocaleString()} XLM` },
    { label: 'Total PT Supply', value: `${(protocolState?.ptSupplyXlm || 0).toLocaleString()} PT` },
    { label: 'Total YT Supply', value: `${(protocolState?.ytSupplyXlm || 0).toLocaleString()} YT` },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl flex flex-col gap-6"
    >
      <CardWaveDecoration />
      <h3 className="relative z-10 text-lg font-semibold text-white">Market Statistics</h3>

      <div className="relative z-10 flex flex-col gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="flex justify-between items-center pb-3 border-b border-white/10 last:border-0 last:pb-0">
            <span className="text-sm text-[#F5F5F2]/60">{stat.label}</span>
            <div className="text-right">
              <div className={`text-sm font-medium ${stat.highlight ? 'text-[#BEB7A7]' : 'text-white'}`}>
                {stat.value}
              </div>
              {stat.subtext && (
                <div className="text-xs text-[#F5F5F2]/60 mt-0.5">{stat.subtext}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
