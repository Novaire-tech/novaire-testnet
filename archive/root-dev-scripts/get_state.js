const { rpc, Contract, nativeToScVal, scValToNative } = require('@stellar/stellar-sdk');
const fs = require('fs');

async function run() {
  const server = new rpc.Server('https://soroban-testnet.stellar.org');
  const d = require('./scripts/deployments.testnet.json');
  const user = 'GCOPNTJERGKW43QGKGCCBKMBCR2MCJW3Q36C5JIPHCYGABJAG4ZFXRM5';
  
  async function invokeRead(contractId, fn, args = []) {
    const tx = new rpc.TransactionBuilder(await server.getAccount(user), { fee: "100" })
      .addOperation(Contract.call(contractId, fn, ...args))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (!sim || !sim.result || !sim.result.retval) return null;
    return scValToNative(sim.result.retval);
  }

  try {
    const ptBal = await invokeRead(d.pt_token, 'balance', [nativeToScVal(user, {type: 'address'})]);
    const ytBal = await invokeRead(d.yt_token, 'balance', [nativeToScVal(user, {type: 'address'})]);
    const claimable = await invokeRead(d.yt_token, 'claimable_yield', [nativeToScVal(user, {type: 'address'})]);
    const syRate = await invokeRead(d.sy_wrapper, 'get_exchange_rate');
    const totalShares = await invokeRead(d.sy_wrapper, 'total_shares');
    console.log({
      ptBal: ptBal.toString(),
      ytBal: ytBal.toString(),
      claimable: claimable.toString(),
      syRate: syRate.toString(),
      totalShares: totalShares.toString()
    });
  } catch (e) {
    console.error(e);
  }
}
run();
