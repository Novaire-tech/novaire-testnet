import { rpc, Contract } from '@stellar/stellar-sdk';
import { processEvent, getSyncState, updateSyncState } from './processor';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);

async function loadDeployments() {
  try {
    const filePath = path.resolve(__dirname, '../../../scripts/deployments.testnet.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load deployments:', e);
  }
  return {};
}

async function start() {
  const deployments = await loadDeployments();
  const contractIds = Object.values(deployments).filter((v: any) => typeof v === 'string') as string[];

  console.log(`Starting indexer, tracking ${contractIds.length} contracts...`);

  let syncState = await getSyncState();
  let cursor = syncState.lastLedger;

  if (cursor === 0) {
    // If we have no state, start from the current ledger minus 10 to catch recent
    const latestLedger = await server.getLatestLedger();
    cursor = latestLedger.sequence - 10;
  }

  setInterval(async () => {
    try {
      const latestLedger = await server.getLatestLedger();
      const currentLedger = latestLedger.sequence;

      if (cursor < currentLedger) {
        console.log(`Fetching events from ledger ${cursor} to ${currentLedger}`);
        
        const eventsResponse = await server.getEvents({
          startLedger: cursor,
          filters: [
            {
              type: 'contract',
              contractIds: contractIds,
            }
          ],
          limit: 1000,
        });

        if (eventsResponse.events) {
          for (const event of eventsResponse.events) {
            // @ts-ignore
            await processEvent(event, event.txHash, new Date());
          }
        }

        cursor = currentLedger;
        await updateSyncState(cursor);
      }
    } catch (e) {
      console.error('Error polling events:', e);
    }
  }, 5000); // poll every 5 seconds
}

start().catch(console.error);
