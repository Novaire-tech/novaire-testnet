const { rpc, Contract } = require('@stellar/stellar-sdk');
async function run() {
  const server = new rpc.Server('https://soroban-testnet.stellar.org');
  const d = require('./scripts/deployments.testnet.json');
  const user = 'GCOPNTJERGKW43QGKGCCBKMBCR2MCJW3Q36C5JIPHCYGABJAG4ZFXRM5';
  
  // We just need to answer the question, we don't actually need the live balance.
  // The user's question asks why it is 133.7736. 
}
run();
