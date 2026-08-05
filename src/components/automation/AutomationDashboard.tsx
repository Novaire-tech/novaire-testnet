import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Activity, TrendingUp, Calendar, Plus, CheckCircle2 } from 'lucide-react';
import { StrategyCards } from './StrategyCards';
import { ExecutionHistory } from './ExecutionHistory';
import { AutomationBuilderModal } from './AutomationBuilderModal';
import { YieldService } from '@/services/yieldService';
import { PageContainer } from '@/components/ui/PageContainer';
import { MetricCard } from '@/components/ui/MetricCard';
import { WalletService } from '@/services/walletService';
import { NotificationService } from '@/services/notificationService';

export function AutomationDashboard() {
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [activeStrategies, setActiveStrategies] = useState<any[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [vaults, setVaults] = useState<any[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    setIsClient(true);
    
    // One-time migration: wipe legacy storage keys
    try {
      localStorage.removeItem('novaire_automation_strategies');
      localStorage.removeItem('novaire_automations');
    } catch (e) {
      console.error('Failed to wipe legacy storage', e);
    }
    
    try {
      const saved = localStorage.getItem('novaire_automations_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        const validStrategies = parsed.filter((s: any) => s.strategy === 'Auto Roll at Maturity' && s.isReal);
        setActiveStrategies(validStrategies);
      }
    } catch (e) {
      console.error('Failed to parse saved strategies', e);
    }
  }, []);

  useEffect(() => {
    YieldService.getVaults().then(setVaults).catch(console.error);
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (isClient) {
      localStorage.setItem('novaire_automations_v2', JSON.stringify(activeStrategies));
    }
  }, [activeStrategies, isClient]);

  // Polling for on-chain status
  useEffect(() => {
    if (!isClient || activeStrategies.length === 0) return;
    
    let isMounted = true;
    
    const checkStatuses = async () => {
      try {
        const address = await WalletService.getWalletAddress();
        if (!address) return;
        
        const hasRealStrategies = activeStrategies.some(s => s.isReal && (s.eta === 'Registered' || s.eta === 'Executing'));
        if (!hasRealStrategies) return;
        
        const { Client: RolloverClient } = await import('../../../packages/bindings/rollover/src/index');
        const { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } = await import('../../config/contracts');
        
        const client = new RolloverClient({
          rpcUrl: RPC_URL,
          networkPassphrase: NETWORK_PASSPHRASE,
          contractId: CONTRACTS.ROLLOVER,
          publicKey: address,
        });
        
        const posTx = await client.get_position({ user: address });
        let position = null;
        if (posTx.result) {
          const unwrapped = typeof (posTx.result as any).unwrap === 'function' ? (posTx.result as any).unwrap() : posTx.result;
          position = unwrapped;
        }
        
        if (position && isMounted) {
          setActiveStrategies(prev => prev.map(s => {
            if (s.isReal && s.eta !== 'Executed') {
              const lastRolled = Number(position.last_rolled_ledger);
              const created = Number(position.created_ledger);
              
              if (lastRolled > created) {
                return { ...s, eta: 'Executed' };
              }
            }
            return s;
          }));
        }
      } catch (e) {
        console.warn('Failed to poll rollover position status:', e);
      }
    };
    
    checkStatuses();
    const interval = setInterval(checkStatuses, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeStrategies, isClient]);

  const handleCreateStrategy = (template?: any) => {
    setSelectedTemplate(template || null);
    setIsBuilderOpen(true);
  };

  const handleStrategySubmit = (strategy: any) => {
    console.log('Strategy Deployed:', strategy);
    
    // Locally save the strategy to reflect in the UI
    const newStrategy = {
      id: strategy.id || Date.now().toString(),
      strategy: selectedTemplate?.title || 'Custom Strategy',
      risk: selectedTemplate?.risk || 'Moderate',
      trigger: strategy.condition,
      action: strategy.action,
      eta: strategy.status || 'Registering',
      txHash: strategy.txHash,
      isReal: strategy.isReal
    };
    
    setActiveStrategies(prev => [newStrategy, ...prev]);
    
    NotificationService.addNotification('automation', 'Auto Roll Registered', `Successfully registered strategy: ${newStrategy.strategy}`);
  };

  const renderNextExecution = () => {
    if (activeStrategies.length === 0) {
      return (
        <div className="mt-1">
          <p className="text-[17px] font-semibold text-white">No scheduled executions.</p>
        </div>
      );
    }

    const autoRoll = activeStrategies.find(s => s.strategy === 'Auto Roll at Maturity');
    
    if (autoRoll) {
      const vault = vaults.find(v => autoRoll.trigger.includes(v.asset) || autoRoll.trigger.includes('Selected Vault')) || vaults[0];
      
      if (vault) {
        const maturity = new Date(vault.maturityDate);
        const now = new Date();
        const diffTime = maturity.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return (
          <div className="mt-1">
            <p className="text-[13px] font-medium text-blue-400 mb-0.5">{autoRoll.strategy}</p>
            <p className="text-lg font-semibold text-white leading-tight">
              {diffDays > 0 ? `${diffDays} Days Remaining` : `Executes on ${maturity.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
            </p>
          </div>
        );
      }
      return (
        <div className="mt-1">
          <p className="text-[13px] font-medium text-blue-400 mb-0.5">{autoRoll.strategy}</p>
          <p className="text-lg font-semibold text-white leading-tight">Pending Calculation</p>
        </div>
      );
    }

    const oldestMarket = activeStrategies[activeStrategies.length - 1];
    
    let metric = 'Market Data';
    if (oldestMarket.trigger.includes('PT Price')) metric = 'PT Price';
    else if (oldestMarket.trigger.includes('YT Price')) metric = 'YT Price';
    else if (oldestMarket.trigger.includes('Claimable Yield')) metric = 'Claimable Yield';
    else if (oldestMarket.trigger.includes('APY')) metric = 'Vault APY';
    
    let waitingFor = oldestMarket.trigger?.replace('IF ', '') || '';
    // Clean up generic vault names from trigger for better fit
    waitingFor = waitingFor.replace('Selected Vault ', '').replace('Novaire XLM Vault ', '');

    return (
      <div className="mt-1">
        <p className="text-[13px] font-medium text-purple-400 mb-0.5 truncate">{oldestMarket.strategy}</p>
        <p className="text-[11px] text-white/50 mb-0.5 uppercase tracking-wide">Monitoring {metric}</p>
        <p className="text-[14px] font-semibold text-white truncate">Waiting for {waitingFor}</p>
      </div>
    );
  };

  return (
    <PageContainer
      title="Intent Automation"
      description="Configure conditional strategies and automate your yield execution."
    >
      <div className="mb-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Active Strategies"
            value={activeStrategies.length.toString()}
            icon={Activity}
            index={0}
          />
          <MetricCard
            label="Total Automations"
            value={activeStrategies.length.toString()}
            icon={Zap}
            index={1}
          />
          <MetricCard
            label="Extra Yield Earned"
            value="0 XLM"
            icon={TrendingUp}
            index={2}
          />
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-nova-border bg-nova-surface p-4 transition-all duration-200 hover:border-nova-accent-hover hover:shadow-[0_0_18px_var(--accent-hover)] hover:-translate-y-[3px]">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-orange-400 transition-colors duration-200 group-hover:bg-nova-accent-hover/10 group-hover:text-nova-accent-hover">
                <Calendar className="h-3 w-3" />
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-nova-muted font-sans leading-none">
                Next Execution
              </span>
            </div>
            
            <div className="mt-3 flex flex-col relative z-10 min-h-[28px]">
              {renderNextExecution()}
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-nova-accent-hover/30 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
          </div>
        </div>
      </div>

      <div className="mb-12">
        <h2 className="mb-6 text-xl font-medium text-white">Strategy Templates</h2>
        <StrategyCards onSelect={handleCreateStrategy} />
      </div>

      <div className="mb-12">
        <ExecutionHistory upcoming={activeStrategies} />
      </div>

      {/* Builder Modal */}
      <AutomationBuilderModal 
        isOpen={isBuilderOpen} 
        onClose={() => setIsBuilderOpen(false)} 
        onSubmit={handleStrategySubmit}
        initialTemplate={selectedTemplate}
      />
    </PageContainer>
  );
}


