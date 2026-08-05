export interface CoinDcxMarketDetails {
  coindcx_name: string;
  base_currency_short_name: string;
  target_currency_short_name: string;
  target_currency_name: string;
  base_currency_name: string;
  base_currency_precision: number;
  target_currency_precision: number;
  min_quantity: number;
  max_quantity: number;
  max_quantity_market: number;
  min_price: number;
  max_price: number;
  min_notional: number;
  max_leverage: number | null;
  max_leverage_short: number | null;
  step: number;
  order_types: string[];
  symbol: string;
  ecode: string;
  bo_sl_safety_percent: number;
  pair: string;
  status: string;
}

export class MarketService {
  private static CACHE_KEY = 'novaire_coindcx_markets_cache';
  private static CACHE_DURATION_MS = 60000; // 1 minute cache for market details
  private static MAX_RETRIES = 3;

  private static cachedData: CoinDcxMarketDetails[] | null = null;
  private static cacheTimestamp: number = 0;

  /**
   * Internal method to fetch with retries
   */
  private static async fetchWithRetry(url: string, retries = this.MAX_RETRIES): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        if (i === retries - 1) throw error;
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  /**
   * Fetch all market data from CoinDCX with in-memory caching
   */
  static async getAllMarkets(): Promise<CoinDcxMarketDetails[]> {
    const now = Date.now();
    
    if (this.cachedData && (now - this.cacheTimestamp < this.CACHE_DURATION_MS)) {
      return this.cachedData;
    }

    try {
      const data = await this.fetchWithRetry('/api/markets');
      this.cachedData = data;
      this.cacheTimestamp = now;
      return data;
    } catch (error) {
      console.error('Failed to fetch CoinDCX markets:', error);
      // Fallback to stale cache if available
      if (this.cachedData) return this.cachedData;
      throw error;
    }
  }

  /**
   * Get specific market details by symbol (e.g. 'BTCUSDT' or 'BTC')
   */
  static async getMarket(symbol: string): Promise<CoinDcxMarketDetails | null> {
    const markets = await this.getAllMarkets();
    const targetSymbol = symbol.toUpperCase().endsWith('USDT') 
      ? symbol.toUpperCase() 
      : `${symbol.toUpperCase()}USDT`;
      
    const market = markets.find(m => m.symbol === targetSymbol || m.coindcx_name === targetSymbol);
    return market || null;
  }

  /**
   * Get a unique list of all supported target assets (e.g., 'BTC', 'ETH')
   */
  static async getSupportedAssets(): Promise<string[]> {
    const markets = await this.getAllMarkets();
    // Use Set to ensure uniqueness
    const assets = new Set(markets.map(m => m.target_currency_short_name));
    return Array.from(assets).sort();
  }

  /**
   * Get a list of all trading pairs formatted exactly as provided by the API (e.g., 'B-BTC_USDT')
   */
  static async getTradingPairs(): Promise<string[]> {
    const markets = await this.getAllMarkets();
    return markets.map(m => m.pair);
  }
}
