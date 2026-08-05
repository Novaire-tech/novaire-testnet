const { rpc, Contract, nativeToScVal, scValToNative, Address } = require('@stellar/stellar-sdk');
const fs = require('fs');

async function run() {
  const server = new rpc.Server('https://soroban-testnet.stellar.org');
  const d = require('./scripts/deployments.testnet.json');
  const k = require('./scripts/testnet_keys.json');

  const marketplaceId = d.marketplace;
  const marketplaceContract = new Contract(marketplaceId);

  console.log("Marketplace ID:", marketplaceId);
  const inputAmount = "100000000"; // 10 units

  // Quote buy PT (sell underlying for PT)
  // According to Marketplace interface, it usually has `swap_exact_in` or `buy_pt` or similar. Let's see its methods.
}
run();
