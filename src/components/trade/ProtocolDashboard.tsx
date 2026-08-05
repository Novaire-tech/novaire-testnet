import React, { useEffect, useState } from 'react';
import { useTrade } from '../../hooks/useTrade';
import { usePortfolio } from '../../hooks/usePortfolio';

import { SectionCard } from '../ui/SectionCard';

export function ProtocolDashboard() {
  const { marketData, isLoadingMarket } = useTrade();
  const { portfolio } = usePortfolio();

  if (isLoadingMarket) {
    return (
      <div className="hidden lg:flex w-[400px]">
        <SectionCard className="w-full h-[560px]">
          <h2 className="text-sm font-medium text-nova-text mb-6">Market Overview</h2>
          <div className="flex-1 bg-white/5 rounded-xl animate-pulse h-full w-full"></div>
        </SectionCard>
      </div>
    );
  }

  if (!marketData) {
    return null;
  }

  const tvl = marketData.ptReserve + marketData.underlyingReserve;

  return (
    <div className="hidden lg:flex w-[400px]">
      <SectionCard className="w-full h-[560px] overflow-y-auto">
        <h2 className="font-sans font-medium text-[22px] text-nova-text tracking-tight mb-6">Live Protocol Dashboard</h2>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 rounded-xl bg-nova-surface border border-nova-border">
            <span className="text-sm text-nova-muted">Current PT Price</span>
            <span className="text-xl font-serif text-white">{marketData.ptPrice.toFixed(4)} XLM</span>
          </div>
          
          <div className="flex justify-between items-center p-3 rounded-xl bg-nova-surface border border-nova-border">
            <span className="text-sm text-nova-muted">Current YT Price</span>
            <span className="text-xl font-serif text-white">{marketData.ytPrice.toFixed(4)} XLM</span>
          </div>

          <div className="flex justify-between items-center p-3 rounded-xl bg-nova-surface border border-nova-border">
            <span className="text-sm text-nova-muted">Fixed APY</span>
            <span className="text-xl font-serif text-nova-accent">{marketData.fixedApy.toFixed(2)}%</span>
          </div>

          <div className="flex justify-between items-center p-3 rounded-xl bg-nova-surface border border-nova-border">
            <span className="text-sm text-nova-muted">TWAP</span>
            <span className="text-xl font-serif text-white">{marketData.twap.toFixed(4)} XLM</span>
          </div>

          <div className="border-t border-nova-border my-2"></div>

          <div className="flex justify-between items-center p-3 rounded-xl bg-nova-surface border border-nova-border">
            <span className="text-sm text-nova-muted">PT Reserve</span>
            <span className="text-sm font-medium text-white">{marketData.ptReserve.toLocaleString()} PT</span>
          </div>

          <div className="flex justify-between items-center p-3 rounded-xl bg-nova-surface border border-nova-border">
            <span className="text-sm text-nova-muted">Underlying Reserve</span>
            <span className="text-sm font-medium text-white">{marketData.underlyingReserve.toLocaleString()} XLM</span>
          </div>

          <div className="flex justify-between items-center p-3 rounded-xl bg-nova-surface border border-nova-border">
            <span className="text-sm text-nova-muted">TVL</span>
            <span className="text-xl font-serif text-white">{tvl.toLocaleString()} XLM</span>
          </div>

          <div className="border-t border-nova-border my-2"></div>

          <div className="flex justify-between items-center p-3 rounded-xl bg-nova-surface border border-nova-border">
            <span className="text-sm text-nova-muted">Current Epoch</span>
            <span className="text-sm font-medium text-white">Epoch 17</span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
