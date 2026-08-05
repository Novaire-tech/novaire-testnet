const { Contract, rpc, Networks, TransactionBuilder, Account } = require('@stellar/stellar-sdk');
const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const factoryId = 'CCCGZFAE7TEMGKC7P5PSG73W3BY5475WETXNPD33K42YHKVL6RZ3YI6R';
const factory = new Contract(factoryId);

async function run() {
    try {
        const { nativeToScVal } = require('@stellar/stellar-sdk');
        const account = new Account('GBULVWCJSEZOBASS4PM2KLIMTDOLIY2MTDNA6M3YZBRNWPICEGI3754U', '1');
        async function sim(method, ...args) {
            const builder = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET });
            const tx = builder.addOperation(factory.call(method, ...args)).setTimeout(30).build();
            const simRes = await server.simulateTransaction(tx);
            if (rpc.Api.isSimulationSuccess(simRes)) return simRes.result.retval;
            return simRes.error;
        }
        
        console.log("epoch 1:", await sim("get_epoch", nativeToScVal(1, {type: 'u32'})));
        console.log("epoch 2:", await sim("get_epoch", nativeToScVal(2, {type: 'u32'})));
        console.log("epoch 3:", await sim("get_epoch", nativeToScVal(3, {type: 'u32'})));
    } catch (e) {
        console.error(e);
    }
}
run();
