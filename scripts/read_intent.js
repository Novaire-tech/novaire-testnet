const { Contract, rpc, Networks, TransactionBuilder, Account } = require('@stellar/stellar-sdk');
const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const intentEngineId = 'CDCFQY6OBCOA2SMFKSZFK22FK4I7FLM5RMEKXHVAIDQJZGY562MEMZ5F'; // NEW Intent Engine
const intent = new Contract(intentEngineId);

async function run() {
    try {
        const account = new Account('GBULVWCJSEZOBASS4PM2KLIMTDOLIY2MTDNA6M3YZBRNWPICEGI3754U', '1');
        async function sim(method, ...args) {
            const builder = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET });
            const tx = builder.addOperation(intent.call(method, ...args)).setTimeout(30).build();
            const simRes = await server.simulateTransaction(tx);
            if (rpc.Api.isSimulationSuccess(simRes)) return simRes.result.retval;
            return simRes.error;
        }
        
        const { nativeToScVal } = require('@stellar/stellar-sdk');
        console.log("initialized:", await sim("is_initialized"));
    } catch (e) {
        console.error(e);
    }
}
run();
