import { PortfolioService } from '../src/services/portfolioService';
import { WalletService } from '../src/services/walletService';

// Mock the wallet service to return our admin address
WalletService.getWalletAddress = async () => 'GCOPNTJERGKW43QGKGCCBKMBCR2MCJW3Q36C5JIPHCYGABJAG4ZFXRM5';
WalletService.getBalances = async () => [];

async function test() {
   console.log("Fetching portfolio...");
   const p = await PortfolioService.getPortfolio();
   console.log(JSON.stringify(p, null, 2));
}

test().catch(console.error);
