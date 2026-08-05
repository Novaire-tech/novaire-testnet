import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function processEvent(event: any, txHash: string, timestamp: Date) {
  // Common properties
  const topic = event.topics[0]?.toString();
  if (!topic) return;

  try {
    switch (topic) {
      case 'epoch_deployed':
        // Handle epoch_deployed
        break;
      case 'vault_deposit':
        // Handle vault_deposit
        break;
      case 'vault_withdraw':
        // Handle vault_withdraw
        break;
      case 'pt_mint':
      case 'yt_mint':
      case 'mint':
        // Handle mint
        break;
      case 'pt_burn':
      case 'yt_burn':
      case 'burn':
        // Handle burn
        break;
      case 'transfer':
        // Handle transfer
        break;
      case 'swap':
        // Handle swap
        break;
      case 'yield_claimed':
        // Handle yield_claimed
        break;
      case 'rollover_registered':
        // Handle rollover
        break;
      case 'rollover_executed':
        // Handle rollover execution
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
