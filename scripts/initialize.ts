import { Keypair, Networks, rpc, TransactionBuilder, Contract, Asset } from '@stellar/stellar-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || Networks.TESTNET;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const KEEPER_SECRET = process.env.KEEPER_SECRET;

async function initialize() {
    if (!ADMIN_SECRET || !KEEPER_SECRET) {
        throw new Error('ADMIN_SECRET and KEEPER_SECRET environment variables are required');
    }

    const adminKp = Keypair.fromSecret(ADMIN_SECRET);
    const keeperKp = Keypair.fromSecret(KEEPER_SECRET);
    const server = new rpc.Server(RPC_URL, { allowHttp: true });

    const deploymentsPath = path.resolve(__dirname, 'deployments.json');
    if (!fs.existsSync(deploymentsPath)) {
        throw new Error('deployments.json not found. Run deploy.ts first.');
    }

    const d = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
    
    // We assume a generic underlying token is already deployed or we use native XLM (for simplicity we use a hardcoded address or deploy one)
    // For testnet, we can use a dummy token or standard USDC. Let's deploy a dummy token.
    console.log('Deploying Mock Underlying Token...');
    const dummyTokenWasm = execSync(`soroban contract install --wasm ../target/wasm32-unknown-unknown/release/pt_token.wasm --source ${adminKp.secret()} --rpc-url ${RPC_URL} --network-passphrase "${NETWORK_PASSPHRASE}"`).toString().trim();
    const dummyToken = execSync(`soroban contract deploy --wasm-hash ${dummyTokenWasm} --source ${adminKp.secret()} --rpc-url ${RPC_URL} --network-passphrase "${NETWORK_PASSPHRASE}"`).toString().trim();
    console.log(`Dummy Underlying Token deployed at: ${dummyToken}`);

    // Helper to invoke initialize
    const invoke = (contractId: string, fn: string, args: string) => {
        console.log(`Invoking ${fn} on ${contractId}...`);
        try {
            execSync(`soroban contract invoke --id ${contractId} --source ${adminKp.secret()} --rpc-url ${RPC_URL} --network-passphrase "${NETWORK_PASSPHRASE}" -- ${fn} ${args}`);
        } catch (e: any) {
            console.error(`Failed to invoke ${fn} on ${contractId}:`, e?.stdout?.toString() || e);
            throw e;
        }
    };

    console.log('Initializing Factory...');
    invoke(d.factory, 'initialize', `--admin ${adminKp.publicKey()} --protocol_version 1`);

    console.log('Deploying Epoch...');
    const maturityLedger = 1000000;
    const params = JSON.stringify({
        maturity_ledger: maturityLedger,
        underlying_token: dummyToken,
        sy_wrapper: d.sy_wrapper,
        vault: d.vault,
        pt_token: d.pt_token,
        yt_token: d.yt_token,
        tokenizer: d.tokenizer,
        marketplace: d.marketplace,
        intent_engine: d.intent_engine,
        rollover_engine: d.rollover,
        keeper: keeperKp.publicKey(),
        grace_period_ledgers: 17280
    });

    invoke(d.factory, 'deploy_epoch', `--params '${params}'`);

    console.log('All contracts wired and initialized successfully via Factory!');
}

initialize().catch(console.error);
