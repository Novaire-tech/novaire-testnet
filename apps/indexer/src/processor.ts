import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function processEvent(event: any, txHash: string, timestamp: Date) {
  // Common properties
  const topic = event.topics[0]?.toString();
  if (!topic) return;

  try {
    switch (topic) {
      // sy-wrapper
      case 'deposit':
        // Handle SY deposit (holder, underlying_amount, shares_minted)
        break;
      case 'redeem':
        // Handle SY redeem (holder, shares_burned, underlying_amount)
        break;
      // tokenizer
      case 'split':
        // Handle split (holder, sy_amount, face)
        break;
      case 'recombine':
        // Handle recombine (holder, pt_amount, yt_amount, sy_out)
        break;
      case 'redeem_at_maturity':
        // Handle PT redemption at maturity (holder, pt_amount, sy_out)
        break;
      case 'claim_yield':
        // Handle YT yield claim (holder, sy_out)
        break;
      // pt-token / yt-token
      case 'mint':
        // Handle PT/YT mint (to, amount)
        break;
      case 'burn':
        // Handle PT/YT burn (from, amount)
        break;
      case 'transfer':
        // Handle PT/YT/SY transfer (from, to, amount)
        break;
      // amm
      case 'swap':
        // Handle AMM swap (trader, route, amount_in, amount_out)
        break;
      case 'add_liquidity':
        // Handle AMM liquidity add (provider, pt_in, sy_in, lp_out)
        break;
      case 'remove_liquidity':
        // Handle AMM liquidity remove (provider, lp_in, pt_out, sy_out)
        break;
      default:
        console.log(`Unhandled event topic: ${topic}`);
    }
  } catch (error) {
    console.error(`Error processing event ${topic}:`, error);
  }
}

export async function getSyncState() {
  let state = await prisma.syncState.findUnique({ where: { id: 'singleton' } });
  if (!state) {
    state = await prisma.syncState.create({
      data: { id: 'singleton', lastLedger: 0 },
    });
  }
  return state;
}

export async function updateSyncState(ledger: number) {
  await prisma.syncState.update({
    where: { id: 'singleton' },
    data: { lastLedger: ledger },
  });
}
