const { Keypair, rpc, Networks } = require('@stellar/stellar-sdk');
require('dotenv').config();
const { execSync } = require('child_process');

const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL, {allowHttp: true});
const deployments = require('./deployments.testnet.json');

async function run() {
    const admin = Keypair.fromSecret(process.env.ADMIN_SECRET);
    const ledger = await server.getLatestLedger();
    const maturity_ledger = ledger.sequence + 50000;
    
    const paramsJson = JSON.stringify({
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
        keeper: admin.publicKey(),
        grace_period_ledgers: 1000
    });

    const invokeArgs = [
        `--id ${deployments.factory}`,
        `--source ${admin.secret()}`,
        `--rpc-url ${RPC_URL}`,
        `--network-passphrase "Test SDF Network ; September 2015"`,
        `--`,
        `deploy_epoch`,
        `--params '${paramsJson}'`
    ].join(' ');

    console.log("Running CLI: stellar contract invoke", invokeArgs);
    try {
        const out = execSync(`stellar contract invoke ${invokeArgs}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
        console.log("Success:", out);
    } catch(e) {
        console.log("Failed. Stderr:");
        console.log(e.stderr ? e.stderr.toString() : e.message);
    }
}
run();
