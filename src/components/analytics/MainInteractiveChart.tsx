'use client';

import { useState, useMemo } from 'react';
import { useAnalyticsHistory } from '../../hooks/useAnalyticsHistory';
import { AnalyticsSnapshot } from '../../services/analyticsHistoryService';
import { InteractiveChart } from '../ui/InteractiveChart';

type Timeframe = '1H' | '24H' | '7D' | '30D' | 'ALL';
type DataMode = 'Portfolio Value' | 'PT Price' | 'YT Price' | 'Fixed APY' | 'TVL' | 'Trading Volume';

export function MainInteractiveChart() {
  const { snapshots } = useAnalyticsHistory();
  const [timeframe, setTimeframe] = useState<Timeframe>('1H');
  const [dataMode, setDataMode] = useState<DataMode>('Portfolio Value');
  
  const timeframes: Timeframe[] = ['1H', '24H', '7D', '30D', 'ALL'];
  const dataModes: DataMode[] = ['Portfolio Value', 'PT Price', 'YT Price', 'Fixed APY', 'TVL', 'Trading Volume'];

  const modeToKeyMap: Record<DataMode, keyof AnalyticsSnapshot> = {
    'Portfolio Value': 'portfolioValue',
    'PT Price': 'ptPrice',
    'YT Price': 'ytPrice',
    'Fixed APY': 'fixedApy',
    'TVL': 'tvl',
    'Trading Volume': 'volume'
  };

  const activeKey = modeToKeyMap[dataMode];

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
    const inRange = snapshots.filter(s => s.timestamp >= limit);
    return inRange.length > 1 ? inRange[0] : null;
  }, [snapshots, timeframe]);

  const startVal = diffStartSnapshot ? (diffStartSnapshot[activeKey] as number) : null;
  const diff = startVal !== null ? currentVal - startVal : null;
  const percentChange = (startVal !== null && startVal > 0) ? (diff! / startVal) * 100 : null;
  const isPositive = diff !== null ? diff >= 0 : true; // Default to green if no diff
  
  // Format for Lightweight Charts
  const lineData = useMemo(() => {
    return snapshots.map(s => ({
      time: s.timestamp,
      value: s[activeKey] as number
    }));
  }, [snapshots, activeKey]);

  const hasData = snapshots.length > 0;
  
  const currentPtPrice = snapshots.length > 0 ? (snapshots[snapshots.length - 1].ptPrice as number) : 0;
  const isPTAbovePar = currentPtPrice >= 1.0;

  return (
    <div className="rounded-2xl border border-nova-border bg-white/5 p-6 backdrop-blur-xl relative overflow-hidden h-[500px] flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div className="flex flex-wrap gap-2 p-1 bg-black/20 rounded-lg w-full md:w-auto">
          {dataModes.map((mode) => (
            <button
              key={mode}
              onClick={() => setDataMode(mode)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                dataMode === mode
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-1 p-1 bg-black/20 rounded-lg">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  timeframe === tf
                    ? 'bg-white/10 text-white'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="mb-2 flex items-baseline gap-3">
        {dataMode !== 'Trading Volume' ? (
          <>
            <h2 className="font-serif text-[32px] leading-none text-nova-text tracking-tight">
              {dataMode === 'Fixed APY' ? `${currentVal.toFixed(2)}%` : `$${currentVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}
            </h2>
            <span className={`text-sm font-medium ${percentChange === null ? 'text-nova-muted' : isPositive ? 'text-nova-accent' : 'text-red-400'}`}>
              {percentChange === null ? '--' : `${isPositive ? '+' : ''}${percentChange.toFixed(2)}%`}
            </span>
          </>
        ) : (
          <>
            <h2 className="font-serif text-[32px] leading-none text-nova-text tracking-tight opacity-50">
              --
            </h2>
          </>
        )}
      </div>

      {dataMode === 'YT Price' && isPTAbovePar && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 backdrop-blur-md">
          <div className="text-amber-400 text-sm font-semibold mb-0.5">YT Market Value = 0</div>
          <div className="text-amber-400/80 text-xs">
            PT is currently trading above par (1.0). Under the protocol's pricing model, YT has no market value until PT returns below par.
          </div>
        </div>
      )}

      {dataMode === 'Fixed APY' && isPTAbovePar && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 backdrop-blur-md">
          <div className="text-amber-400 text-sm font-semibold mb-0.5">Market-Implied APY: 0%</div>
          <div className="text-amber-400/80 text-xs">
            PT is trading above face value, so the implied fixed yield is currently zero.
          </div>
        </div>
      )}

      <div className="flex-1 w-full relative h-[300px]">
        {dataMode === 'Trading Volume' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <span className="text-nova-text text-sm font-medium">No trading history yet. Chart data will appear once trades execute.</span>
            <span className="text-nova-muted text-xs mt-2 max-w-[250px]">Trading volume will appear after completed marketplace swaps.</span>
          </div>
        ) : hasData ? (
          <InteractiveChart 
            lineData={lineData} 
            timeframe={timeframe} 
            isPositive={isPositive} 
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-gray-500 text-sm animate-pulse">Initializing Live Data...</span>
          </div>
        )}
      </div>
    </div>
  );
}
