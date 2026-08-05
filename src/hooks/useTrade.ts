import { useState, useCallback, useEffect } from 'react';
import { WalletService } from '../services/walletService';
import { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } from '../config/contracts';
import { NovaireMarketError } from '../../packages/bindings/marketplace/src/index';

export type TradeAsset = 'PT' | 'YT';
export type TradeAction = 'Buy' | 'Sell';

export interface MarketData {
  ptPrice: number;
  ytPrice: number;
  twap: number;
  ptReserve: number;
  ytReserve: number;
  underlyingReserve: number;
  fixedApy: number;
  impliedYield: number;
}

export interface TradeQuote {
  expectedOutput: number;
  minimumReceived: number;
  priceImpact: number;
  slippage: number;
}

function parseTradeError(e: any): string {
  // Structured SDK error parsing
  if (e && typeof e === 'object' && e.message) {
    if (e.message === NovaireMarketError[8].message) return 'Pool liquidity is too low for this trade size.';
    if (e.message === NovaireMarketError[5].message) return 'The pool does not currently have enough liquidity.';
    if (e.message === NovaireMarketError[6].message) return 'Price moved beyond your slippage tolerance.';
    if (e.message === NovaireMarketError[4].message) return 'This market has matured.';
    if (e.message === NovaireMarketError[3].message) return 'Authorization required.';
    if (e.message === NovaireMarketError[7].message) return 'Please enter a valid amount.';
    if (e.message === NovaireMarketError[11].message) return 'YT has no remaining value because PT has reached face value.';
    if (e.message === NovaireMarketError[9].message) return 'Internal protocol state unavailable.';
    if (e.message === NovaireMarketError[10].message) return 'Protocol invariant check failed.';
  }

  // Fallback for Host errors and unmapped network errors where structured info is unavailable
  const msg = e?.message || String(e);
  
  if (msg.includes('Insufficient balance') || (msg.includes('HostError') && (msg.includes('balance') || msg.includes('transfer') || msg.includes('underfunded')))) return 'Insufficient balance.';
  if (msg.includes('timeout') || msg.includes('Network error') || msg.includes('fetch') || msg.includes('Failed to fetch') || msg.includes('Simulation failed')) return 'Network error.';
  if (msg.includes('User rejected') || msg.includes('UserRejected') || msg.includes('User declined')) return 'Transaction cancelled.';
  
  return 'Unexpected protocol error.';
}

function unwrapResult(result: any): bigint | null {
  if (result === undefined || result === null) return null;
  if (typeof result === 'bigint' || typeof result === 'number') return BigInt(result);
  if (typeof result === 'object') {
    if (typeof result.unwrap === 'function') {
      const unwrapped = result.unwrap();
      return typeof unwrapped === 'bigint' ? unwrapped : BigInt(unwrapped);
    }
  }
  return null;
}

