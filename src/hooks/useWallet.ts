import { useState, useEffect } from 'react';
import { WalletService } from '../services/walletService';

export function useWallet() {
  const [state, setState] = useState(WalletService.getState());

  useEffect(() => {
    // 1. Subscribe to any state changes from the WalletService
    const unsubscribe = WalletService.onConnectionChange(() => {
      setState(WalletService.getState());
    });

    // 2. Catch any state changes that occurred between render and effect execution
    // (Crucial for React 18 Strict Mode where init() might resolve between unmount and remount)
    setState(WalletService.getState());

    // 3. Automatically try to reconnect when the hook is first used
    WalletService.init();

    return () => {
      unsubscribe();
    };
  }, []);

  return { 
    ...state,
    connect: async () => {
      try {
        console.log("1. Connect Wallet button clicked");
        console.log("2. Calling walletService.connectWallet()");
        await WalletService.connectWallet();
        console.log("8. Final React wallet state:", WalletService.getState());
      } catch (e: any) {
        console.error("7. Caught error in useWallet.connect():", e);
      }
    },
    disconnect: () => WalletService.disconnectWallet(),
    refreshBalances: () => WalletService.refreshBalances()
  };
}
