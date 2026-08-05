'use client';

import { motion } from 'framer-motion';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { AnalyticsKPICards } from '@/components/analytics/AnalyticsKPICards';
import { MainInteractiveChart } from '@/components/analytics/MainInteractiveChart';
import { MarketStatisticsPanel } from '@/components/analytics/MarketStatisticsPanel';
import { YieldAnalytics } from '@/components/analytics/YieldAnalytics';
import { TradingAnalytics } from '@/components/analytics/TradingAnalytics';
import { VaultAnalytics } from '@/components/analytics/VaultAnalytics';
import { PageContainer } from '@/components/ui/PageContainer';

export default function AnalyticsPage() {
  return (
    <PageContainer
      title="Analytics"
      description="Deep dive into protocol performance and market data."
      actions={<DashboardHeader />}
    >
      <div className="flex flex-col gap-6">
        {/* SECTION 1: Analytics KPIs */}
        <AnalyticsKPICards />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 flex flex-col gap-6">
            {/* SECTION 2: Main Interactive Chart */}
            <MainInteractiveChart />

            {/* SECTION 3: Yield Distribution */}
            <YieldAnalytics />
          </div>

          <div className="xl:col-span-4 flex flex-col gap-6">
            {/* SECTION 4: Market Stats */}
            <MarketStatisticsPanel />
            
            {/* SECTION 5: Vault Details */}
            <VaultAnalytics />
            
            {/* SECTION 6: Trading Stats */}
            <TradingAnalytics />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
