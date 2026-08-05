import { Client as PtClient } from './packages/bindings/pt_token/src/index.ts';
import { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } from './src/config/contracts.ts';

async function run() {
  const address = "GAYI4D2ZKERHZASIIGCV6M7RDH6DYMNPQPTS4JCDAI6RHYVCGK5YWMEU";
  const ptClient = new PtClient({
    contractId: CONTRACTS.PT_TOKEN,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey: address
  });
  
  const ptTx = await ptClient.balance({ id: address });
  console.log("PT Balance result:", ptTx.result);
}

run().catch(console.error);
