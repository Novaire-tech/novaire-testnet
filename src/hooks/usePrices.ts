import { useState, useEffect } from 'react';
import { PriceData } from '../types';
import { PriceOracleService } from '../services/priceOracleService';

export function usePrices() {
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPrices = async () => {
    try {
      setLoading(true);
      const data = await PriceOracleService.getPrices();
      setPrices(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch prices'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
  }, []);

  return { prices, loading, error, fetchPrices };
}
