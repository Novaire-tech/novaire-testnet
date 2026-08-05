import { Client as PtClient } from './packages/bindings/pt_token/src/index.js';
import { Client as YtClient } from './packages/bindings/yt_token/src/index.js';
import { Client as VaultClient } from './packages/bindings/vault/src/index.js';
import { Client as MarketplaceClient } from './packages/bindings/marketplace/src/index.js';
import { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } from './src/config/contracts.js';

async function main() {
  const clientOptions = {
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  };

  const pt = new PtClient({ ...clientOptions, contractId: CONTRACTS.PT_TOKEN });
  const yt = new YtClient({ ...clientOptions, contractId: CONTRACTS.YT_TOKEN });
  const vault = new VaultClient({ ...clientOptions, contractId: CONTRACTS.VAULT });
  const market = new MarketplaceClient({ ...clientOptions, contractId: CONTRACTS.MARKETPLACE });

  console.log('PT Total Supply:', (await pt.total_supply()).result);
  console.log('YT Total Supply:', (await yt.total_supply()).result);
  console.log('Vault Total Shares:', (await vault.total_vault_shares()).result);
  
  const reserves = await market.get_reserves();
  console.log('Market Reserves:', reserves.result);

  const ptPrice = await market.get_pt_price();
  console.log('PT Price:', ptPrice.result);
}

main().catch(console.error);
