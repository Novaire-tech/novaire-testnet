import { PortfolioService } from './src/services/portfolioService.js';
import { WalletService } from './src/services/walletService.js';

console.log("Mocking WalletService...");
WalletService.getWalletAddress = async () => 'GDSJ44A3LWDHXYW2J6IIG34N2ZZ52AAGZYY6MHSK6YYNMFD6ZAYQZ63K';

async function trace() {
  try {
    const p = await PortfolioService.getPortfolio();
    console.log("=== Portfolio ===");
    console.log(JSON.stringify(p, null, 2));
  } catch (e) {
    console.error(e);
  }
}
trace();
