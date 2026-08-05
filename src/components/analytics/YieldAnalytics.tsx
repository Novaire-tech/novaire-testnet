'use client';

import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useYield } from '../../hooks/useYield';

const COLORS = ['#34d399', '#10b981', '#059669', '#047857'];

export function YieldAnalytics() {
  const { portfolio, loading: portLoading } = usePortfolio();
  const { vaults } = useYield();
  const activeVault = vaults.find(v => v.id === 'vault_xlm_01') || vaults[0];

  // Calculate allocation
  const ptValue = portfolio?.assets.filter(a => a.assetType === 'pt').reduce((acc, curr) => acc + curr.valueUsd, 0) || 0;
  const ytValue = portfolio?.assets.filter(a => a.assetType === 'yt').reduce((acc, curr) => acc + curr.valueUsd, 0) || 0;
  const walletValue = portfolio?.assets.filter(a => a.assetType === 'wallet').reduce((acc, curr) => acc + curr.valueUsd, 0) || 0;
  
  const isEmpty = ptValue === 0 && ytValue === 0 && walletValue === 0;

  const data = isEmpty
    ? [{ name: 'Empty', value: 1 }]
    : [
        { name: 'PT Position', value: ptValue },
        { name: 'YT Position', value: ytValue },
        { name: 'Wallet Assets', value: walletValue },
      ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-2xl border border-nova-border bg-white/5 p-6 backdrop-blur-xl"
      >
        <h3 className="text-lg font-semibold text-white mb-6">Portfolio Allocation</h3>
        <div className="h-64 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={85}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
                isAnimationActive={!isEmpty}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={isEmpty ? '#ffffff08' : COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              {!isEmpty && (
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#0f1714', borderColor: '#ffffff10', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(value: any) => `$${Number(value).toFixed(2)}`}
                />
              )}
              {!isEmpty && <Legend verticalAlign="bottom" height={36} iconType="circle" />}
            </PieChart>
          </ResponsiveContainer>
          {isEmpty && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none">
              <span className="text-[13px] font-medium text-white/80 tracking-wide font-sans mb-1">
                No holdings yet
              </span>
              <span className="text-[10px] text-white/40 leading-snug font-sans max-w-[180px]">
                Connect your wallet and deposit assets to view your allocation.
              </span>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="rounded-2xl border border-nova-border bg-white/5 p-6 backdrop-blur-xl"
      >
        <h3 className="text-lg font-semibold text-white mb-6">Yield Sources</h3>
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-xl bg-white/5 border border-nova-border">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-300">Fixed Yield (PT)</span>
              <span className="text-sm font-medium text-emerald-400">
                {activeVault ? `${activeVault.fixedApy.toFixed(2)}% APY` : '0.00% APY'}
              </span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5">
              <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: '80%' }}></div>
            </div>
          </div>
          
          <div className="p-4 rounded-xl bg-white/5 border border-nova-border">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-300">Variable Yield (YT)</span>
              <span className="text-sm font-medium text-blue-400">Variable</span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5">
              <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: '20%' }}></div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
