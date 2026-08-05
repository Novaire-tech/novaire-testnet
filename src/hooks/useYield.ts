import { useState, useEffect } from 'react';
import { Vault, YieldHistory } from '../types';
import { YieldService } from '../services/yieldService';

export function useYield(vaultId?: string) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [history, setHistory] = useState<YieldHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const fetchedVaults = await YieldService.getVaults();
        setVaults(fetchedVaults);

        if (vaultId) {
          const fetchedHistory = await YieldService.getYieldHistory(vaultId);
          setHistory(fetchedHistory);
        }
        
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch yield data'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [vaultId]);

  return { vaults, history, loading, error };
}
