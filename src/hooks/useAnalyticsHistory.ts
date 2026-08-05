import { useState, useEffect } from 'react';
import { AnalyticsHistoryService, AnalyticsSnapshot } from '../services/analyticsHistoryService';

export function useAnalyticsHistory() {
  const [snapshots, setSnapshots] = useState<AnalyticsSnapshot[]>([]);

  useEffect(() => {
    AnalyticsHistoryService.initialize();
    
    // Initial load
    setSnapshots([...AnalyticsHistoryService.getSnapshots()]);

    // Start background polling when hook mounts (e.g. when analytics page is open)
    AnalyticsHistoryService.startPolling(5000); // 5 seconds polling

    // Subscribe to state updates
    const unsubscribe = AnalyticsHistoryService.subscribe((newSnapshots) => {
      setSnapshots(newSnapshots);
    });

    return () => {
      unsubscribe();
      AnalyticsHistoryService.stopPolling();
    };
  }, []);

  return { snapshots };
}
