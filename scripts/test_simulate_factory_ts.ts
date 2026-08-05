import { Client } from '../packages/bindings/factory/src/index';
import { Keypair, rpc, Networks } from '@stellar/stellar-sdk';
import * as dotenv from 'dotenv';
dotenv.config();

const deployments = require('./deployments.testnet.json');

async function run() {
    const admin = Keypair.fromSecret(process.env.ADMIN_SECRET!);
    const client = new Client({
        contractId: deployments.factory,
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: Networks.TESTNET,
        publicKey: admin.publicKey(),
    });

    const server = new rpc.Server('https://soroban-testnet.stellar.org', { allowHttp: true });
    const ledger = await server.getLatestLedger();

    console.log("Simulating deploy_epoch...");
    try {
        const tx = await client.deploy_epoch({
            params: {
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
            }
        }, {
            simulate: true
        });
        console.log("Simulation succeeded!", tx);
    } catch (e: any) {
        console.error("Simulation failed!");
        if (e.response && e.response.data) {
            console.error(JSON.stringify(e.response.data, null, 2));
        } else {
            console.error(e);
        }
    }
}
run();
