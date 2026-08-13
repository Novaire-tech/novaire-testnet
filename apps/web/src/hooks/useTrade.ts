import { useState, useCallback, useEffect } from 'react';
import { WalletService } from '../services/walletService';
import { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } from '../config/contracts';

export type TradeAsset = 'PT' | 'YT';
export type TradeAction = 'Buy' | 'Sell';

export interface MarketData {
  ptPrice: number;
  ytPrice: number;
  twap: number;
  /** True when amm.twap_apy() failed/reverted (checkpoint stale or unavailable). twap is 0 and must not be displayed as real market data. */
  twapStale: boolean;
  ptReserve: number;
  ytReserve: number;
  underlyingReserve: number;
  /** Executable APY — spot-PT-price implied annualized yield (calculateMarketImpliedApy). */
  fixedApy: number;
  /** Raw YT/PT price ratio, expressed as a percentage. NOT an APY — not annualized, not maturity-aware. */
  ytPtRatio: number;
}

export interface TradeQuote {
  expectedOutput: number;
  minimumReceived: number;
  priceImpact: number;
  slippage: number;
  /** Set when trade size is large relative to thin YT depth (near-par pool or early-epoch small pool). Non-blocking. */
  warning?: string;
}

function parseTradeError(e: unknown): string {
  // Fallback message parsing — the AMM's error enum isn't known until real bindings are
  // generated, so we match on the raw error text rather than a NovaireMarketError-style enum.
  const msg = (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : null) || String(e);

  if (msg.includes('Insufficient balance') || (msg.includes('HostError') && (msg.includes('balance') || msg.includes('transfer') || msg.includes('underfunded')))) return 'Insufficient balance.';
  if (msg.includes('timeout') || msg.includes('Network error') || msg.includes('fetch') || msg.includes('Failed to fetch') || msg.includes('Simulation failed')) return 'Network error.';
  if (msg.includes('User rejected') || msg.includes('UserRejected') || msg.includes('User declined')) return 'Transaction cancelled.';
  if (msg.includes('liquidity') || msg.includes('Liquidity')) return 'Pool liquidity is too low for this trade size.';
  if (msg.includes('slippage') || msg.includes('Slippage') || msg.includes('MinOut')) return 'Price moved beyond your slippage tolerance.';
  if (msg.includes('matured') || msg.includes('Matured')) return 'This market has matured.';

  return 'Unexpected protocol error.';
}