export function useTrade() {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [isLoadingMarket, setIsLoadingMarket] = useState(true);
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const STROOP_SCALE = 10000000;

  const fetchMarketData = useCallback(async () => {
    try {
      const { Client: MarketplaceClient } = await import('../../packages/bindings/marketplace/src/index');
      const address = await WalletService.getWalletAddress() || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'; // dummy if not connected
      
      const client = new MarketplaceClient({
        rpcUrl: RPC_URL,
        networkPassphrase: NETWORK_PASSPHRASE,
        contractId: CONTRACTS.MARKETPLACE,
        publicKey: address,
      });

      const PRICE_SCALE = 1000000000; // 1e9

      const ptPriceTx = await client.get_pt_price();
      
      console.log('--- Market Data Audit ---');
      console.log('Raw PT Price from contract:', ptPriceTx.result ? ptPriceTx.result.toString() : ptPriceTx.result);
      
      const rawContractPtPrice = Number(unwrapResult(ptPriceTx.result) || 0n) / PRICE_SCALE;
      const ptPrice = rawContractPtPrice; // Contract now returns correct price (Underlying/PT)
      const ytPrice = Math.max(0, 1.0 - ptPrice); // derived from invariant pt + yt = underlying

      console.log('Scaled PT Price (displayed):', ptPrice);
      console.log('Scaled YT Price (displayed):', ytPrice);

      const twapTx = await client.get_twap_rate();
      console.log('Raw TWAP from contract:', twapTx.result ? twapTx.result.toString() : twapTx.result);
      const rawContractTwap = Number(unwrapResult(twapTx.result) || 0n) / PRICE_SCALE;
      const twap = rawContractTwap;
      console.log('Scaled TWAP (displayed):', twap);

      const reservesTx = await client.get_reserves();
      let ptRes = 0, ytRes = 0, undRes = 0;
      const rawReserves: any = reservesTx.result;
      
      if (rawReserves) {
        let unwrappedRes = rawReserves;
        if (typeof rawReserves.unwrap === 'function') {
           try { unwrappedRes = rawReserves.unwrap(); } catch(e) {}
        }
        if (Array.isArray(unwrappedRes) && unwrappedRes.length === 3) {
          console.log(`Raw Reserves from contract: PT=${unwrappedRes[0].toString()}, Underlying=${unwrappedRes[1].toString()}, YT=${unwrappedRes[2].toString()}`);
          ptRes = Number(unwrappedRes[0]) / STROOP_SCALE;
          undRes = Number(unwrappedRes[1]) / STROOP_SCALE;
          ytRes = Number(unwrappedRes[2]) / STROOP_SCALE;
          console.log(`Scaled Reserves (displayed): PT=${ptRes}, Underlying=${undRes}, YT=${ytRes}`);
        }
      }

      // Compute yields
      const { YieldService } = await import('../services/yieldService');
      const [maturityTimestampMs, ptFaceValueInUnderlying] = await Promise.all([
        YieldService.getActiveMaturityTimestampMs(),
        YieldService.getEpochStartIndex()
      ]);
      const { calculateMarketImpliedApy } = await import('../utils/apy');
      const fixedApy = calculateMarketImpliedApy(ptPrice, ptFaceValueInUnderlying, maturityTimestampMs);
      const impliedYield = ptPrice > 0 ? (ytPrice / ptPrice) * 100 : 0;
      
      console.log('Computed Fixed APY:', fixedApy);
      console.log('Computed Implied Yield:', impliedYield);

      setMarketData({
        ptPrice: isNaN(ptPrice) ? 0 : ptPrice,
        ytPrice: isNaN(ytPrice) ? 0 : ytPrice,
        twap: isNaN(twap) ? 0 : twap,
        ptReserve: ptRes,
        ytReserve: ytRes,
        underlyingReserve: undRes,
        fixedApy: isNaN(fixedApy) ? 0 : fixedApy,
        impliedYield: isNaN(impliedYield) ? 0 : impliedYield,
      });
    } catch (e) {
      console.error('Failed to fetch market data', e);
    } finally {
      setIsLoadingMarket(false);
    }
  }, []);

  const getQuote = useCallback(async (action: TradeAction, asset: TradeAsset, amountIn: number, slippagePercent: number) => {
    if (!amountIn || amountIn <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    setIsQuoting(true);
    setQuoteError(null);

    try {
      const address = await WalletService.getWalletAddress();
      if (!address) throw new Error('Wallet not connected');

      const { Client: MarketplaceClient } = await import('../../packages/bindings/marketplace/src/index');
      const client = new MarketplaceClient({
        rpcUrl: RPC_URL,
        networkPassphrase: NETWORK_PASSPHRASE,
        contractId: CONTRACTS.MARKETPLACE,
        publicKey: address,
      });

      const amountInStroops = BigInt(Math.floor(amountIn * STROOP_SCALE));
      let outStroops = 0n;

      if (action === 'Buy' && asset === 'PT') {
        const tx = await client.swap_underlying_for_pt({ buyer: address, underlying_in: amountInStroops, min_pt_out: 1n });
        outStroops = unwrapResult(tx.result) || 0n;
      } else if (action === 'Sell' && asset === 'PT') {
        const tx = await client.swap_pt_for_underlying({ seller: address, pt_in: amountInStroops, min_underlying_out: 1n });
        outStroops = unwrapResult(tx.result) || 0n;
      } else if (action === 'Buy' && asset === 'YT') {
        const tx = await client.swap_underlying_for_yt({ buyer: address, underlying_in: amountInStroops, min_yt_out: 1n });
        outStroops = unwrapResult(tx.result) || 0n;
      } else if (action === 'Sell' && asset === 'YT') {
        const tx = await client.swap_yt_for_underlying({ seller: address, yt_in: amountInStroops, min_underlying_out: 1n });
        outStroops = unwrapResult(tx.result) || 0n;
      }

      if (outStroops === 0n) {
        throw new Error('InsufficientLiquidity');
      }

      const expectedOutput = Number(outStroops) / STROOP_SCALE;
      const minimumReceived = expectedOutput * (1 - slippagePercent / 100);
      
      // Calculate price impact (rough estimation)
      let priceImpact = 0;
      if (marketData) {
        if (action === 'Buy' && asset === 'PT') {
          const expectedPrice = amountIn / expectedOutput;
          // Buy: worse price is higher, so market - expected will be negative
          priceImpact = ((marketData.ptPrice - expectedPrice) / marketData.ptPrice) * 100;
        } else if (action === 'Sell' && asset === 'PT') {
          const expectedPrice = expectedOutput / amountIn;
          // Sell: worse price is lower, so expected - market will be negative
          priceImpact = ((expectedPrice - marketData.ptPrice) / marketData.ptPrice) * 100;
        }
      }

      setQuote({
        expectedOutput,
        minimumReceived,
        priceImpact,
        slippage: slippagePercent
      });
    } catch (e: any) {
      setQuote(null);
      setQuoteError(parseTradeError(e));
    } finally {
      setIsQuoting(false);
    }
  }, [marketData]);

  const executeTrade = useCallback(async (action: TradeAction, asset: TradeAsset, amountIn: number, slippagePercent: number) => {
    setIsExecuting(true);
    try {
      const address = await WalletService.getWalletAddress();
      if (!address) throw new Error('Wallet not connected');

      const { signTransaction } = await import('@stellar/freighter-api');
      const { Client: MarketplaceClient } = await import('../../packages/bindings/marketplace/src/index');
      
      const client = new MarketplaceClient({
        rpcUrl: RPC_URL,
        networkPassphrase: NETWORK_PASSPHRASE,
        contractId: CONTRACTS.MARKETPLACE,
        publicKey: address,
      });

      // We need the quote to compute exact min out for slippage protection
      const amountInStroops = BigInt(Math.floor(amountIn * STROOP_SCALE));
      let minOutStroops = 0n;
      
      if (quote) {
        minOutStroops = BigInt(Math.floor(quote.minimumReceived * STROOP_SCALE));
      } else {
        throw new Error('No valid quote available');
      }

      let tx;
      if (action === 'Buy' && asset === 'PT') {
        tx = await client.swap_underlying_for_pt({ buyer: address, underlying_in: amountInStroops, min_pt_out: minOutStroops });
      } else if (action === 'Sell' && asset === 'PT') {
        tx = await client.swap_pt_for_underlying({ seller: address, pt_in: amountInStroops, min_underlying_out: minOutStroops });
      } else if (action === 'Buy' && asset === 'YT') {
        tx = await client.swap_underlying_for_yt({ buyer: address, underlying_in: amountInStroops, min_yt_out: minOutStroops });
      } else if (action === 'Sell' && asset === 'YT') {
        tx = await client.swap_yt_for_underlying({ seller: address, yt_in: amountInStroops, min_underlying_out: minOutStroops });
      }

      if (!tx) throw new Error('Transaction assembly failed');

      // @ts-ignore - The signAndSend method exists on AssembledTransaction in these bindings
      const result = await tx.signAndSend({ signTransaction });
      
      return result;
    } catch (e: any) {
      console.error('Trade execution failed', e);
      throw e;
    } finally {
      setIsExecuting(false);
    }
  }, [quote]);

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, [fetchMarketData]);

  return {
    marketData,
    isLoadingMarket,
    quote,
    isQuoting,
    quoteError,
    isExecuting,
    getQuote,
    executeTrade,
    refreshMarket: fetchMarketData
  };
}
