const { Contract, rpc, Networks, TransactionBuilder, Account, scValToNative } = require('@stellar/stellar-sdk');
const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const factoryId = 'CCCGZFAE7TEMGKC7P5PSG73W3BY5475WETXNPD33K42YHKVL6RZ3YI6R';
const factory = new Contract(factoryId);
const deployments = require('./deployments.testnet.json');

async function run() {
    try {
        const { nativeToScVal } = require('@stellar/stellar-sdk');
        const account = new Account('GBULVWCJSEZOBASS4PM2KLIMTDOLIY2MTDNA6M3YZBRNWPICEGI3754U', '1');
        
        const ledger = await server.getLatestLedger();
        const maturity_ledger = ledger.sequence + 50000;
        
        const params = {
            maturity_ledger: maturity_ledger,
            underlying_token: deployments.underlying_token,
            sy_wrapper: deployments.sy_wrapper,
            vault: deployments.vault,
            pt_token: deployments.pt_token,
            yt_token: deployments.yt_token,
            tokenizer: deployments.tokenizer,
            marketplace: deployments.marketplace,
            intent_engine: deployments.intent_engine,
            rollover_engine: deployments.rollover,
            keeper: 'GBULVWCJSEZOBASS4PM2KLIMTDOLIY2MTDNA6M3YZBRNWPICEGI3754U',
            grace_period_ledgers: 1000
        };

        const txParams = nativeToScVal(params, {
            type: 'map',
            keyType: { type: 'symbol' },
            valType: { type: 'scvObject' } // wait, scValToNative handles objects but nativeToScVal requires exact types.
            // Let's just use stellar CLI or stringified JSON via node spawn
        });
    } catch (e) {
        console.error(e);
    }
}
run();
