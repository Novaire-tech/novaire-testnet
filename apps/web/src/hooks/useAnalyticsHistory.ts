import { useEffect, useSyncExternalStore } from 'react';
import { AnalyticsHistoryService } from '../services/analyticsHistoryService';

export function useAnalyticsHistory() {
  const snapshots = useSyncExternalStore(
    AnalyticsHistoryService.subscribe.bind(AnalyticsHistoryService),
    AnalyticsHistoryService.getSnapshots.bind(AnalyticsHistoryService)
  );

  useEffect(() => {
    AnalyticsHistoryService.initialize();

    // Start background polling when hook mounts (e.g. when analytics page is open)
    AnalyticsHistoryService.startPolling(5000); // 5 seconds polling

    return () => {
      AnalyticsHistoryService.stopPolling();
    };
  }, []);

  return { snapshots };
}
