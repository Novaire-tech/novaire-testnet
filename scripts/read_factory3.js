const { Contract, rpc, Networks, TransactionBuilder, Account, scValToNative } = require('@stellar/stellar-sdk');
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
        
        const epoch3 = await sim("get_epoch", nativeToScVal(3, {type: 'u32'}));
        const map = epoch3.value();
        for (const entry of map) {
            const keyStr = entry.key().value().toString();
            try {
                console.log(keyStr + ": " + JSON.stringify(scValToNative(entry.val())));
            } catch(e) {
                console.log(keyStr + ": " + require('@stellar/stellar-sdk').Address.fromScAddress(entry.val().value()).toString());
            }
        }
    } catch (e) {
        console.error(e);
    }
}
run();
