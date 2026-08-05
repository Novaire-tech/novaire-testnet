import { useState } from 'react';
import { motion } from 'framer-motion';
import { Repeat, TrendingUp, ArrowDownToLine, ArrowUpFromLine, RefreshCcw, ChevronRight } from 'lucide-react';

const STRATEGIES = [
  {
    id: 's1',
    title: 'Auto Roll at Maturity',
    description: 'Automatically rolls PT/YT positions to the next active epoch upon maturity.',
    icon: Repeat,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    risk: 'Conservative'
  },
  {
    id: 's2',
    title: 'Auto Compound Yield',
    description: 'Claims Vault yield and automatically buys more PT to compound fixed returns.',
    icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    risk: 'Moderate'
  },
  {
    id: 's3',
    title: 'Auto Buy PT (Discount)',
    description: 'Executes a buy order for PT when the price falls below your target discount.',
    icon: ArrowDownToLine,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    risk: 'Aggressive'
  },
  {
    id: 's4',
    title: 'Auto Sell YT (Premium)',
    description: 'Automatically sells your Yield Tokens when the market price reaches your target premium.',
    icon: ArrowUpFromLine,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    risk: 'Aggressive'
  },
  {
    id: 's5',
    title: 'Auto Mint (Yield Target)',
    description: 'Mints PT & YT when the Vault APY exceeds your defined target.',
    icon: RefreshCcw,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    risk: 'Moderate'
  }
];

interface StrategyCardsProps {
  onSelect: (strategy: any) => void;
}

export function StrategyCards({ onSelect }: StrategyCardsProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {STRATEGIES.map((strategy, i) => {
        const Icon = strategy.icon;
        
        return (
          <motion.div
            key={strategy.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onMouseEnter={() => setHoveredId(strategy.id)}
            onMouseLeave={() => setHoveredId(null)}
            className={`group relative overflow-hidden rounded-2xl border border-nova-border bg-white/[0.02] p-6 backdrop-blur-xl transition-all ${
              strategy.id === 's1'
                ? 'cursor-pointer hover:border-nova-border hover:bg-white/[0.04]'
                : 'cursor-not-allowed opacity-40'
            }`}
            onClick={() => {
              if (strategy.id === 's1') {
                onSelect(strategy);
              }
            }}
            title={strategy.id !== 's1' ? 'This automation will be available in a future protocol upgrade.' : undefined}
          >
              {strategy.id !== 's1' && (
                <div className="absolute top-4 right-4 rounded bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Coming Soon
                </div>
              )}
              <div className="mb-4 flex items-center justify-between">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${strategy.bg} ${strategy.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                {strategy.id === 's1' && (
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
                    {strategy.risk}
                  </span>
                )}
              </div>
              
              <h3 className="mb-2 text-lg font-medium text-white">{strategy.title}</h3>
              <p className="mb-6 text-sm text-white/50">{strategy.description}</p>
              
              <div className="flex items-center justify-between border-t border-nova-border pt-4">
                <span className="text-xs text-white/40">Template</span>
                
                <div className={`flex items-center gap-1 text-sm font-medium transition-colors ${strategy.id === 's1' ? 'text-white/70 group-hover:text-white' : 'text-white/30'}`}>
                  Use Template
                  {strategy.id === 's1' && (
                    <ChevronRight className={`h-4 w-4 transition-transform ${hoveredId === strategy.id ? 'translate-x-1' : ''}`} />
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  }
