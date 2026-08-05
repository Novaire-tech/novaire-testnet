const { Contract, rpc, Networks, TransactionBuilder, Account } = require('@stellar/stellar-sdk');
const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const tokenizerId = 'CB362JYZEJNVMIOE3GX6T3GMOODQ35CWIYQ7VT76YR4IIV2RUT3OMVTC';
const tokenizer = new Contract(tokenizerId);

async function run() {
    try {
        const latestLedger = await server.getLatestLedger();
        console.log('Current Ledger:', latestLedger.sequence);
        const account = new Account('GBULVWCJSEZOBASS4PM2KLIMTDOLIY2MTDNA6M3YZBRNWPICEGI3754U', '1');
        
        async function sim(method, ...args) {
            const builder = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET });
            const tx = builder.addOperation(tokenizer.call(method, ...args)).setTimeout(30).build();
            const simRes = await server.simulateTransaction(tx);
            if (rpc.Api.isSimulationSuccess(simRes)) {
                return simRes.result.retval;
            } else {
                return simRes.error;
            }
        }
        
        const { xdr, nativeToScVal } = require('@stellar/stellar-sdk');
        
        console.log("epoch_state:", await sim("get_epoch_state"));
        console.log("initialized:", await sim("is_initialized"));
        console.log("maturity_ledger:", await sim("get_u32", nativeToScVal(3, { type: 'u32' }))); // DataKey::MaturityLedger is 3
        console.log("settlement_exchange_rate:", await sim("get_settlement_rate"));
    } catch (e) {
        console.error(e);
    }
}
run();
