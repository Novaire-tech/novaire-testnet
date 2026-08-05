'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnalyticsHistory } from '../../hooks/useAnalyticsHistory';
import { AnalyticsSnapshot } from '../../services/analyticsHistoryService';
import { InteractiveChart } from '../ui/InteractiveChart';

type Timeframe = '1H' | '24H' | '7D' | '30D' | 'ALL';
type DataMode = 'Yield Position Value' | 'PT Price' | 'YT Price';

export function PerformanceChart() {
  const { snapshots } = useAnalyticsHistory();
  const [timeframe, setTimeframe] = useState<Timeframe>('1H');
  const [dataMode, setDataMode] = useState<DataMode>('Yield Position Value');

  const timeframes: Timeframe[] = ['1H', '24H', '7D', '30D', 'ALL'];
  const dataModes: DataMode[] = ['Yield Position Value', 'PT Price', 'YT Price'];

  const modeToKeyMap: Record<DataMode, keyof AnalyticsSnapshot> = {
    'Yield Position Value': 'yieldPositionValue',
    'PT Price': 'ptPrice',
    'YT Price': 'ytPrice',
  };

  const activeKey = modeToKeyMap[dataMode];
  
  // Do NOT filter the snapshots for the chart, pass the entire history
  // so the chart can pan through time naturally.
  // We only filter for the headline metric display (percent change)
  const currentVal = snapshots.length > 0 ? (snapshots[snapshots.length - 1][activeKey] as number) : 0;
  
  const diffStartSnapshot = useMemo(() => {
    if (snapshots.length < 2) return null;
    if (timeframe === 'ALL') return snapshots[0];
    
    const timeframeMsMap: Record<string, number> = {
      '1H': 60 * 60 * 1000,
      '24H': 24 * 60 * 60 * 1000,
      '7D': 7 * 24 * 60 * 60 * 1000,
      '30D': 30 * 24 * 60 * 60 * 1000,
    };
    
    const limit = Date.now() - timeframeMsMap[timeframe];
    // Find the oldest snapshot that is still within the timeframe
    const inRange = snapshots.filter(s => s.timestamp >= limit);
    return inRange.length > 1 ? inRange[0] : null;
  }, [snapshots, timeframe]);

  const startVal = diffStartSnapshot ? (diffStartSnapshot[activeKey] as number) : null;
  const diff = startVal !== null ? currentVal - startVal : null;
  const percentChange = (startVal !== null && startVal > 0) ? (diff! / startVal) * 100 : null;
  const isPositive = diff !== null && diff >= 0;

  // Prepare full data for the Interactive Chart
  const lineData = useMemo(() => {
    return snapshots.map(s => ({
      time: s.timestamp,
      value: s[activeKey] as number
    }));
  }, [snapshots, activeKey]);

  const hasData = snapshots.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
      className="flex h-[420px] flex-col overflow-hidden rounded-2xl border border-nova-border bg-nova-surface p-6 transition-colors hover:border-nova-accent/50 relative"
    >
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 z-10">
        <div>
          <span className="text-[13px] font-medium text-nova-muted uppercase tracking-wider">{dataMode}</span>
          <div className="mt-2 flex items-baseline gap-3">
            <h2 className="font-serif text-[40px] leading-none text-nova-text tracking-tight">
              ${currentVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </h2>
            <AnimatePresence mode="wait">
              <motion.span
                key={percentChange !== null ? percentChange : 'null'}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 5 }}
                className={`text-sm font-medium ${percentChange === null ? 'text-nova-muted' : isPositive ? 'text-nova-accent' : 'text-red-400'}`}
              >
                {percentChange === null ? '--' : `${isPositive ? '+' : ''}${percentChange.toFixed(2)}%`}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex flex-col gap-3 items-end">
          {/* Top Row: Data Mode */}
          <div className="flex gap-2">
            <div className="flex gap-1 p-1 bg-nova-bg border border-nova-border rounded-lg">
              {dataModes.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setDataMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    dataMode === mode
                      ? 'bg-nova-accent/10 text-nova-accent shadow-sm'
                      : 'text-nova-muted hover:text-nova-text'
                  }`}
                >
                  {mode === 'Yield Position Value' ? 'Position' : mode.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Row: Timeframes */}
          <div className="flex gap-1 p-1 bg-nova-bg border border-nova-border rounded-lg">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  timeframe === tf
                    ? 'bg-nova-accent/10 text-nova-accent shadow-sm'
                    : 'text-nova-muted hover:text-nova-text'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 w-full relative h-[250px] mt-4">
        {hasData ? (
          <InteractiveChart 
            lineData={lineData} 
            timeframe={timeframe} 
            isPositive={isPositive}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center ml-5">
            <span className="text-nova-muted text-sm font-medium animate-pulse">Initializing Live Protocol State...</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
