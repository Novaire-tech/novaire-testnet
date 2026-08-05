'use client';

import { motion } from 'framer-motion';
import { Activity, ArrowRightLeft, BarChart3, TrendingUp, DollarSign, Percent } from 'lucide-react';
import { useTrade } from '../../hooks/useTrade';
import { ProtocolService, ProtocolState } from '../../services/protocolService';
import { useEffect, useState } from 'react';

export function TradingAnalytics() {
  const { marketData } = useTrade();
  const [protocolState, setProtocolState] = useState<ProtocolState | null>(null);

  useEffect(() => {
    ProtocolService.getProtocolState().then(setProtocolState).catch(console.error);
  }, []);

  const formatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const metrics = [
    { label: 'PT Price', value: marketData ? `${formatter.format(marketData.ptPrice)} XLM` : 'No data available', icon: TrendingUp },
    { label: 'YT Price', value: marketData ? `${formatter.format(marketData.ytPrice)} XLM` : 'No data available', icon: TrendingUp },
    { label: 'PT TWAP', value: marketData ? formatter.format(marketData.twap) : 'No data available', icon: Activity },
    { label: 'Protocol TVL', value: protocolState ? currencyFormatter.format(protocolState.tvlUsd) : 'No data available', icon: DollarSign },
    { label: 'Pool Liquidity', value: marketData ? `${marketData.underlyingReserve.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM` : 'No data available', icon: BarChart3 },
    { label: 'Current APY', value: protocolState ? `${protocolState.impliedYieldApy.toFixed(2)}%` : 'No data available', icon: Percent, color: 'text-green-400' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="rounded-2xl border border-nova-border bg-white/5 p-6 backdrop-blur-xl"
    >
      <h3 className="text-lg font-semibold text-white mb-6">Trading Analytics</h3>
      
      <div className="space-y-4">
        {metrics.map((metric, i) => (
          <div key={i} className="flex justify-between items-center pb-3 border-b border-nova-border last:border-0 last:pb-0">
            <div className="flex items-center gap-3">
              <div className={`p-1.5 rounded-md bg-white/5 ${metric.color || 'text-gray-400'}`}>
                <metric.icon className="h-4 w-4" />
              </div>
              <span className="text-sm text-gray-400">{metric.label}</span>
            </div>
            <span className="text-sm font-medium text-white">
              {metric.value !== 'No data available' ? metric.value : <span className="text-nova-muted text-xs italic">Waiting for protocol data.</span>}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
