import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Settings, Clock, ChevronDown } from 'lucide-react';
import { YieldService } from '@/services/yieldService';
import { WalletService } from '@/services/walletService';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useTrade } from '@/hooks/useTrade';
import { useWallet } from '@/hooks/useWallet';

interface AutomationBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (strategy: any) => void;
  initialTemplate?: any;
}

export function AutomationBuilderModal({ isOpen, onClose, onSubmit, initialTemplate }: AutomationBuilderModalProps) {
  // Custom State
  const [conditionAsset, setConditionAsset] = useState('PT Price');
  const [conditionOperator, setConditionOperator] = useState('<');
  const [conditionValue, setConditionValue] = useState('0.95');
  const [actionType, setActionType] = useState('Buy');
  const [actionAsset, setActionAsset] = useState('PT');
  const [actionAmount, setActionAmount] = useState('1000');

  // Common State
  const [slippage, setSlippage] = useState('0.5');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Template Specific State
  const [s1Amount, setS1Amount] = useState('1000');
  const [s1Action, setS1Action] = useState('Redeem PT & Mint Next Epoch');
  const [s2Threshold, setS2Threshold] = useState('10');
  const [s2Operator, setS2Operator] = useState('>');
  const [s2Action, setS2Action] = useState('Claim Yield & Reinvest into Same Vault');
  const [s3Target, setS3Target] = useState('0.90');
  const [s3Operator, setS3Operator] = useState('<');
  const [s3Amount, setS3Amount] = useState('1000');
  const [s4Target, setS4Target] = useState('0.15');
  const [s4Operator, setS4Operator] = useState('>');
  const [s4Amount, setS4Amount] = useState('100');
  const [s5Target, setS5Target] = useState('15');
  const [s5Operator, setS5Operator] = useState('>=');
  const [s5Amount, setS5Amount] = useState('500');
  
  const [isExecutionExpanded, setIsExecutionExpanded] = useState(false);

  const [vaults, setVaults] = useState<any[]>([]);
  const [selectedVaultId, setSelectedVaultId] = useState<string>('');
  const [claimableYield, setClaimableYield] = useState<number>(0);
  
  const { portfolio, loading } = usePortfolio();
  const { marketData } = useTrade();
  const { isConnected, balances } = useWallet();
  
  console.log(`[AutomationBuilderModal Render] loading=${loading}, portfolio=${portfolio ? 'Exists' : 'Null'}, assets=${portfolio?.assets?.length || 0}`);
  
  const currentPtPrice = marketData?.ptPrice || 0;
  const currentYtPrice = marketData?.ytPrice || 0;

  useEffect(() => {
    YieldService.getVaults().then((vaultsData) => {
      setVaults(vaultsData);
      if (vaultsData.length > 0) {
        // Prioritize the user's active deployed vault (Epoch 17 XLM) over mock vaults
        const activeVault = vaultsData.find(v => v.asset === 'XLM' || (Array.isArray(v.asset) && v.asset.includes('XLM'))) || vaultsData[0];
        setSelectedVaultId(activeVault.id);
      }
    }).catch(console.error);

    if (isOpen && initialTemplate) {
      // Reset or initialize values if needed
    }
  }, [isOpen, initialTemplate]);

  useEffect(() => {
    // Calculate claimable yield when vault or portfolio changes
    if (portfolio && selectedVaultId && vaults.length > 0) {
      let yieldCalc = 0;
      const vaultAssets = portfolio.assets.filter((a: any) => a.assetType === 'vault');
      const selectedVault = vaults.find(v => v.id === selectedVaultId);
      
      if (selectedVault) {
        vaultAssets.forEach((asset: any) => {
          const match = asset.assetCode.match(/\((.*?)\)/);
          const underlying = match ? match[1] : 'Unknown';
          // Check if this vault asset matches the selected vault's underlying
          if ((Array.isArray(selectedVault.asset) ? selectedVault.asset.includes(underlying) : selectedVault.asset === underlying)) {
            const addedYield = asset.claimableYield || 0;
            if (!isNaN(addedYield) && isFinite(addedYield)) yieldCalc += addedYield;
          }
        });
      }
      setClaimableYield(yieldCalc);
    }
  }, [selectedVaultId, vaults, portfolio]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    // Add validation for S3
    if (initialTemplate?.id === 's3') {
      const parsedAmount = parseFloat(s3Amount);
      const parsedTarget = parseFloat(s3Target);
      if (isNaN(parsedAmount) || parsedAmount <= 0 || isNaN(parsedTarget) || parsedTarget <= 0) {
        setIsSubmitting(false);
        return;
      }
    }
    // Add validation for S4
    if (initialTemplate?.id === 's4') {
      const parsedAmount = parseFloat(s4Amount);
      const parsedTarget = parseFloat(s4Target);
      
      let availableYt = 0;
      if (portfolio) {
        const selectedVault = vaults.find(v => v.id === selectedVaultId);
        const underlying = selectedVault?.asset || 'XLM';
        const ytAsset = portfolio.assets.find((a: any) => a.assetType === 'yt' && a.assetCode.includes(underlying));
        if (ytAsset && !isNaN(ytAsset.balance)) {
          availableYt = ytAsset.balance;
        }
      }

      if (isNaN(parsedAmount) || parsedAmount <= 0 || isNaN(parsedTarget) || parsedTarget <= 0 || parsedAmount > availableYt) {
        setIsSubmitting(false);
        return;
      }
    }
    if (initialTemplate?.id === 's2' && parseFloat(s2Threshold) <= 0) {
      setIsSubmitting(false);
      return;
    }
    if (initialTemplate?.id === 's5') {
      const parsedAmount = parseFloat(s5Amount);
      const parsedTarget = parseFloat(s5Target);
      
      let availableXlm = 0;
      if (isConnected) {
        const xlmBalance = balances.find((b: any) => b.assetCode === 'XLM' || b.isNative);
        if (xlmBalance && !isNaN(parseFloat(xlmBalance.amount))) {
          availableXlm = parseFloat(xlmBalance.amount);
        }
      }

      if (!isConnected || isNaN(parsedAmount) || parsedAmount <= 0 || isNaN(parsedTarget) || parsedTarget <= 0 || parsedAmount > availableXlm) {
        setIsSubmitting(false);
        return;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSubmitting(false);
    
    let conditionDesc = '';
    let actionDesc = '';

    const id = initialTemplate?.id;

    if (!id) {
      setIsSubmitting(false);
      return;
    } else if (initialTemplate?.id === 's1') {
      const parsedAmount = parseFloat(s1Amount);
      
      let availablePt = 0;
      if (portfolio) {
        const ptAsset = portfolio.assets.find((a: any) => a.assetType === 'pt');
        if (ptAsset && !isNaN(ptAsset.balance)) {
          availablePt = ptAsset.balance;
        }
      }

      if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > availablePt) {
        setIsSubmitting(false);
        return;
      }

      try {
        const address = await WalletService.getWalletAddress();
        if (!address) throw new Error('Wallet not connected');

        const { signTransaction } = await import('@stellar/freighter-api');
        const { Client: RolloverClient } = await import('../../../packages/bindings/rollover/src/index');
        const { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } = await import('../../config/contracts');
        
        const client = new RolloverClient({
          rpcUrl: RPC_URL,
          networkPassphrase: NETWORK_PASSPHRASE,
          contractId: CONTRACTS.ROLLOVER,
          publicKey: address,
        });

        const currentMaturityLedger = await YieldService.getActiveMaturityLedger();
        if (currentMaturityLedger === 0) throw new Error('Failed to fetch active maturity ledger');

        const amountStroops = BigInt(Math.floor(parsedAmount * 10000000));
        
        const tx = await client.register_rollover({
          user: address,
          pt_amount: amountStroops,
          current_epoch_maturity: currentMaturityLedger,
          min_rate_bps: 0n,
          min_underlying_out: 0n
        });

        // @ts-ignore
        const result = await tx.signAndSend({ signTransaction });
        
        try {
          await fetch('/api/keeper/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: address })
          });
        } catch (e) {
          console.warn('Failed to notify local keeper service', e);
        }

        const selectedVault = vaults.find(v => v.id === selectedVaultId);
        const vaultName = selectedVault ? `${selectedVault.protocol} ${selectedVault.asset} Vault` : 'Selected Vault';
        
        onSubmit({
          condition: `IF ${vaultName} Reaches Maturity`,
          action: `THEN Roll ${parsedAmount} PT`,
          status: 'Registered',
          id: (result as any).hash || Math.random().toString(36).substring(7),
          isReal: true,
          txHash: (result as any).hash
        });
      } catch (e) {
        console.error('Failed to register rollover', e);
      } finally {
        setIsSubmitting(false);
        onClose();
      }
      return;
    } else if (id === 's2') {
      const selectedVault = vaults.find(v => v.id === selectedVaultId);
      const vaultName = selectedVault ? `${selectedVault.protocol} ${selectedVault.asset} Vault` : 'Selected Vault';
      conditionDesc = `IF ${vaultName} Claimable Yield ${s2Operator} ${s2Threshold}`;
      actionDesc = `THEN ${s2Action}`;
    } else if (id === 's3') {
      conditionDesc = `IF PT Price ${s3Operator} ${s3Target}`;
      actionDesc = `THEN Buy ${s3Amount} PT`;
    } else if (id === 's4') {
      conditionDesc = `IF YT Price ${s4Operator} ${s4Target}`;
      actionDesc = `THEN Sell ${s4Amount} YT`;
    } else if (id === 's5') {
      const selectedVault = vaults.find(v => v.id === selectedVaultId);
      const vaultName = selectedVault ? `${selectedVault.protocol} ${selectedVault.asset} Vault` : 'Selected Vault';
      conditionDesc = `IF ${vaultName} APY ${s5Operator} ${s5Target}%`;
      actionDesc = `THEN Deposit ${s5Amount} XLM & Mint`;
    }

    onSubmit({
      condition: conditionDesc,
      action: actionDesc,
      status: 'Active',
      id: Math.random().toString(36).substring(7)
    });
    onClose();
  };

  const renderTriggerFields = () => {
    const id = initialTemplate?.id;

    if (id === 's1') {
      const selectedVault = vaults.find(v => v.id === selectedVaultId);
      const epoch = selectedVault?.epoch || '-';
      const maturityDate = selectedVault ? new Date(selectedVault.maturityDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) : '';
      const vaultName = selectedVault ? `${selectedVault.protocol} ${selectedVault.asset} Vault` : '';

      let availablePt = 0;
      if (portfolio) {
        const ptAsset = portfolio.assets.find((a: any) => a.assetType === 'pt');
        if (ptAsset && !isNaN(ptAsset.balance)) {
          availablePt = ptAsset.balance;
        }
      }
      const parsedAmount = parseFloat(s1Amount);
      const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0;
      const isAmountWithinBalance = isAmountValid && parsedAmount <= availablePt;

      return (
        <div className="space-y-4">
          <div className="relative">
            <select
              value={selectedVaultId}
              onChange={(e) => setSelectedVaultId(e.target.value)}
              className="w-full appearance-none rounded-xl border border-nova-border bg-white/5 px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none"
            >
              {vaults.map((vault) => (
                <option key={vault.id} value={vault.id}>
                  {vault.protocol} {vault.asset} Vault (Epoch {epoch})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
          </div>
          
          <div className="rounded-xl border border-nova-border bg-white/[0.02] p-4">
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-sm font-medium text-white/70">PT Amount to Roll</label>
              <div className="text-xs text-white/50">
                Available: <span className="text-white">{availablePt.toFixed(4)} PT</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 mb-2">
              <input
                type="number"
                value={s1Amount}
                onChange={(e) => setS1Amount(e.target.value)}
                placeholder="1000"
                className="w-full rounded-lg border border-nova-border bg-white/10 px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none"
              />
              <button
                onClick={() => setS1Amount(availablePt.toString())}
                className="rounded-lg bg-blue-500/20 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-500/30 transition-colors"
              >
                Max
              </button>
              <span className="text-sm font-medium text-white">PT</span>
            </div>

            {!isAmountValid ? (
              <div className="mt-3 rounded-lg bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-400">
                Amount must be greater than zero.
              </div>
            ) : !isAmountWithinBalance ? (
              <div className="mt-3 rounded-lg bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-400">
                Amount cannot exceed available PT balance.
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-nova-border bg-white/[0.02] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white/70">
              <Clock className="h-4 w-4" />
              At Vault Maturity
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="mb-0.5 text-xs text-white/40">Vault</div>
                <div className="text-sm font-medium text-white">{vaultName}</div>
              </div>
              <div>
                <div className="mb-0.5 text-xs text-white/40">Epoch</div>
                <div className="text-sm font-medium text-white">{epoch}</div>
              </div>
              <div>
                <div className="mb-0.5 text-xs text-white/40">Execution</div>
                <div className="text-sm font-medium text-blue-400">{maturityDate}</div>
              </div>
            </div>
          </div>
          
          <div className="py-2">
            {renderDeployButton("w-full py-4 text-base shadow-xl")}
          </div>
        </div>
      );
    }
    if (id === 's2') {
      const selectedVault = vaults.find(v => v.id === selectedVaultId);
      const assetLabel = selectedVault?.asset || 'XLM';
      const parsedThreshold = parseFloat(s2Threshold);
      const isThresholdValid = !isNaN(parsedThreshold) && parsedThreshold > 0;
      
      let meetsCondition = false;
      if (isThresholdValid) {
        if (s2Operator === '>') meetsCondition = claimableYield > parsedThreshold;
        if (s2Operator === '>=') meetsCondition = claimableYield >= parsedThreshold;
        if (s2Operator === '<') meetsCondition = claimableYield < parsedThreshold;
        if (s2Operator === '<=') meetsCondition = claimableYield <= parsedThreshold;
      }

      return (
        <div className="space-y-4">
          <div className="relative">
            <select
              value={selectedVaultId}
              onChange={(e) => setSelectedVaultId(e.target.value)}
              className="w-full appearance-none rounded-xl border border-nova-border bg-white/5 px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none"
            >
              {vaults.map((vault) => (
                <option key={vault.id} value={vault.id}>
                  {vault.protocol} {vault.asset} Vault
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
          </div>

          <div className="rounded-xl border border-nova-border bg-white/[0.02] p-5">
            <div className="mb-4">
              <div className="mb-1 text-xs text-white/40">Current Claimable Yield</div>
              <div className="text-xl font-semibold text-emerald-400">
                {claimableYield.toFixed(3)} {assetLabel}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-sm text-white/70">Execute when claimable yield</span>
              <div className="relative">
                <select
                  value={s2Operator}
                  onChange={(e) => setS2Operator(e.target.value)}
                  className="appearance-none rounded-lg border border-nova-border bg-white/10 px-3 py-1.5 pr-8 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                >
                  <option value=">">Greater Than (&gt;)</option>
                  <option value=">=">Greater or Equal (&gt;=)</option>
                  <option value="<">Less Than (&lt;)</option>
                  <option value="<=">Less or Equal (&lt;=)</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/50" />
              </div>
              <div className="relative flex-1 min-w-[100px]">
                <input
                  type="number"
                  value={s2Threshold}
                  onChange={(e) => setS2Threshold(e.target.value)}
                  placeholder="10"
                  className="w-full rounded-lg border border-nova-border bg-white/10 px-3 py-1.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                />
              </div>
              <span className="text-sm text-white/70">{assetLabel}</span>
            </div>

            {isThresholdValid ? (
              meetsCondition ? (
                <div className="rounded-lg bg-emerald-500/10 px-4 py-3 text-xs leading-relaxed text-emerald-400 font-medium">
                  Ready to Execute
                </div>
              ) : (
                <div className="rounded-lg bg-blue-500/10 px-4 py-3 text-xs leading-relaxed text-blue-300">
                  Waiting for Claimable Yield to exceed the configured threshold.
                </div>
              )
            ) : (
              <div className="rounded-lg bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-400">
                Threshold must be greater than zero.
              </div>
            )}
          </div>
        </div>
      );
    }
    if (id === 's3') {
      const selectedVault = vaults.find(v => v.id === selectedVaultId);
      
      return (
        <div className="space-y-4">
          <div className="relative">
            <select
              value={selectedVaultId}
              onChange={(e) => setSelectedVaultId(e.target.value)}
              className="w-full appearance-none rounded-xl border border-nova-border bg-white/5 px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none"
            >
              {vaults.map((vault) => (
                <option key={vault.id} value={vault.id}>
                  {vault.protocol} {vault.asset} Vault
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-nova-border bg-white/5 px-4 py-3 text-sm text-white flex-1">
              PT Price
            </div>
            <div className="rounded-xl border border-nova-border bg-white/5 px-4 py-3 text-sm text-white/50 w-16 text-center">
              &lt;
            </div>
            <input
              type="number"
              value={s3Target}
              onChange={(e) => setS3Target(e.target.value)}
              placeholder="Target Price"
              step="0.01"
              className="rounded-xl border border-nova-border bg-white/5 px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none flex-1"
            />
          </div>
        </div>
      );
    }
    if (id === 's4') {
      return (
        <div className="space-y-4">
          <div className="relative">
            <select
              value={selectedVaultId}
              onChange={(e) => setSelectedVaultId(e.target.value)}
              className="w-full appearance-none rounded-xl border border-nova-border bg-white/5 px-4 py-3 text-sm text-white focus:border-orange-500/50 focus:outline-none"
            >
              {vaults.map((vault) => (
                <option key={vault.id} value={vault.id}>
                  {vault.protocol} {vault.asset} Vault
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-nova-border bg-white/5 px-4 py-3 text-sm text-white flex-1">
              YT Price
            </div>
            <div className="rounded-xl border border-nova-border bg-white/5 px-4 py-3 text-sm text-white/50 w-16 text-center">
              &gt;
            </div>
            <input
              type="number"
              value={s4Target}
              onChange={(e) => setS4Target(e.target.value)}
              placeholder="Target Price"
              step="0.01"
              className="rounded-xl border border-nova-border bg-white/5 px-4 py-3 text-sm text-white focus:border-orange-500/50 focus:outline-none flex-1"
            />
          </div>
        </div>
      );
    }
    if (id === 's5') {
      const selectedVault = vaults.find(v => v.id === selectedVaultId);
      const currentApy = selectedVault?.fixedApy || 0;
      const parsedTarget = parseFloat(s5Target);
      const isTargetValid = !isNaN(parsedTarget) && parsedTarget > 0;

      return (
        <div className="space-y-4">
          <div className="relative">
            <select
              value={selectedVaultId}
              onChange={(e) => setSelectedVaultId(e.target.value)}
              className="w-full appearance-none rounded-xl border border-nova-border bg-white/5 px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none"
            >
              {vaults.map((vault) => (
                <option key={vault.id} value={vault.id}>
                  {vault.protocol} {vault.asset} Vault
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
          </div>

          <div className="rounded-xl border border-nova-border bg-white/[0.02] p-5">
            <div className="mb-4">
              <div className="mb-1 text-xs text-white/40">Current Vault APY</div>
              <div className="text-xl font-semibold text-blue-400">
                {currentApy.toFixed(2)}%
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-sm text-white/70">Execute when Vault APY</span>
              <div className="relative">
                <select
                  value={s5Operator}
                  onChange={(e) => setS5Operator(e.target.value)}
                  className="appearance-none rounded-lg border border-nova-border bg-white/10 px-3 py-1.5 pr-8 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                >
                  <option value=">">Greater Than (&gt;)</option>
                  <option value=">=">Greater or Equal (&ge;)</option>
                  <option value="<">Less Than (&lt;)</option>
                  <option value="<=">Less or Equal (&le;)</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/50" />
              </div>
              <div className="relative flex-1 min-w-[100px]">
                <input
                  type="number"
                  value={s5Target}
                  onChange={(e) => setS5Target(e.target.value)}
                  placeholder="15"
                  className="w-full rounded-lg border border-nova-border bg-white/10 px-3 py-1.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                />
              </div>
              <span className="text-sm text-white/70">%</span>
            </div>

            {!isTargetValid && (
              <div className="rounded-lg bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-400">
                APY threshold must be greater than zero.
              </div>
            )}
          </div>
        </div>
      );
    }

      return null;
  };

  const renderActionFields = () => {
    const id = initialTemplate?.id;

    if (id === 's1') {
      return (
        <div className="rounded-xl border border-nova-border bg-white/[0.02] overflow-hidden">
          <button 
            onClick={() => setIsExecutionExpanded(!isExecutionExpanded)}
            className="w-full flex items-center justify-between p-4 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white/90">Execution Details</span>
            </div>
            <ChevronDown className={`h-4 w-4 text-white/50 transition-transform ${isExecutionExpanded ? 'rotate-180' : ''}`} />
          </button>
          
          <AnimatePresence>
            {isExecutionExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="px-4 pb-4"
              >
                <div className="pt-2 border-t border-nova-border/50">
                  <div className="mb-4 rounded-md bg-blue-500/10 px-3 py-2 text-[11px] leading-tight text-blue-300">
                    Auto Roll compounds your principal automatically. New YT are sold and XLM proceeds sent to your wallet. Behavior is fixed (yt_sale_percentage = 100) for Mainnet. Keeper executes on maturity.
                  </div>

                  <h4 className="mb-2 text-xs font-medium text-white/70 uppercase tracking-wider">Execution Sequence</h4>
                  
                  <div className="flex flex-col gap-0.5 text-xs text-white/80">
                    <div className="flex gap-2.5 items-start">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/70 shrink-0 mt-0.5">1</span>
                      <span className="leading-tight pt-0.5">Redeem selected PT into XLM</span>
                    </div>
                    <div className="ml-2 w-[1px] h-1.5 bg-white/10 my-0.5"></div>
                    
                    <div className="flex gap-2.5 items-start">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/70 shrink-0 mt-0.5">2</span>
                      <span className="leading-tight pt-0.5">Mint new PT and YT for next epoch</span>
                    </div>
                    <div className="ml-2 w-[1px] h-1.5 bg-white/10 my-0.5"></div>
                    
                    <div className="flex gap-2.5 items-start">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/70 shrink-0 mt-0.5">3</span>
                      <span className="leading-tight pt-0.5">Sell 100% of newly minted YT</span>
                    </div>
                    <div className="ml-2 w-[1px] h-1.5 bg-white/10 my-0.5"></div>
                    
                    <div className="flex gap-2.5 items-start">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/70 shrink-0 mt-0.5">4</span>
                      <span className="leading-tight pt-0.5">Send XLM proceeds to your wallet</span>
                    </div>
                    <div className="ml-2 w-[1px] h-1.5 bg-white/10 my-0.5"></div>
                    
                    <div className="flex gap-2.5 items-start">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/70 shrink-0 mt-0.5">5</span>
                      <span className="leading-tight pt-0.5">Keep new PT registered for next cycle</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }
    if (id === 's2') {
      return null;
    }
    if (id === 's3') {
      const selectedVault = vaults.find(v => v.id === selectedVaultId);
      const assetLabel = selectedVault?.asset || 'XLM';
      const parsedAmount = parseFloat(s3Amount);
      const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0;
      const estimatedCost = (parsedAmount > 0 && currentPtPrice > 0) ? (parsedAmount * currentPtPrice) : 0;

      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-nova-border bg-white/[0.02] p-5">
            <label className="mb-2 block text-sm font-medium text-white/70">Buy Amount</label>
            <div className="flex items-center gap-3 mb-4">
              <input
                type="number"
                value={s3Amount}
                onChange={(e) => setS3Amount(e.target.value)}
                placeholder="1000"
                className="w-full rounded-lg border border-nova-border bg-white/10 px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none"
              />
              <span className="text-sm font-medium text-white">PT</span>
            </div>
            
            <div className="mt-4 pt-4 border-t border-nova-border">
              <div className="flex justify-between items-center text-sm">
                <span className="text-white/50">Estimated Cost</span>
                <span className="font-semibold text-white">≈ {estimatedCost.toFixed(4)} {assetLabel}</span>
              </div>
            </div>
            
            {!isAmountValid && (
              <div className="mt-3 rounded-lg bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-400">
                Buy Amount must be greater than zero.
              </div>
            )}
          </div>
        </div>
      );
    }
    if (id === 's4') {
      if (loading) {
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-nova-border bg-white/[0.02] p-5 text-sm text-white/50 text-center animate-pulse">
              Loading Portfolio...
            </div>
          </div>
        );
      }
      if (!portfolio || !portfolio.assets || portfolio.assets.length === 0) {
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-nova-border bg-white/[0.02] p-5 text-sm text-white/50 text-center animate-pulse">
              Loading Portfolio Assets...
            </div>
          </div>
        );
      }
      const selectedVault = vaults.find(v => v.id === selectedVaultId);
      const assetLabel = selectedVault?.asset || 'XLM';
      
      let availableYt = 0;
      if (portfolio) {
        // Explicit YT lookup instead of substring matching
        const matchedAsset = portfolio.assets.find((a: any) => a.assetType === 'yt' && a.assetCode === `YT-${assetLabel}`);
        
        console.log("selectedVaultId", selectedVaultId);
        console.log("selectedVault", selectedVault);
        console.log("assetLabel", assetLabel);
        console.log("portfolio.assets", portfolio.assets);
        console.log("matched asset", matchedAsset);
        
        if (matchedAsset && !isNaN(matchedAsset.balance)) {
          availableYt = matchedAsset.balance;
        }
        
        console.log("availableYt", availableYt);
      }

      const parsedAmount = parseFloat(s4Amount);
      const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0;
      const isAmountWithinBalance = isAmountValid && parsedAmount <= availableYt;
      const estimatedReceive = (parsedAmount > 0 && currentYtPrice > 0) ? (parsedAmount * currentYtPrice) : 0;

      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-nova-border bg-white/[0.02] p-5">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-white/70">Sell Amount</label>
              <div className="text-xs text-white/50">
                Available: <span className="text-white">{availableYt.toFixed(4)} YT</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 mb-4">
              <input
                type="number"
                value={s4Amount}
                onChange={(e) => setS4Amount(e.target.value)}
                placeholder="100"
                className="w-full rounded-lg border border-nova-border bg-white/10 px-4 py-3 text-sm text-white focus:border-orange-500/50 focus:outline-none"
              />
              <button
                onClick={() => setS4Amount(availableYt.toString())}
                className="rounded-lg bg-orange-500/20 px-3 py-2 text-xs font-medium text-orange-400 hover:bg-orange-500/30 transition-colors"
              >
                Max
              </button>
              <span className="text-sm font-medium text-white">YT</span>
            </div>
            
            <div className="mt-4 pt-4 border-t border-nova-border">
              <div className="flex justify-between items-center text-sm">
                <span className="text-white/50">Estimated Receive</span>
                <span className="font-semibold text-white">≈ {estimatedReceive.toFixed(4)} {assetLabel}</span>
              </div>
            </div>
            
            {!isAmountValid ? (
              <div className="mt-3 rounded-lg bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-400">
                Sell Amount must be greater than zero.
              </div>
            ) : !isAmountWithinBalance ? (
              <div className="mt-3 rounded-lg bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-400">
                Sell amount cannot exceed available YT balance.
              </div>
            ) : null}
          </div>
        </div>
      );
    }
    if (id === 's5') {
      let availableXlm = 0;
      if (isConnected) {
        const xlmBalance = balances.find((b: any) => b.assetCode === 'XLM' || b.isNative);
        if (xlmBalance && !isNaN(parseFloat(xlmBalance.amount))) {
          availableXlm = parseFloat(xlmBalance.amount);
        }
      }

      const parsedAmount = parseFloat(s5Amount);
      const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0;
      const isAmountWithinBalance = isAmountValid && parsedAmount <= availableXlm;

      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-nova-border bg-white/[0.02] p-5">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-white/70">Deposit Amount</label>
              <div className="text-xs text-white/50">
                Available: <span className="text-white">{availableXlm.toFixed(4)} XLM</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 mb-4">
              <input
                type="number"
                value={s5Amount}
                onChange={(e) => setS5Amount(e.target.value)}
                placeholder="500"
                className="w-full rounded-lg border border-nova-border bg-white/10 px-4 py-3 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
              />
              <button
                onClick={() => setS5Amount(availableXlm.toString())}
                className="rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              >
                Max
              </button>
              <span className="text-sm font-medium text-white">XLM</span>
            </div>
            
            {!isConnected ? (
              <div className="mt-3 rounded-lg bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-400">
                Wallet disconnected. Please connect your wallet to proceed.
              </div>
            ) : !isAmountValid ? (
              <div className="mt-3 rounded-lg bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-400">
                Deposit amount must be greater than zero.
              </div>
            ) : !isAmountWithinBalance ? (
              <div className="mt-3 rounded-lg bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-400">
                Deposit amount cannot exceed available XLM balance.
              </div>
            ) : null}
          </div>
        </div>
      );
    }

      return null;
  };

  const showSlippage = initialTemplate?.id === 's3' || initialTemplate?.id === 's4' || !initialTemplate;

  const isDeployDisabled = 
    isSubmitting || 
    (initialTemplate?.id === 's1' && (parseFloat(s1Amount) <= 0 || isNaN(parseFloat(s1Amount)))) ||
    (initialTemplate?.id === 's2' && parseFloat(s2Threshold) <= 0) ||
    (initialTemplate?.id === 's3' && (parseFloat(s3Amount) <= 0 || parseFloat(s3Target) <= 0 || isNaN(parseFloat(s3Amount)) || isNaN(parseFloat(s3Target)))) ||
    (initialTemplate?.id === 's4' && (() => {
      const parsedAmount = parseFloat(s4Amount);
      const parsedTarget = parseFloat(s4Target);
      
      let availableYt = 0;
      if (portfolio) {
        const selectedVault = vaults.find(v => v.id === selectedVaultId);
        const underlying = selectedVault?.asset || 'XLM';
        const ytAsset = portfolio.assets.find((a: any) => a.assetType === 'yt' && a.assetCode.includes(underlying));
        if (ytAsset && !isNaN(ytAsset.balance)) availableYt = ytAsset.balance;
      }
      
      return isNaN(parsedAmount) || parsedAmount <= 0 || isNaN(parsedTarget) || parsedTarget <= 0 || parsedAmount > availableYt;
    })()) ||
    (initialTemplate?.id === 's5' && (() => {
      const parsedAmount = parseFloat(s5Amount);
      const parsedTarget = parseFloat(s5Target);
      
      let availableXlm = 0;
      if (isConnected) {
        const xlmBalance = balances.find((b: any) => b.assetCode === 'XLM' || b.isNative);
        if (xlmBalance && !isNaN(parseFloat(xlmBalance.amount))) availableXlm = parseFloat(xlmBalance.amount);
      }
      
      return !isConnected || isNaN(parsedAmount) || parsedAmount <= 0 || isNaN(parsedTarget) || parsedTarget <= 0 || parsedAmount > availableXlm;
    })());

  const renderDeployButton = (className?: string) => (
    <button
      onClick={handleSubmit}
      disabled={isDeployDisabled}
      className={`flex items-center justify-center gap-2 rounded-xl bg-nova-accent px-5 py-3 text-sm font-medium text-black transition-all duration-200 hover:brightness-110 hover:-translate-y-[1px] shadow-sm disabled:opacity-50 active:scale-[0.98] ${className || ''}`}
    >
      {isSubmitting ? (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
      ) : (
        <Zap className="h-4 w-4" />
      )}
      Deploy Strategy
    </button>
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-nova-border bg-nova-bg shadow-2xl flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-nova-border px-6 py-4 flex-shrink-0">
            <div>
              <h2 className="text-xl font-medium text-white">
                Strategy Builder {initialTemplate?.title ? `– ${initialTemplate.title}` : ''}
              </h2>
              <p className="text-sm text-white/50">
                {initialTemplate?.description || 'Define conditional intents for execution.'}
              </p>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-white/50 transition-colors hover:bg-white/5 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {/* IF Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                  <span className="text-sm font-bold">IF</span>
                </div>
                <h3 className="text-lg font-medium text-white">Condition Trigger</h3>
              </div>
              
              {renderTriggerFields()}
            </div>
            {/* THEN Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                  <span className="text-sm font-bold">THEN</span>
                </div>
                <h3 className="text-lg font-medium text-white">Execution Action</h3>
              </div>
              
              {/* Action Configuration */}
              {initialTemplate?.id === 's2' ? (
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-white/70">Action</label>
                  <div className="relative">
                    <select
                      value={s2Action}
                      onChange={(e) => setS2Action(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-nova-border bg-white/5 px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                    >
                      <option value="Claim Yield & Mint PT/YT">Claim Yield &amp; Mint PT/YT</option>
                      <option value="Claim Yield & Reinvest into Same Vault">Claim Yield &amp; Reinvest into Same Vault</option>
                      <option value="Claim Yield to Wallet">Claim Yield to Wallet</option>
                      <option value="Claim Yield & Buy PT">Claim Yield &amp; Buy PT</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                  </div>
                </div>
              ) : initialTemplate?.id === 's3' || initialTemplate?.id === 's4' ? (
                <div className="mb-4">
                  {renderActionFields()}
                </div>
              ) : (
                <div className="mb-4">
                  {renderActionFields()}
                </div>
              )}
            </div>

            {/* Execution Settings – inside scroll so footer stays pinned */}
            <div className="flex gap-4 pt-1">
              {initialTemplate?.id === 's4' && (
                <div className="flex-1 rounded-xl border border-nova-border bg-white/[0.02] p-3">
                  <div className="mb-1 text-xs text-white/40">Estimated Receive</div>
                  <div className="text-sm font-medium text-white">≈ {((parseFloat(s4Amount) || 0) * currentYtPrice).toFixed(4)} XLM</div>
                </div>
              )}
              <div className="flex-1 rounded-xl border border-nova-border bg-white/[0.02] p-3">
                <div className="mb-1 text-xs text-white/40">Network Fee</div>
                <div className="text-sm font-medium text-white">~0.0001 XLM</div>
              </div>
              {(!initialTemplate?.id || initialTemplate?.id === 's3' || initialTemplate?.id === 's4') && (
                <div className="flex-1 rounded-xl border border-nova-border bg-white/[0.02] p-3">
                  <div className="mb-1 text-xs text-white/40">Slippage Tolerance</div>
                  <div className="text-sm font-medium text-white">{slippage}%</div>
                </div>
              )}
            </div>
          </div>

          {/* Strategy Summary for S3 */}
          {initialTemplate?.id === 's3' && (
            <div className="px-6 mb-6">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                <h3 className="mb-3 text-sm font-semibold text-emerald-400">Strategy Summary</h3>
                <div className="space-y-2 text-sm text-white/80">
                  <p>
                    <span className="font-mono text-emerald-300">IF</span> PT Price {s3Operator} {parseFloat(s3Target) || 0} XLM
                  </p>
                  <p>
                    <span className="font-mono text-emerald-300">THEN</span> Buy {parseFloat(s3Amount) || 0} PT
                  </p>
                  <div className="pt-2 mt-2 border-t border-emerald-500/10">
                    <p className="font-medium">Estimated Cost: ≈ {((parseFloat(s3Amount) || 0) * currentPtPrice).toFixed(4)} XLM</p>
                  </div>
                  <p className="text-xs text-white/50 mt-3">This strategy will execute automatically once the condition is satisfied.</p>
                </div>
              </div>
            </div>
          )}

          {/* Strategy Summary for S4 */}
          {initialTemplate?.id === 's4' && (
            <div className="px-6 mb-6">
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5">
                <h3 className="mb-3 text-sm font-semibold text-orange-400">Strategy Summary</h3>
                <div className="space-y-2 text-sm text-white/80">
                  <p>
                    <span className="font-mono text-orange-300">IF</span> YT Price {s4Operator} {parseFloat(s4Target) || 0} XLM
                  </p>
                  <p>
                    <span className="font-mono text-orange-300">THEN</span> Sell {parseFloat(s4Amount) || 0} YT
                  </p>
                  <div className="pt-2 mt-2 border-t border-orange-500/10">
                    <p className="font-medium">Estimated Receive: ≈ {((parseFloat(s4Amount) || 0) * currentYtPrice).toFixed(4)} XLM</p>
                  </div>
                  <p className="text-xs text-white/50 mt-3">This strategy will execute automatically once the condition is satisfied.</p>
                </div>
              </div>
            </div>
          )}

          {/* Strategy Summary for S5 */}
          {initialTemplate?.id === 's5' && (
            <div className="px-6 mb-6">
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
                <h3 className="mb-3 text-sm font-semibold text-blue-400">Strategy Summary</h3>
                <div className="space-y-2 text-sm text-white/80">
                  <p>
                    <span className="font-mono text-blue-300">IF</span> Vault APY {s5Operator === '>=' ? '≥' : s5Operator === '<=' ? '≤' : s5Operator} {parseFloat(s5Target) || 0}%
                  </p>
                  <p>
                    <span className="font-mono text-emerald-300">THEN</span> Deposit {parseFloat(s5Amount) || 0} XLM
                  </p>
                  <p className="pl-12">Mint PT &amp; YT</p>
                  <div className="pt-2 mt-2 border-t border-blue-500/10">
                    <p className="font-medium text-white/70">Status</p>
                    <p className="text-white">Monitoring Selected Vault</p>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* Footer Actions – always pinned */}
          {initialTemplate?.id !== 's1' && (
            <div className="border-t border-nova-border px-5 py-3 flex-shrink-0">
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  className="rounded-xl border border-nova-border px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/5"
                >
                  Cancel
                </button>
                {renderDeployButton()}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
