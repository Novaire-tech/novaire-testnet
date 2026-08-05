'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, TrendingUp, HandCoins, PiggyBank, Activity, ShieldCheck } from 'lucide-react';
import { usePortfolio } from '../../hooks/usePortfolio';
import { ProtocolService, ProtocolState } from '@/services/protocolService';
import { MetricCard } from '../ui/MetricCard';

const KPIS = [
  {
    id: 'portfolio',
    label: 'Portfolio Value',
    value: '0.00',
    change: '',
    isPositive: true,
    icon: Briefcase,
    sparkline: 'M0,10 L50,10',
  },
  {
    id: 'yield',
    label: "Today's Yield",
    value: '0.00',
    change: '',
    isPositive: true,
    icon: TrendingUp,
    sparkline: 'M0,10 L50,10',
  },
  {
    id: 'claimable',
    label: 'Claimable Yield',
    value: '0.00',
    change: '',
    isPositive: true,
    icon: HandCoins,
    sparkline: 'M0,10 L50,10',
  },
  {
    id: 'invested',
    label: 'Total Invested',
    value: '0.00',
    change: '',
    isPositive: true,
    icon: PiggyBank,
    sparkline: 'M0,10 L50,10',
  },
  {
    id: 'positions',
    label: 'Active Positions',
    value: '0',
    change: '',
    isPositive: true,
    icon: Activity,
    sparkline: 'M0,10 L50,10',
  },
  {
    id: 'tvl',
    label: 'Protocol TVL',
    value: '0.00',
    change: '',
    isPositive: true,
    icon: ShieldCheck,
    sparkline: 'M0,10 L50,10',
  },
];

export function KPICards() {
  const { portfolio, loading, error } = usePortfolio();
  const [protocolState, setProtocolState] = useState<ProtocolState | null>(null);

  useEffect(() => {
    ProtocolService.getProtocolState().then(setProtocolState).catch(console.error);
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const getKpiValue = (id: string, fallback: string) => {
    if (loading) return <div className="h-8 w-32 animate-pulse rounded bg-white/10" />;
    if (error === 'Wallet not connected' || portfolio?.error === 'Wallet not connected') return 'Connect Wallet';
    if (!portfolio) return fallback;

    const formatXlmAndUsd = (xlm: number, usd: number) => {
      const xlmStr = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(xlm);
      return (
        <div className="flex items-baseline gap-2">
          <span>{xlmStr} XLM</span>
          <span className="font-sans text-[20px] text-nova-muted tracking-normal">
            ({formatCurrency(usd)})
          </span>
        </div>
      );
    };

    switch (id) {
      case 'portfolio':
        return formatXlmAndUsd(portfolio.totalValueXlm, portfolio.totalValueUsd);
      case 'invested':
        return formatXlmAndUsd(portfolio.metrics.totalInvestedXlm, portfolio.metrics.totalInvestedUsd);
      case 'positions':
        return portfolio.metrics.activePositions.toString();
      case 'yield':
        return <span className="text-[20px] text-nova-muted">Unavailable on Testnet</span>;
      case 'claimable':
        return formatXlmAndUsd(portfolio.metrics.totalClaimableYieldXlm, portfolio.metrics.totalClaimableYieldUsd);
      case 'tvl':
        return protocolState 
          ? formatXlmAndUsd(protocolState.tvlXlm, protocolState.tvlUsd) 
          : <div className="h-8 w-32 animate-pulse rounded bg-white/10" />;
      default:
        return fallback;
    }
  };

  const getKpiChange = (id: string, fallback: string) => {
    if (loading) return '';
    if (error === 'Wallet not connected' || portfolio?.error === 'Wallet not connected') return '';
    if (!portfolio) return fallback;

    switch (id) {
      case 'portfolio':
      case 'invested':
        return '0.0%';
      case 'claimable':
        return 'Ready';
      case 'yield':
      case 'tvl':
      case 'positions':
        return '';
      default:
        return fallback;
    }
  };

  const yieldAssets = portfolio?.assets?.filter(a => a.assetType === 'pt' || a.assetType === 'yt') || [];
  const hasYieldPositions = yieldAssets.length > 0;
  const isClaimableZero = portfolio?.metrics?.totalClaimableYieldUsd === 0;
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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
      {KPIS.map((kpi, i) => (
        <MetricCard
          key={kpi.id}
          label={kpi.label}
          value={getKpiValue(kpi.id, kpi.value)}
          change={getKpiChange(kpi.id, kpi.change)}
          isPositive={kpi.isPositive}
          icon={kpi.icon}
          sparkline={kpi.sparkline}
          index={i}
          callout={kpi.id === 'claimable' && showYieldCallout ? <ClaimableYieldCallout /> : undefined}
        />
      ))}
    </div>
  );
}
