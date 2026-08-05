'use client';

import { motion } from 'framer-motion';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { KPICards } from '@/components/dashboard/KPICards';
import { PerformanceChart } from '@/components/dashboard/PerformanceChart';
import { AssetAllocation } from '@/components/dashboard/AssetAllocation';
import { YieldBreakdown } from '@/components/dashboard/YieldBreakdown';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { PositionsTable } from '@/components/dashboard/PositionsTable';
import { ProtocolOverview } from '@/components/dashboard/ProtocolOverview';

export default function DashboardPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="w-full px-6 pt-6 pb-24"
    >
      <div className="flex flex-col gap-6 pb-24">
        <DashboardHeader />

        {/* ROW 1: KPIs */}
        <KPICards />

        {/* ROW 2: Performance */}
        <div className="grid grid-cols-1 gap-6">
          <PerformanceChart />
        </div>

        {/* ROW 3: Positions */}
        <div className="grid grid-cols-1 gap-6">
          <PositionsTable />
        </div>

        {/* ROW 4: Asset Allocation, Yield Breakdown, Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <AssetAllocation />
          <YieldBreakdown />
          <RecentActivity />
        </div>

        {/* ROW 5: Protocol Overview */}
        <div className="grid grid-cols-1 gap-6">
          <ProtocolOverview />
        </div>
      </div>
    </motion.div>
  );
}
