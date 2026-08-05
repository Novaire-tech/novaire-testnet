import { Client } from './packages/bindings/marketplace/src/index.js';
import { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } from './src/config/contracts.ts';

async function main() {
  const client = new Client({
    contractId: CONTRACTS.MARKETPLACE,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  
  const tx = await client.get_pt_price();
  console.log('priceTx.result:', tx.result);
  console.log('Type of priceTx.result:', typeof tx.result);
  console.log('Is BigInt?', typeof tx.result === 'bigint');
  console.log('JSON:', JSON.stringify(tx.result, (k,v) => typeof v === 'bigint' ? v.toString() : v));
}
main().catch(console.error);
