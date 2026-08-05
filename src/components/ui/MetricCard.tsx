'use client';

import React from 'react';
import { motion } from 'framer-motion';

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  change?: React.ReactNode;
  isPositive?: boolean;
  icon: React.ElementType;
  sparkline?: string;
  index?: number;
  delay?: number;
  tooltip?: string;
  callout?: React.ReactNode;
}

export function MetricCard({ 
  label, 
  value, 
  change, 
  isPositive = true, 
  icon: Icon, 
  sparkline,
  index = 0,
  delay = 0.2,
  tooltip,
  callout
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay + index * 0.05, ease: 'easeOut' }}
      className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-nova-border bg-nova-surface p-4 transition-all duration-200 hover:border-nova-accent-hover hover:shadow-[0_0_18px_var(--accent-hover)] hover:-translate-y-[3px]"
    >
      {/* Top Row: Icon & Label */}
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-nova-muted transition-colors duration-200 group-hover:bg-nova-accent-hover/10 group-hover:text-nova-accent-hover">
          <Icon className="h-3 w-3" />
        </div>
        <div className="flex items-center gap-1 group/tooltip relative">
          <span className="text-[10px] font-medium uppercase tracking-wider text-nova-muted font-sans leading-none">
            {label}
          </span>
          {tooltip && (
            <>
              <span className="cursor-help text-nova-muted hover:text-nova-text transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              </span>
              <div className="absolute left-0 bottom-full mb-1 hidden group-hover/tooltip:block bg-[#222] border border-nova-border text-nova-text text-[10px] normal-case tracking-normal px-2 py-1.5 rounded shadow-xl whitespace-nowrap z-50">
                {tooltip}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Value */}
      <div className="mt-3 flex flex-col relative z-10 min-h-[28px]">
        <div className="font-serif text-[22px] leading-tight text-nova-text tracking-tight">
          {value}
        </div>
        {change && (
          <div className={`mt-1 text-[10px] font-medium font-sans ${isPositive ? 'text-nova-accent-hover' : 'text-red-400'}`}>
            {change}
          </div>
        )}
        {callout && (
          <div className="mt-2.5">
            {callout}
          </div>
        )}
      </div>

      {/* Bottom accent line — always visible, brightens on hover */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-nova-accent-hover/30 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      {/* Sparkline */}
      {sparkline && (
        <div className="absolute -bottom-1 left-0 right-0 h-7 opacity-20 transition-opacity duration-200 group-hover:opacity-60 z-0 pointer-events-none">
          <svg width="100%" height="100%" viewBox="0 0 50 20" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`sg-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#43D18C" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#43D18C" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={sparkline}
              fill="none"
              stroke="#43D18C"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={`${sparkline} L50,20 L0,20 Z`}
              fill={`url(#sg-${label.replace(/\s/g, '')})`}
              stroke="none"
            />
          </svg>
        </div>
      )}
    </motion.div>
  );
}
