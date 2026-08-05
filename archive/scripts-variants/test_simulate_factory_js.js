const { Contract, rpc, Networks, TransactionBuilder, Keypair, nativeToScVal } = require('@stellar/stellar-sdk');
require('dotenv').config();

const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const deployments = require('./deployments.testnet.json');
const factoryId = deployments.factory;
const factory = new Contract(factoryId);

async function run() {
    try {
        const admin = Keypair.fromSecret(process.env.ADMIN_SECRET);
        const account = await server.getAccount(admin.publicKey());
        const ledger = await server.getLatestLedger();
        
        const params = {
            maturity_ledger: ledger.sequence + 50000,
            underlying_token: deployments.underlying_token,
            sy_wrapper: deployments.sy_wrapper,
            vault: deployments.vault,
            pt_token: deployments.pt_token,
            yt_token: deployments.yt_token,
            tokenizer: deployments.tokenizer,
            marketplace: deployments.marketplace,
            intent_engine: deployments.intent_engine,
            rollover_engine: deployments.rollover,
            keeper: admin.publicKey(),
            grace_period_ledgers: 1000
        };

        // Construct map for params
        const paramsVal = nativeToScVal(params, { type: 'map', keyType: { type: 'symbol' }, valType: { type: 'scvObject' } });
        // wait, I can just build the xdr manually or parse the xdr tree if that fails, but nativeToScVal works fine for maps if I construct it correctly.
        // Actually, easier:
        const xdrParams = require('@stellar/stellar-sdk').xdr.ScVal.scvMap([
            new require('@stellar/stellar-sdk').xdr.ScMapEntry({
                key: nativeToScVal('grace_period_ledgers', {type:'symbol'}),
                val: nativeToScVal(1000, {type:'u32'})
            }),
            new require('@stellar/stellar-sdk').xdr.ScMapEntry({
                key: nativeToScVal('intent_engine', {type:'symbol'}),
                val: new require('@stellar/stellar-sdk').Address(deployments.intent_engine).toScVal()
            }),
            new require('@stellar/stellar-sdk').xdr.ScMapEntry({
                key: nativeToScVal('keeper', {type:'symbol'}),
                val: new require('@stellar/stellar-sdk').Address(admin.publicKey()).toScVal()
            }),
            new require('@stellar/stellar-sdk').xdr.ScMapEntry({
                key: nativeToScVal('marketplace', {type:'symbol'}),
                val: new require('@stellar/stellar-sdk').Address(deployments.marketplace).toScVal()
            }),
            new require('@stellar/stellar-sdk').xdr.ScMapEntry({
                key: nativeToScVal('maturity_ledger', {type:'symbol'}),
                val: nativeToScVal(ledger.sequence + 50000, {type:'u32'})
            }),
            new require('@stellar/stellar-sdk').xdr.ScMapEntry({
                key: nativeToScVal('pt_token', {type:'symbol'}),
                val: new require('@stellar/stellar-sdk').Address(deployments.pt_token).toScVal()
            }),
            new require('@stellar/stellar-sdk').xdr.ScMapEntry({
                key: nativeToScVal('rollover_engine', {type:'symbol'}),
                val: new require('@stellar/stellar-sdk').Address(deployments.rollover).toScVal()
            }),
            new require('@stellar/stellar-sdk').xdr.ScMapEntry({
                key: nativeToScVal('sy_wrapper', {type:'symbol'}),
                val: new require('@stellar/stellar-sdk').Address(deployments.sy_wrapper).toScVal()
            }),
            new require('@stellar/stellar-sdk').xdr.ScMapEntry({
                key: nativeToScVal('tokenizer', {type:'symbol'}),
                val: new require('@stellar/stellar-sdk').Address(deployments.tokenizer).toScVal()
            }),
            new require('@stellar/stellar-sdk').xdr.ScMapEntry({
                key: nativeToScVal('underlying_token', {type:'symbol'}),
                val: new require('@stellar/stellar-sdk').Address(deployments.underlying_token).toScVal()
            }),
            new require('@stellar/stellar-sdk').xdr.ScMapEntry({
                key: nativeToScVal('vault', {type:'symbol'}),
                val: new require('@stellar/stellar-sdk').Address(deployments.vault).toScVal()
            }),
            new require('@stellar/stellar-sdk').xdr.ScMapEntry({
                key: nativeToScVal('yt_token', {type:'symbol'}),
                val: new require('@stellar/stellar-sdk').Address(deployments.yt_token).toScVal()
            })
        ]);

        const tx = new TransactionBuilder(account, { fee: "10000", networkPassphrase: Networks.TESTNET })
            .addOperation(factory.call("deploy_epoch", xdrParams))
            .setTimeout(30)
            .build();
            
        const simRes = await server.simulateTransaction(tx);
        console.log(JSON.stringify(simRes, null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
