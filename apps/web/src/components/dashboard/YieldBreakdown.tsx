'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { YieldService } from '../../services/yieldService';
import { Vault } from '../../types';
import { getUnderlyingApy } from '../../services/underlyingYieldService';
import { CardWaveDecoration } from '../ui/CardWaveDecoration';

export function YieldBreakdown() {
  const [vault, setVault] = useState<Vault | null>(null);
  const [underlyingApyLabel, setUnderlyingApyLabel] = useState('Loading...');

  useEffect(() => {
    YieldService.getVaults().then(vaults => {
      if (vaults.length > 0) setVault(vaults[0]);
    }).catch(console.error);
    getUnderlyingApy().then(result => {
      setUnderlyingApyLabel(result.status === 'ok' ? `${result.apy.toFixed(2)}%` : 'Insufficient data');
    }).catch(() => setUnderlyingApyLabel('Insufficient data'));
  }, []);

  const hasVault = !!vault;
  // "Implied APY" — market-implied yield from PT price, NOT the underlying Blend APY.
  const impliedApy = vault ? vault.fixedApy.toFixed(2) : '--';
  const totalApy = vault ? vault.fixedApy.toFixed(1) : '--';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45, ease: 'easeOut' }}
      className="relative flex h-[320px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-[#BEB7A7]/50"
    >
      <CardWaveDecoration />
      <h3 className="relative z-10 font-sans font-medium ">Yield Breakdown</h3>

      {!hasVault ? (
        <div className="relative z-10 mt-6 flex flex-1 flex-col items-center justify-center text-[#F5F5F2]/60 text-sm text-center px-4">
          No yield has accrued yet.<br/>Yield becomes claimable after the protocol harvests yield.
        </div>
      ) : (
        <div className="relative z-10 mt-6 flex flex-1 items-center justify-between">
          
          {/* Custom SVG Circular Progress */}
          <div className="relative h-32 w-32 ml-4">
            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
              {/* Background Ring */}
              <path
                className="text-white/5"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              />
              {/* Fixed Yield (Highlight - full circle since no variable yet) */}
              <motion.path
                initial={{ strokeDasharray: '0 100' }}
                animate={{ strokeDasharray: '100 0' }}
                transition={{ duration: 1.5, ease: 'easeOut', delay: 0.8 }}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#BEB7A7"
                strokeWidth="2.5"
              />
            </svg>
            {/* Inner Total APY */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-serif text-[22px] text-[#BEB7A7]">{totalApy}%</span>
              <span className="text-[9px] text-[#F5F5F2]/60 uppercase tracking-wider mt-0.5">Implied APY</span>
            </div>
          </div>

          {/* Details List */}
          <div className="flex flex-col gap-5 mr-2">
            
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.9 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="h-1.5 w-1.5 rounded-full bg-[#BEB7A7]" />
                <span className="text-xs text-[#F5F5F2]/60">PT Implied APY</span>
              </div>
              <div className="pl-3.5 font-medium text-[#F5F5F2] text-sm">{impliedApy}%</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 1.0 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="h-1.5 w-1.5 rounded-full bg-[#F5F5F2]" />
                <span className="text-xs text-[#F5F5F2]/60">Underlying APY (Blend)</span>
              </div>
              <div className="pl-3.5 font-medium text-[#F5F5F2] text-sm">{underlyingApyLabel}</div>
            </motion.div>

          </div>

        </div>
      )}
    </motion.div>
  );
}
