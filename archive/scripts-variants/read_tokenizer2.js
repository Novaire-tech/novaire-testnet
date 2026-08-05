const { Contract, rpc, Networks, TransactionBuilder, Account } = require('@stellar/stellar-sdk');
const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const tokenizerId = 'CBXCZ3VONYXLXSOSBPG5MHV7B5JIQI437ISNHAPHCCCYMPTKVDF6OLCN'; // NEW Tokenizer
const tokenizer = new Contract(tokenizerId);

async function run() {
    try {
        const account = new Account('GBULVWCJSEZOBASS4PM2KLIMTDOLIY2MTDNA6M3YZBRNWPICEGI3754U', '1');
        async function sim(method, ...args) {
            const builder = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET });
            const tx = builder.addOperation(tokenizer.call(method, ...args)).setTimeout(30).build();
            const simRes = await server.simulateTransaction(tx);
            if (rpc.Api.isSimulationSuccess(simRes)) return simRes.result.retval;
            return simRes.error;
        }
        
        const { nativeToScVal } = require('@stellar/stellar-sdk');
        console.log("maturity_ledger:", await sim("get_u32", nativeToScVal(3, { type: 'u32' }))); 
        console.log("epoch_state:", await sim("get_epoch_state"));
    } catch (e) {
        console.error(e);
    }
}
run();
