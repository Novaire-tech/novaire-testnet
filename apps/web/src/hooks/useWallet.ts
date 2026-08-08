import { useEffect, useSyncExternalStore } from 'react';
import { WalletService } from '../services/walletService';

export function useWallet() {
  const state = useSyncExternalStore(
    WalletService.onConnectionChange.bind(WalletService),
    WalletService.getState.bind(WalletService),
    WalletService.getState.bind(WalletService)
  );

  useEffect(() => {
    // Automatically try to reconnect when the hook is first used
    WalletService.init();
  }, []);

  return {
    ...state,
    connect: async () => {
      try {
        console.log("1. Connect Wallet button clicked");
        console.log("2. Calling walletService.connectWallet()");
        await WalletService.connectWallet();
        console.log("8. Final React wallet state:", WalletService.getState());
      } catch (e) {
        console.error("7. Caught error in useWallet.connect():", e);
      }
    },
    disconnect: () => WalletService.disconnectWallet(),
    refreshBalances: () => WalletService.refreshBalances()
  };
}
