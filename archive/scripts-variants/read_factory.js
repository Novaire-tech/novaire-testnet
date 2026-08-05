const { Contract, rpc, Networks, TransactionBuilder, Account } = require('@stellar/stellar-sdk');
const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const factoryId = 'CCCGZFAE7TEMGKC7P5PSG73W3BY5475WETXNPD33K42YHKVL6RZ3YI6R';
const factory = new Contract(factoryId);

async function run() {
    try {
        const account = new Account('GBULVWCJSEZOBASS4PM2KLIMTDOLIY2MTDNA6M3YZBRNWPICEGI3754U', '1');
        async function sim(method, ...args) {
            const builder = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET });
            const tx = builder.addOperation(factory.call(method, ...args)).setTimeout(30).build();
            const simRes = await server.simulateTransaction(tx);
            if (rpc.Api.isSimulationSuccess(simRes)) return simRes.result.retval;
            return simRes.error;
        }
        
        console.log("epoch_count:", await sim("epoch_count"));
    } catch (e) {
        console.error(e);
    }
}
run();
