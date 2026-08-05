'use client';

import { motion } from 'framer-motion';
import { usePortfolio } from '../../hooks/usePortfolio';
import { usePrices } from '../../hooks/usePrices';
import { useState, useEffect } from 'react';
import { YieldService } from '../../services/yieldService';
import { ProtocolService, ProtocolState } from '../../services/protocolService';

export function MarketStatisticsPanel() {
  const { prices, loading: pricesLoading } = usePrices();
  const [vaults, setVaults] = useState<any[]>([]);
  const [protocolState, setProtocolState] = useState<ProtocolState | null>(null);

  useEffect(() => {
    YieldService.getVaults().then(setVaults).catch(console.error);
    ProtocolService.getProtocolState().then(setProtocolState).catch(console.error);
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
    { label: 'Implied Yield', value: `${(protocolState?.impliedYieldApy || 0).toFixed(2)}%`, subtext: 'Based on TWAP oracle' },
    { label: 'Executable Yield', value: `${(protocolState?.executableApy || 0).toFixed(2)}%`, subtext: 'Based on spot price' },
    { label: 'Fixed Yield', value: `${activeVault?.fixedApy || 0}%`, subtext: 'Guaranteed' },
    { label: 'Market TVL', value: `$${(protocolState?.tvlUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, subtext: `${(protocolState?.tvlXlm || 0).toLocaleString()} XLM` },
    { label: 'Total PT Supply', value: `${(protocolState?.ptSupplyXlm || 0).toLocaleString()} PT` },
    { label: 'Total YT Supply', value: `${(protocolState?.ytSupplyXlm || 0).toLocaleString()} YT` },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-nova-border bg-white/5 p-6 backdrop-blur-xl flex flex-col gap-6"
    >
      <h3 className="text-lg font-semibold text-white">Market Statistics</h3>
      
      <div className="flex flex-col gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="flex justify-between items-center pb-3 border-b border-nova-border last:border-0 last:pb-0">
            <span className="text-sm text-gray-400">{stat.label}</span>
            <div className="text-right">
              <div className={`text-sm font-medium ${stat.highlight ? 'text-emerald-400' : 'text-white'}`}>
                {stat.value}
              </div>
              {stat.subtext && (
                <div className="text-xs text-gray-500 mt-0.5">{stat.subtext}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