function unwrapResult(result: unknown): bigint | null {
  if (result === undefined || result === null) return null;
  if (typeof result === 'bigint' || typeof result === 'number') return BigInt(result);
  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    if (typeof obj.unwrap === 'function') {
      const unwrapped = (obj.unwrap as () => unknown)();
      return typeof unwrapped === 'bigint' ? unwrapped : BigInt(unwrapped as string | number | bigint);
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
  const WAD_SCALE = 1e18;

  const fetchMarketData = useCallback(async () => {
    try {
      const { Client: AmmClient } = await import('../../../../packages/bindings/amm/src/index');
      const { Client: SyWrapperClient } = await import('../../../../packages/bindings/sy_wrapper/src/index');
      const address = await WalletService.getWalletAddress() || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'; // dummy if not connected

      const clientOptions = { rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE, publicKey: address };
      const ammClient = new AmmClient({ ...clientOptions, contractId: CONTRACTS.AMM });
      const syWrapperClient = new SyWrapperClient({ ...clientOptions, contractId: CONTRACTS.SY_WRAPPER });

      // PT/YT prices in underlying terms: quote 1 PT/YT -> SY via the AMM, then convert
      // SY -> underlying via the SY Wrapper's exchange rate (the AMM only trades SY<->PT/YT).
      const [ptQuoteTx, ytQuoteTx, exchangeRateTx] = await Promise.all([
        ammClient.quote_pt_for_sy({ pt_in: BigInt(STROOP_SCALE) }),
        ammClient.quote_yt_for_sy({ yt_in: BigInt(STROOP_SCALE) }),
        syWrapperClient.exchange_rate(),
      ]);

      const rate = Number(unwrapResult(exchangeRateTx.result) || 0n) / WAD_SCALE;
      const ptSyOut = Number(unwrapResult(ptQuoteTx.result) || 0n) / STROOP_SCALE;
      const ytSyOut = Number(unwrapResult(ytQuoteTx.result) || 0n) / STROOP_SCALE;
      const ptPrice = rate > 0 ? ptSyOut * rate : 0;
      const ytPrice = rate > 0 ? ytSyOut * rate : 0;

      // amm.twap_apy() has no documented "stale/reverts" behavior like the old
      // get_twap_rate_checked; treat any failure to reach the contract as stale.
      let twap = 0;
      let twapStale = true;
      try {
        const twapTx = await ammClient.twap_apy();
        twap = Number(unwrapResult(twapTx.result) || 0n) / 1e16; // WAD rate -> percent
        twapStale = false;
      } catch {
        console.warn('TWAP APY is stale or unavailable (amm.twap_apy failed)');
      }

      let ptRes = 0, ytRes = 0, undRes = 0;
      try {
        const [reservePtTx, reserveSyTx] = await Promise.all([
          ammClient.reserve_pt(),
          ammClient.reserve_sy(),
        ]);
        ptRes = Number(unwrapResult(reservePtTx.result) || 0n) / STROOP_SCALE;
        undRes = Number(unwrapResult(reserveSyTx.result) || 0n) / STROOP_SCALE;
        // The AMM pools SY<->PT; there is no separate YT reserve leg to read directly.
        ytRes = 0;
      } catch (e) {
        console.warn('Failed to fetch AMM reserves', e);
      }

      // Compute yields
      const { YieldService } = await import('../services/yieldService');
      const [maturityTimestampMs, ptFaceValueInUnderlying] = await Promise.all([
        YieldService.getActiveMaturityTimestampMs(),
        YieldService.getEpochStartIndex()
      ]);
      const { calculateMarketImpliedApy } = await import('../utils/apy');
      const fixedApy = calculateMarketImpliedApy(ptPrice, ptFaceValueInUnderlying, maturityTimestampMs);
      const ytPtRatio = ptPrice > 0 ? (ytPrice / ptPrice) * 100 : 0;

      setMarketData({
        ptPrice: isNaN(ptPrice) ? 0 : ptPrice,
        ytPrice: isNaN(ytPrice) ? 0 : ytPrice,
        twap: isNaN(twap) ? 0 : twap,
        twapStale,
        ptReserve: ptRes,
        ytReserve: ytRes,
        underlyingReserve: undRes,
        fixedApy: isNaN(fixedApy) ? 0 : fixedApy,
        ytPtRatio: isNaN(ytPtRatio) ? 0 : ytPtRatio,
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

      const { Client: AmmClient } = await import('../../../../packages/bindings/amm/src/index');
      const { Client: SyWrapperClient } = await import('../../../../packages/bindings/sy_wrapper/src/index');
      const clientOptions = { rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE, publicKey: address };
      const ammClient = new AmmClient({ ...clientOptions, contractId: CONTRACTS.AMM });
      const syWrapperClient = new SyWrapperClient({ ...clientOptions, contractId: CONTRACTS.SY_WRAPPER });

      const amountInStroops = BigInt(Math.floor(amountIn * STROOP_SCALE));

      // There is no direct underlying<->PT/YT swap anymore. Buying/selling PT or YT
      // routes underlying through SY first: deposit() to mint SY, then swap SY<->PT/YT.
      // We can't simulate deposit() + swap in one read-only round trip, so approximate
      // the underlying-denominated quote using the live SY exchange rate for the
      // deposit leg, and the AMM's read-only quote_* for the swap leg.
      const exchangeRateTx = await syWrapperClient.exchange_rate();
      const rate = Number(unwrapResult(exchangeRateTx.result) || 0n) / WAD_SCALE;
      if (!(rate > 0)) throw new Error('SY exchange rate unavailable');

      let outStroops = 0n;

      if (action === 'Buy' && asset === 'PT') {
        const syIn = BigInt(Math.floor(Number(amountInStroops) / rate));
        const tx = await ammClient.quote_sy_for_pt({ sy_in: syIn });
        outStroops = unwrapResult(tx.result) || 0n;
      } else if (action === 'Sell' && asset === 'PT') {
        const tx = await ammClient.quote_pt_for_sy({ pt_in: amountInStroops });
        const syOut = unwrapResult(tx.result) || 0n;
        outStroops = BigInt(Math.floor(Number(syOut) * rate));
      } else if (action === 'Buy' && asset === 'YT') {
        const syIn = BigInt(Math.floor(Number(amountInStroops) / rate));
        const tx = await ammClient.quote_sy_for_yt({ sy_in: syIn });
        outStroops = unwrapResult(tx.result) || 0n;
      } else if (action === 'Sell' && asset === 'YT') {
        const tx = await ammClient.quote_yt_for_sy({ yt_in: amountInStroops });
        const syOut = unwrapResult(tx.result) || 0n;
        outStroops = BigInt(Math.floor(Number(syOut) * rate));
      }

      if (outStroops === 0n) {
        throw new Error('InsufficientLiquidity');
      }

      const expectedOutput = Number(outStroops) / STROOP_SCALE;
      const minimumReceived = expectedOutput * (1 - slippagePercent / 100);

      // Calculate price impact (rough estimation)
      let priceImpact = 0;
      let largeTradeWarning: string | undefined;
      if (marketData) {
        if (action === 'Buy' && asset === 'PT') {
          const expectedPrice = amountIn / expectedOutput;
          // Buy: worse price is higher, so market - expected will be negative
          priceImpact = ((marketData.ptPrice - expectedPrice) / marketData.ptPrice) * 100;
        } else if (action === 'Sell' && asset === 'PT') {
          const expectedPrice = expectedOutput / amountIn;
          // Sell: worse price is lower, so expected - market will be negative
          priceImpact = ((expectedPrice - marketData.ptPrice) / marketData.ptPrice) * 100;
        } else if (action === 'Buy' && asset === 'YT') {
          const expectedPrice = amountIn / expectedOutput;
          priceImpact = marketData.ytPrice > 0 ? ((marketData.ytPrice - expectedPrice) / marketData.ytPrice) * 100 : 0;
        } else if (action === 'Sell' && asset === 'YT') {
          const expectedPrice = expectedOutput / amountIn;
          priceImpact = marketData.ytPrice > 0 ? ((expectedPrice - marketData.ytPrice) / marketData.ytPrice) * 100 : 0;
        }

        // Thin YT depth (near-par pools, or a small/young pool near its MINIMUM_LIQUIDITY
        // floor) makes large-relative-size YT trades genuinely fragile — this is correct
        // AMM behavior, not a bug, but worth flagging before the user submits.
        if (asset === 'YT' && Math.abs(priceImpact) > 10) {
          largeTradeWarning = 'Large price impact for this trade size — YT liquidity is thin right now. Consider a smaller amount.';
        }
      }

      setQuote({
        expectedOutput,
        minimumReceived,
        priceImpact,
        slippage: slippagePercent,
        warning: largeTradeWarning
      });
    } catch (e) {
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
      const { Client: AmmClient } = await import('../../../../packages/bindings/amm/src/index');
      const { Client: SyWrapperClient } = await import('../../../../packages/bindings/sy_wrapper/src/index');

      const clientOptions = { rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE, publicKey: address };
      const ammClient = new AmmClient({ ...clientOptions, contractId: CONTRACTS.AMM });
      const syWrapperClient = new SyWrapperClient({ ...clientOptions, contractId: CONTRACTS.SY_WRAPPER });

      const amountInStroops = BigInt(Math.floor(amountIn * STROOP_SCALE));
      let minOutStroops = 0n;

      if (quote) {
        minOutStroops = BigInt(Math.floor(quote.minimumReceived * STROOP_SCALE));
      } else {
        throw new Error('No valid quote available');
      }

      let result: unknown;

      if (action === 'Buy' && (asset === 'PT' || asset === 'YT')) {
        // Buying PT/YT with underlying: first deposit underlying into the SY Wrapper to
        // mint SY, then swap SY for PT/YT on the AMM. Two on-chain transactions.
        const depositTx = await syWrapperClient.deposit({ from: address, amount: amountInStroops });
        const depositResult = await depositTx.signAndSend({ signTransaction });
        const syMinted = unwrapResult(depositTx.result) || 0n;

        const swapTx = asset === 'PT'
          ? await ammClient.swap_sy_for_pt({ from: address, sy_in: syMinted, min_pt_out: minOutStroops })
          : await ammClient.swap_sy_for_yt({ from: address, sy_in: syMinted, min_yt_out: minOutStroops });
        result = await swapTx.signAndSend({ signTransaction });
        if (!depositResult) throw new Error('SY deposit failed on-chain');
      } else if (action === 'Sell' && (asset === 'PT' || asset === 'YT')) {
        // Selling PT/YT for underlying: first swap PT/YT for SY on the AMM, then redeem
        // the SY for underlying via the SY Wrapper. Two on-chain transactions.
        const swapTx = asset === 'PT'
          ? await ammClient.swap_pt_for_sy({ from: address, pt_in: amountInStroops, min_sy_out: 1n })
          : await ammClient.swap_yt_for_sy({ from: address, yt_in: amountInStroops, min_sy_out: 1n });
        const swapResult = await swapTx.signAndSend({ signTransaction });
        const syReceived = unwrapResult(swapTx.result) || 0n;

        const redeemTx = await syWrapperClient.redeem({ from: address, sy_amount: syReceived });
        result = await redeemTx.signAndSend({ signTransaction });
        if (!swapResult) throw new Error('AMM swap failed on-chain');
      }

      if (!result) throw new Error('Transaction assembly failed');

      return result;
    } catch (e) {
      console.error('Trade execution failed', e);
      throw e;
    } finally {
      setIsExecuting(false);
    }
  }, [quote]);

  useEffect(() => {
    queueMicrotask(() => { fetchMarketData(); });
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
