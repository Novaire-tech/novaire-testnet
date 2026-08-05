'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { YieldService } from '@/services/yieldService';
import { ProtocolService, ProtocolState } from '@/services/protocolService';
import { Vault } from '@/types';
import { MintModal } from '@/components/modals/MintModal';
import { VaultGrid } from '@/components/vaults/VaultGrid';
import { MyVaultPositions } from '@/components/vaults/MyVaultPositions';
import { VaultStatistics } from '@/components/vaults/VaultStatistics';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { PageContainer } from '@/components/ui/PageContainer';
import { TradeInterface } from '@/components/trade/TradeInterface';

export default function VaultsPage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [protocolState, setProtocolState] = useState<ProtocolState | null>(null);
  const [isMintModalOpen, setIsMintModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<string>('USDC');

  useEffect(() => {
    Promise.all([
      YieldService.getVaults(),
      ProtocolService.getProtocolState()
    ])
      .then(([vaultData, pState]) => {
        setVaults(vaultData);
        setProtocolState(pState);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load vaults page data:', error);
        setLoading(false);
      });
  }, []);

  const handleDepositClick = (asset: string) => {
    setSelectedAsset(asset);
    setIsMintModalOpen(true);
  };

  return (
    <PageContainer
      title="Vaults"
      description="Access fixed-yield vaults, tokenize positions into PT & YT, monitor maturity and manage your deposits."
    >
      {/* Protocol Statistics */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        className="mb-12"
      >
        <VaultStatistics vaults={vaults} protocolState={protocolState} />
      </motion.div>

      {/* Main Grid: Vaults & Trade */}
      <div className="mb-12 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Left: Available Vaults */}
        <div className="flex flex-col h-full">
          <h2 className="mb-6 text-xl font-medium text-[#F5F5F2] tracking-tight">Available Vaults</h2>
          {loading ? (
            <div className="grid grid-cols-1 gap-6">
              {[1, 2].map((i) => (
                <div key={i} className="h-64 animate-pulse rounded-2xl bg-[#111111] border border-white/10" />
              ))}
            </div>
          ) : (
            <VaultGrid vaults={vaults} protocolState={protocolState} onDeposit={handleDepositClick} />
          )}
        </div>

        {/* Right: Trade PT & YT */}
        <div className="flex flex-col h-full">
          <h2 className="mb-6 text-xl font-medium text-[#F5F5F2] tracking-tight">Trade PT & YT</h2>
          <div className="flex-grow">
            <TradeInterface />
          </div>
        </div>
      </div>

      {/* My Vault Positions */}
      <div className="mb-12">
        <MyVaultPositions vaults={vaults} />
      </div>

      {/* Recent Vault Activity */}
      <div className="mb-12">
        <h2 className="mb-6 text-xl font-medium text-[#F5F5F2] tracking-tight">Recent Vault Activity</h2>
        {/* We reuse the generic RecentActivity which internally filters by the user's connected wallet */}
        <div className="max-w-4xl">
          <RecentActivity />
        </div>
      </div>

      <MintModal 
        isOpen={isMintModalOpen} 
        onClose={() => setIsMintModalOpen(false)} 
        defaultAsset={selectedAsset} 
      />
    </PageContainer>
  );
}
