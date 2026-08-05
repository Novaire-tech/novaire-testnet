'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { YieldService } from '../../services/yieldService';
import { Vault } from '../../types';

export function YieldBreakdown() {
  const [vault, setVault] = useState<Vault | null>(null);

  useEffect(() => {
    YieldService.getVaults().then(vaults => {
      if (vaults.length > 0) setVault(vaults[0]);
    }).catch(console.error);
  }, []);

  const hasVault = !!vault;
  const fixedApy = vault ? vault.fixedApy.toFixed(2) : '--';
  const totalApy = vault ? vault.fixedApy.toFixed(1) : '--';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45, ease: 'easeOut' }}
      className="flex h-[320px] flex-col rounded-2xl border border-nova-border bg-nova-surface p-6 transition-colors hover:border-nova-accent/50"
    >
      <h3 className="font-sans font-medium ">Yield Breakdown</h3>
      
      {!hasVault ? (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center text-nova-muted text-sm text-center px-4">
          No yield has accrued yet.<br/>Yield becomes claimable after the protocol harvests yield.
        </div>
      ) : (
        <div className="mt-6 flex flex-1 items-center justify-between">
          
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
                stroke="#3ECF8E"
                strokeWidth="2.5"
              />
            </svg>
            {/* Inner Total APY */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-serif text-[22px] text-nova-accent">{totalApy}%</span>
              <span className="text-[9px] text-nova-muted uppercase tracking-wider mt-0.5">Total APY</span>
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
                <div className="h-1.5 w-1.5 rounded-full bg-nova-accent" />
                <span className="text-xs text-nova-muted">Fixed Base APY</span>
              </div>
              <div className="pl-3.5 font-medium text-nova-text text-sm">{fixedApy}%</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 1.0 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="h-1.5 w-1.5 rounded-full bg-[#F5F5F2]" />
                <span className="text-xs text-nova-muted">Est. Variable Yield</span>
              </div>
              <div className="pl-3.5 font-medium text-nova-text text-sm">Not available</div>
            </motion.div>

          </div>

        </div>
      )}
    </motion.div>
  );
}
