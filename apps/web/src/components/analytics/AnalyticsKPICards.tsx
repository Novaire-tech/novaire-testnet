'use client';

import { motion } from 'framer-motion';
import { Briefcase, HandCoins, Activity, ShieldCheck, Clock, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useState, useEffect } from 'react';
import { YieldService } from '../../services/yieldService';
import { MetricCard } from '../ui/MetricCard';

export function AnalyticsKPICards() {
  const { portfolio, loading, error } = usePortfolio();
  const [vaults, setVaults] = useState<any[]>([]);

  useEffect(() => {
    YieldService.getVaults().then(setVaults).catch(console.error);
  }, []);

  const getFormattedUsd = (value: number | undefined) => {
    if (loading) return <div className="h-8 w-32 animate-pulse rounded bg-white/10" />;
    if (error === 'Wallet not connected' || portfolio?.error === 'Wallet not connected') return 'Connect Wallet';
    if (!value || isNaN(value)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  };

  const getNumericString = (value: string | number | undefined) => {
    if (loading) return <div className="h-8 w-16 animate-pulse rounded bg-white/10" />;
    if (error === 'Wallet not connected' || portfolio?.error === 'Wallet not connected') return '-';
    return value ? value.toString() : '0';
  };

  const yieldAssets = portfolio?.assets.filter(a => a.assetType === 'pt' || a.assetType === 'yt') || [];
  const ptHoldings = yieldAssets.filter(a => a.assetType === 'pt').reduce((acc, curr) => acc + curr.balance, 0);
  const ytHoldings = yieldAssets.filter(a => a.assetType === 'yt').reduce((acc, curr) => acc + curr.balance, 0);
  
  // Calculate unrealized PnL (derived from total value vs invested if available)
  const totalValue = portfolio?.totalValueUsd || 0;
  const totalInvested = portfolio?.metrics?.totalInvestedUsd || 0;
  const unrealizedPnl = totalValue - totalInvested;
  
  const activeVault = vaults[0];
  const fixedApy = activeVault?.fixedApy || 0;
  const epoch = 20; // Hardcoded for testnet as per previous logs
  
  // Calculate days remaining
  const maturityDate = activeVault?.maturityDate ? new Date(activeVault.maturityDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const daysRemaining = Math.max(0, Math.ceil((maturityDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  const kpis = [
    {
      id: 'portfolio',
      label: 'Portfolio Value',
      value: getFormattedUsd(totalValue),
      icon: Briefcase,
      color: 'text-emerald-400',
    },
    {
      id: 'invested',
      label: 'Total Invested',
      value: getFormattedUsd(totalInvested),
      icon: ShieldCheck,
      color: 'text-blue-400',
    },
    {
      id: 'pnl',
      label: 'Unrealized PnL',
      value: getFormattedUsd(unrealizedPnl),
      icon: unrealizedPnl >= 0 ? TrendingUp : TrendingDown,
      color: unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400',
    },
    {
      id: 'yield',
      label: 'Claimable Yield',
      value: getFormattedUsd(portfolio?.metrics?.totalClaimableYieldUsd),
      icon: HandCoins,
      color: 'text-amber-400',
    },
    {
      id: 'apy',
      label: 'Fixed APY',
      value: loading ? <div className="h-8 w-16 animate-pulse rounded bg-white/10" /> : `${fixedApy}%`,
      icon: Activity,
      color: 'text-purple-400',
    },
    {
      id: 'pt',
      label: 'PT Holdings',
      value: getNumericString(ptHoldings.toFixed(2)),
      icon: Layers,
      color: 'text-emerald-300',
    },
    {
      id: 'yt',
      label: 'YT Holdings',
      value: getNumericString(ytHoldings.toFixed(2)),
      icon: Layers,
      color: 'text-emerald-500',
    },
    {
      id: 'epoch',
      label: 'Current Epoch / Days',
      value: loading ? <div className="h-8 w-16 animate-pulse rounded bg-white/10" /> : `Epoch ${epoch} (${daysRemaining}d)`,
      icon: Clock,
      color: 'text-gray-400',
    },
  ];

  const hasYieldPositions = yieldAssets.length > 0;
  const claimableYield = portfolio?.metrics?.totalClaimableYieldUsd || 0;
  const isClaimableZero = claimableYield === 0;
  const showYieldCallout = !loading && !error && portfolio && portfolio.error !== 'Wallet not connected' && hasYieldPositions && isClaimableZero;

  const ClaimableYieldCallout = () => (
    <div className="flex flex-col mt-0.5">
      <span className="text-[11px] font-medium tracking-wide text-nova-accent-hover font-sans">
        No yield has accrued yet.
      </span>
      <span className="text-[10px] leading-tight text-white/70 font-sans mt-0.5">
        Yield becomes claimable after the protocol harvests yield and the SY exchange rate increases.
      </span>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map((kpi, index) => (
        <MetricCard
          key={kpi.id}
          label={kpi.label}
          value={kpi.value}
          icon={kpi.icon}
          index={index}
          callout={kpi.id === 'yield' && showYieldCallout ? <ClaimableYieldCallout /> : undefined}
        />
      ))}
    </div>
  );
}
