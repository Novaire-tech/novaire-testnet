'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown, Info, Loader2, Settings2, Wallet, X } from 'lucide-react';
import { useTrade, TradeAsset, TradeAction } from '../../hooks/useTrade';
import { useWallet } from '../../hooks/useWallet';
import { NotificationService } from '../../services/notificationService';

export function TradeInterface() {
  const { isConnected, connect, balances, refreshBalances } = useWallet();
  const { marketData, isLoadingMarket, quote, isQuoting, quoteError, isExecuting, getQuote, executeTrade, refreshMarket } = useTrade();

  const [asset, setAsset] = useState<TradeAsset>('PT');
  const [action, setAction] = useState<TradeAction>('Buy');
  const [amount, setAmount] = useState<string>('');
  const [slippage, setSlippage] = useState<number>(0.5);

  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  const [showMarketInfo, setShowMarketInfo] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const STROOP_SCALE = 10000000;

  // Handle amount change and quoting
  useEffect(() => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      getQuote(action, asset, 0, slippage);
      return;
    }
    const timer = setTimeout(() => {
      getQuote(action, asset, numAmount, slippage);
    }, 400); // Debounce
    return () => clearTimeout(timer);
  }, [amount, action, asset, slippage, getQuote]);

  // Determine which balance to show
  const balanceToDisplay = () => {
    if (action === 'Buy') {
      const b = balances.find(b => b.isNative || b.assetCode === 'XLM');
      return b ? parseFloat(b.amount) : 0;
    } else {
      // Selling PT or YT
      const b = balances.find(b => b.assetCode === asset || b.assetCode.includes(asset));
      // For now, if exact code not found, assume 0
      return b ? parseFloat(b.amount) : 0;
    }
  };

  const currentBalance = balanceToDisplay();

  const handleMax = () => {
    // Leave some XLM for fees if buying
    if (action === 'Buy' && currentBalance > 2) {
      setAmount((currentBalance - 1).toFixed(4));
    } else {
      setAmount(currentBalance.toString());
    }
  };

  const handleSwapExecute = async () => {
    try {
      const result: any = await executeTrade(action, asset, parseFloat(amount), slippage);
      
      console.log('--- Transaction Post-Submission ---');
      console.log('Object returned by signAndSend:', result);
      console.log('Transaction hash:', result?.hash || result?.id || 'Unknown');
      console.log('RPC response:', result);
      console.log('Transaction status:', result?.status || 'Unknown');
      
      if (result && result.status && result.status !== 'SUCCESS') {
        console.error('Contract error:', result);
        NotificationService.addNotification('network', 'Trade Failed', `Trade transaction failed on-chain. Status: ${result.status}`);
        return;
      }
      
      // Success flow
      refreshBalances();
      refreshMarket();
      
      // Dispatch global event for Portfolio & Recent Activity to refresh
      window.dispatchEvent(new CustomEvent('nova:refresh'));
      
      NotificationService.addNotification('transaction', 'Trade Successful', `Successfully executed ${action} for ${amount} ${action === 'Buy' ? 'XLM' : asset}.`);
      setAmount('');
    } catch (e: any) {
      console.error('Swap Execution Exception:', e);
      NotificationService.addNotification('transaction', 'Trade Failed', e.message || 'Failed to execute trade.');
    }
  };

  return (
    <div className="flex flex-col w-full h-full rounded-2xl border border-nova-border bg-nova-surface p-6 shadow-2xl relative overflow-hidden transition-all duration-200 hover:border-[#3ECF8E]/50 hover:shadow-[0_0_20px_rgba(62,207,142,0.15)] hover:-translate-y-[3px]">
      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#3ECF8E] opacity-[0.03] blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none" />

      {/* Header Tabs */}
      <div className="flex items-center justify-between mb-6 relative z-50">
        <div className="flex bg-nova-surface border border-nova-border p-1 rounded-xl">
          <button
            onClick={() => setAction('Buy')}
            className={`px-6 py-2 text-sm font-medium rounded-lg transition-all ${
              action === 'Buy'
                ? 'bg-nova-surface-hover text-nova-text shadow-sm'
                : 'text-nova-muted hover:text-nova-text'
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => setAction('Sell')}
            className={`px-6 py-2 text-sm font-medium rounded-lg transition-all ${
              action === 'Sell'
                ? 'bg-nova-surface-hover text-nova-text shadow-sm'
                : 'text-nova-muted hover:text-nova-text'
            }`}
          >
            Sell
          </button>
        </div>
        
        <div className="relative flex items-center gap-1">
          <button 
            onClick={() => setShowMarketInfo(true)}
            className="p-2 transition-colors rounded-xl text-nova-muted hover:text-nova-text hover:bg-white/5"
          >
            <Info className="w-5 h-5" />
          </button>
          <div className="relative z-50">
            <button 
              onClick={() => setShowSlippageSettings(!showSlippageSettings)}
              className={`p-2 transition-colors rounded-xl relative z-50 ${showSlippageSettings ? 'bg-white/10 text-nova-text' : 'text-nova-muted hover:text-nova-text hover:bg-white/5'}`}
            >
              <Settings2 className="w-5 h-5" />
            </button>
            
            {/* Local Slippage Dropdown */}
            <AnimatePresence>
              {showSlippageSettings && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSlippageSettings(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: -5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-12 z-50 w-[280px] rounded-xl border border-white/10 bg-[#111111]/95 backdrop-blur-xl p-4 shadow-2xl"
                  >
                    <h3 className="mb-3 text-sm font-medium text-white">Slippage Tolerance</h3>
                    <div className="flex gap-2 mb-3">
                      {[0.1, 0.5, 1.0].map(val => (
                        <button
                          key={val}
                          onClick={() => { setSlippage(val); setShowSlippageSettings(false); }}
                          className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                            slippage === val ? 'bg-[#3ECF8E]/20 text-[#3ECF8E] border border-[#3ECF8E]/30' : 'bg-white/5 text-white/70 hover:bg-white/10 border border-transparent'
                          }`}
                        >
                          {val}%
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-nova-muted font-medium">Custom (%)</span>
                      <input 
                        type="number" 
                        placeholder="0.0"
                        value={[0.1, 0.5, 1.0].includes(slippage) ? '' : slippage}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= 0) setSlippage(val);
                        }}
                        className="w-20 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white text-right focus:outline-none focus:border-[#3ECF8E]/50 transition-colors"
                      />
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Input Section */}
      <div className="flex flex-col gap-1 z-10 relative">
        <div className="flex justify-between text-sm text-nova-muted mb-1 px-1">
          <span>{action === 'Buy' ? 'You pay' : 'You sell'}</span>
          <span className="flex items-center gap-1 cursor-pointer hover:text-nova-text transition-colors" onClick={handleMax}>
            <Wallet className="w-3 h-3" />
            {currentBalance.toFixed(4)} {action === 'Buy' ? 'XLM' : asset}
          </span>
        </div>
        
        <div className="flex items-center bg-nova-surface border border-nova-border rounded-2xl p-4 focus-within:border-nova-accent/50 transition-colors">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="bg-transparent text-3xl text-nova-text font-semibold outline-none w-full placeholder:text-white/20"
          />
          <div className="flex items-center gap-2">
            <button onClick={handleMax} className="text-[10px] uppercase font-bold tracking-wider text-[#3ECF8E] bg-[#3ECF8E]/10 px-2 py-1 rounded-md">
              Max
            </button>
            <div className="flex items-center gap-2 bg-nova-surface-hover border border-nova-border px-3 py-1.5 rounded-xl ml-2">
              <span className="text-sm font-medium text-nova-text">{action === 'Buy' ? 'XLM' : asset}</span>
            </div>
          </div>
        </div>
      </div>



      {/* Output Section */}
      <div className="flex flex-col gap-1 z-10 relative">
        <div className="flex justify-between text-sm text-nova-muted mb-1 px-1">
          <span>You receive</span>
        </div>
        
        <div className="flex items-center bg-nova-surface border border-nova-border rounded-2xl p-4 opacity-70">
          <div className="text-3xl text-nova-text font-semibold w-full overflow-hidden text-ellipsis">
            {isQuoting ? (
              <Loader2 className="w-6 h-6 animate-spin text-nova-muted mt-2" />
            ) : quote ? (
              quote.expectedOutput.toFixed(4)
            ) : (
              '0.0'
            )}
          </div>
          
          <div className="flex bg-nova-surface-hover border border-nova-border p-1 rounded-xl shrink-0">
            <button
              onClick={() => setAsset('PT')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                asset === 'PT' && action === 'Buy'
                  ? 'bg-[#3ECF8E]/20 text-[#3ECF8E]'
                  : (asset === 'PT' ? 'bg-white/10 text-nova-text' : 'text-nova-muted hover:text-nova-text')
              }`}
            >
              PT
            </button>
            <button
              onClick={() => setAsset('YT')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                asset === 'YT' && action === 'Buy'
                  ? 'bg-[#3ECF8E]/20 text-[#3ECF8E]'
                  : (asset === 'YT' ? 'bg-white/10 text-nova-text' : 'text-nova-muted hover:text-nova-text')
              }`}
            >
              YT
            </button>
          </div>
        </div>
      </div>

      {quoteError && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {quoteError}
        </div>
      )}

      {/* Trade Info / Slippage */}
      <div className="mt-6 flex flex-col gap-3 px-2 z-10 relative">
        <div className="flex justify-between items-center text-sm">
          <span className="text-nova-muted flex items-center gap-1">Price Impact <Info className="w-3 h-3" /></span>
          <span className={`font-medium ${quote && Math.abs(quote.priceImpact) > 2 ? 'text-orange-400' : 'text-nova-text'}`}>
            {quote ? `${quote.priceImpact.toFixed(2)}%` : '---'}
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-nova-muted flex items-center gap-1">Minimum Received <Info className="w-3 h-3" /></span>
          <span className="font-medium text-nova-text">
            {quote ? `${quote.minimumReceived.toFixed(4)} ${action === 'Buy' ? asset : 'XLM'}` : '---'}
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-nova-muted flex items-center gap-1">Implied Yield <Info className="w-3 h-3" /></span>
          <span className="font-medium text-[#3ECF8E]">
            {marketData ? `${marketData.impliedYield.toFixed(2)}%` : '---'}
          </span>
        </div>
      </div>

      <button
        onClick={!isConnected ? connect : handleSwapExecute}
        disabled={isExecuting || (isConnected && (!quote || !!quoteError))}
        className={`mt-6 w-full flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-lg transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
          !isConnected 
            ? 'bg-nova-surface text-nova-text border border-nova-border hover:bg-nova-surface-hover hover:-translate-y-[1px]' 
            : 'bg-[#3ECF8E] text-black hover:brightness-110 hover:-translate-y-[1px] active:scale-[0.98]'
        }`}
      >
        {!isConnected ? (
          'Connect Wallet'
        ) : isExecuting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Confirming...
          </span>
        ) : (
          `${action} ${asset}`
        )}
      </button>

      {/* Market Info Modal via Portal */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showMarketInfo && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setShowMarketInfo(false)}>
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Escape') setShowMarketInfo(false); }}
                tabIndex={-1}
                ref={(el) => { if (el) el.focus(); }}
                className="w-full max-w-2xl bg-nova-surface border border-nova-border rounded-2xl shadow-2xl overflow-hidden relative flex flex-col max-h-[70vh] outline-none"
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 md:p-5 border-b border-white/5 bg-[#0a0a0a]">
                  <div>
                    <h2 className="text-lg font-bold text-white">Market Information</h2>
                    <p className="text-xs text-nova-muted font-medium">Live on-chain marketplace data</p>
                  </div>
                  <button onClick={() => setShowMarketInfo(false)} className="p-1.5 text-nova-muted hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="p-4 md:p-5 overflow-y-auto space-y-5 bg-[#111111] flex-1">
                  
                  {/* 1. Market Status */}
                  <div>
                    {(() => {
                      let status = { label: '🟢 Market Healthy', color: 'text-[#3ECF8E]', bg: 'bg-[#3ECF8E]/10', border: 'border-[#3ECF8E]/20', desc: 'The marketplace is operating normally with sufficient liquidity and active trading.' };
                      if (marketData) {
                        if (marketData.twap >= 1.0) {
                          status = { label: '🔴 YT Trading Unavailable', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20', desc: 'PT TWAP has reached or exceeded 1.0. Yield Tokens (YT) currently have zero market value.' };
                        } else if (marketData.ptPrice > 1.0) {
                          status = { label: '🟠 High PT Premium', color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20', desc: 'Principal Tokens (PT) are trading at a premium above face value (1.0). YT market value may be temporarily zero.' };
                        } else if (marketData.ptReserve < 100 || marketData.ytReserve < 100 || marketData.underlyingReserve < 100) {
                          status = { label: '🟡 Thin Liquidity', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20', desc: 'Market reserves are low. Trades may experience higher slippage than usual.' };
                        }
                      }
                      return (
                        <div className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${status.bg} ${status.border}`}>
                          <span className={`text-sm font-bold whitespace-nowrap ${status.color}`}>{status.label}</span>
                          <span className="text-xs text-white/70">{status.desc}</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 2. Live Prices */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-nova-surface-hover border border-nova-border rounded-lg p-3 flex flex-col justify-center relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#3ECF8E] opacity-[0.02] rounded-full translate-x-1/3 -translate-y-1/3 group-hover:opacity-[0.05] transition-opacity" />
                      <h3 className="text-xs font-medium text-nova-muted mb-1">PT Price</h3>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-white">{marketData ? marketData.ptPrice.toFixed(4) : '0.0000'}</span>
                        <span className="text-sm text-nova-muted font-medium">XLM</span>
                      </div>
                    </div>
                    <div className="bg-nova-surface-hover border border-nova-border rounded-lg p-3 flex flex-col justify-center relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500 opacity-[0.02] rounded-full translate-x-1/3 -translate-y-1/3 group-hover:opacity-[0.05] transition-opacity" />
                      <h3 className="text-xs font-medium text-nova-muted mb-1">YT Price</h3>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-white">{marketData ? marketData.ytPrice.toFixed(4) : '0.0000'}</span>
                        <span className="text-sm text-nova-muted font-medium">XLM</span>
                      </div>
                    </div>
                  </div>

                  {/* 3. Oracle */}
                  <div>
                    <h3 className="text-xs font-semibold text-nova-muted uppercase tracking-wider mb-2">Oracle</h3>
                    <div className="bg-nova-surface border border-nova-border rounded-lg p-3 flex flex-row items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-nova-muted">TWAP:</span>
                        <span className="font-bold text-white">{marketData ? marketData.twap.toFixed(5) : '0.00000'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-nova-muted">Spot:</span>
                        <span className="font-bold text-white">{marketData ? marketData.ptPrice.toFixed(5) : '0.00000'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <span className="w-2 h-2 rounded-full bg-[#3ECF8E] animate-pulse" />
                        Real-time
                      </div>
                    </div>
                  </div>

                  {/* 4. Market Liquidity */}
                  <div>
                    <h3 className="text-xs font-semibold text-nova-muted uppercase tracking-wider mb-2">Market Liquidity</h3>
                    <div className="bg-nova-surface border border-nova-border rounded-lg p-3 flex flex-row items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-nova-muted">PT:</span>
                        <span className="font-bold text-white">{marketData ? marketData.ptReserve.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-nova-muted">YT:</span>
                        <span className="font-bold text-white">{marketData ? marketData.ytReserve.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-nova-muted">XLM:</span>
                        <span className="font-bold text-white">{marketData ? marketData.underlyingReserve.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span>
                      </div>
                    </div>
                  </div>

                  {/* 5. Protocol Explanation */}
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-xs text-nova-muted space-y-1.5">
                    <p>• PT price comes from the live marketplace.</p>
                    <p>• YT price = max(0, 1 − PT).</p>
                    <p>• Liquidity represents pool reserves, not your wallet balances.</p>
                  </div>

                </div>
                
                {/* 6. Footer */}
                <div className="p-3 border-t border-white/5 bg-[#0a0a0a] flex items-center justify-between text-[10px] text-nova-muted font-medium">
                  <span className="flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> Source: Live Soroban Marketplace Contract
                  </span>
                  <span className="flex items-center gap-1.5">
                    Updates every 15 seconds <span className="w-1.5 h-1.5 rounded-full bg-[#3ECF8E] animate-pulse" />
                  </span>
                </div>
                
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
