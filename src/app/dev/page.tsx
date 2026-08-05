"use client";

import { useState } from 'react';
import { WalletService } from '../../services/walletService';
import { PriceOracleService } from '../../services/priceOracleService';
import { MarketService } from '../../services/marketService';
import { usePortfolio } from '../../hooks/usePortfolio';

import { notFound } from 'next/navigation';

export default function DevTestPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  const [walletState, setWalletState] = useState<any>(null);
  const [pricesState, setPricesState] = useState<any>(null);
  const [marketsState, setMarketsState] = useState<any>(null);
  
  // Consumes portfolioService automatically via the hook
  const { portfolio, loading: portfolioLoading, error: portfolioError, refresh: refreshPortfolio } = usePortfolio();

  const handleConnectWallet = async () => {
    try {
      const res = await WalletService.connectWallet();
      setWalletState(res);
    } catch (e: any) {
      setWalletState({ error: e.message });
    }
  };

  const handleGetBalances = async () => {
    try {
      const balances = await WalletService.getBalances();
      setWalletState((prev: any) => ({ ...prev, balances }));
    } catch (e: any) {
      setWalletState((prev: any) => ({ ...prev, balanceError: e.message }));
    }
  };

  const handleGetPrices = async () => {
    try {
      console.log("-> Dev page: Calling PriceOracleService.getPrices()");
      setPricesState({ status: 'Loading...' }); // Temporary loading state
      const prices = await PriceOracleService.getPrices();
      console.log("<- Dev page: PriceOracleService returned successfully:", prices);
      setPricesState(prices);
    } catch (e: any) {
      console.error("<- Dev page: PriceOracleService threw error:", e);
      setPricesState({ error: e.message || 'Unknown error occurred' });
    }
  };

  const handleGetMarkets = async () => {
    try {
      const assets = await MarketService.getSupportedAssets();
      setMarketsState(assets);
    } catch (e: any) {
      setMarketsState({ error: e.message });
    }
  };

  return (
    <div className="p-8 min-h-screen bg-[#050505] text-[#A0A0A0] font-mono text-sm overflow-auto">
      <h1 className="text-2xl text-white mb-8 font-sans font-bold tracking-tight">Novaire Services / Dev Test</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Wallet Service Test */}
        <div className="bg-[#0A0A0A] p-6 rounded-xl border border-[#1A1A1A]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg text-white">WalletService</h2>
            <div className="flex gap-2">
              <button 
                onClick={handleConnectWallet}
                className="px-3 py-1 bg-white text-black rounded hover:bg-gray-200 transition-colors"
              >
                Connect
              </button>
              <button 
                onClick={handleGetBalances}
                className="px-3 py-1 bg-[#1A1A1A] text-white rounded hover:bg-[#2A2A2A] transition-colors border border-[#333]"
              >
                Get Balances
              </button>
            </div>
          </div>
          <pre className="bg-black p-4 rounded-lg overflow-x-auto text-[11px] h-64 overflow-y-auto">
            {JSON.stringify(walletState, null, 2) || '// Click Connect to test wallet'}
          </pre>
        </div>

        {/* Portfolio Hook/Service Test */}
        <div className="bg-[#0A0A0A] p-6 rounded-xl border border-[#1A1A1A]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg text-white">usePortfolio / PortfolioService</h2>
            <button 
              onClick={refreshPortfolio}
              className="px-3 py-1 bg-[#1A1A1A] text-white rounded hover:bg-[#2A2A2A] transition-colors border border-[#333]"
            >
              Refresh
            </button>
          </div>
          <pre className="bg-black p-4 rounded-lg overflow-x-auto text-[11px] h-64 overflow-y-auto">
            {portfolioLoading ? '// Loading portfolio...' : 
             portfolioError ? `// Error: ${portfolioError}` :
             JSON.stringify(portfolio, null, 2)}
          </pre>
        </div>

        {/* Price Service Test */}
        <div className="bg-[#0A0A0A] p-6 rounded-xl border border-[#1A1A1A]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg text-white">PriceOracleService</h2>
            <button 
              onClick={handleGetPrices}
              className="px-3 py-1 bg-[#1A1A1A] text-white rounded hover:bg-[#2A2A2A] transition-colors border border-[#333]"
            >
              Get Prices
            </button>
          </div>
          <pre className="bg-black p-4 rounded-lg overflow-x-auto text-[11px] h-64 overflow-y-auto">
            {!pricesState ? '// Click Get Prices to test CoinDCX prices' : JSON.stringify(pricesState, null, 2)}
          </pre>
        </div>

        {/* Market Service Test */}
        <div className="bg-[#0A0A0A] p-6 rounded-xl border border-[#1A1A1A]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg text-white">MarketService</h2>
            <button 
              onClick={handleGetMarkets}
              className="px-3 py-1 bg-[#1A1A1A] text-white rounded hover:bg-[#2A2A2A] transition-colors border border-[#333]"
            >
              Get Supported Assets
            </button>
          </div>
          <pre className="bg-black p-4 rounded-lg overflow-x-auto text-[11px] h-64 overflow-y-auto">
            {JSON.stringify(marketsState, null, 2) || '// Click to test CoinDCX market metadata'}
          </pre>
        </div>

      </div>
    </div>
  );
}
