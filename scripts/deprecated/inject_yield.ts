import { Keypair, Networks } from '@stellar/stellar-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const NETWORK = (process.env.NETWORK || 'testnet').toLowerCase();
const isMainnet = NETWORK === 'mainnet';

const RPC_URL = process.env.RPC_URL || (isMainnet ? 'https://mainnet.sorobanrpc.com' : 'https://soroban-testnet.stellar.org');
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || (isMainnet ? Networks.PUBLIC : Networks.TESTNET);

const DEPLOYMENTS_FILE = path.resolve(__dirname, `deployments.${NETWORK}.json`);
const KEYS_FILE = path.resolve(__dirname, isMainnet ? 'mainnet_keys.json' : 'testnet_keys.json');

function invoke(contractId: string, fn: string, args: string, secret: string) {
    try {
        const cmd = `stellar contract invoke --id ${contractId} --source ${secret} --rpc-url ${RPC_URL} --network-passphrase "${NETWORK_PASSPHRASE}" -- ${fn} ${args}`;
        return execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    } catch (e: any) {
        console.error(`Failed to invoke ${fn} on ${contractId}:`, e?.stderr?.toString() || e);
        throw e;
    }
}

async function run() {
    const amountStr = process.argv[2];
    if (!amountStr) {
        console.error("Usage: npx ts-node scripts/inject_yield.ts <amount_native>");
        console.error("Example: npx ts-node scripts/inject_yield.ts 100");
        process.exit(1);
    }
    
    const amountFloat = parseFloat(amountStr);
    if (isNaN(amountFloat) || amountFloat <= 0) {
        console.error("Invalid amount");
        process.exit(1);
    }
    const amountStroops = Math.floor(amountFloat * 10000000).toString();

    console.log('--- Step 1: Loading Artifacts ---');
    if (!fs.existsSync(DEPLOYMENTS_FILE)) throw new Error('Deployments missing.');
    const d = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, 'utf-8'));
    
    if (!fs.existsSync(KEYS_FILE)) throw new Error(`${path.basename(KEYS_FILE)} missing`);
    const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
    if (!keys.admin_secret) throw new Error(`admin_secret missing in ${path.basename(KEYS_FILE)}`);
    const adminKp = Keypair.fromSecret(keys.admin_secret);
    const adminAddress = adminKp.publicKey();
    
    console.log(`Treasury Wallet: ${adminAddress}`);
    console.log(`Underlying Token: ${d.underlying_token}`);
    console.log(`SY Wrapper: ${d.sy_wrapper}`);

    console.log(`\n--- Step 2: Injecting ${amountFloat} Yield ---`);
    console.log(`Transferring ${amountStroops} stroops of underlying directly to SY Wrapper...`);
    
    invoke(d.underlying_token, 'transfer', `--from ${adminAddress} --to ${d.sy_wrapper} --amount ${amountStroops}`, keys.admin_secret);
    
    console.log(`\n--- Step 3: Triggering SY Wrapper Rate Update ---`);
    try {
        invoke(d.sy_wrapper, 'harvest_yield', ``, keys.admin_secret);
        console.log("Harvest yield triggered.");
    } catch (e) {
        console.log("harvest_yield event emission might have failed, but the underlying balance is already increased.");
    }
    
    console.log(`\n--- Step 4: Poking Tokenizer to Update Global Index ---`);
    try {
        // By calling claim_yield for the admin (or any user), the Tokenizer 
        // fetches the live exchange rate and updates the global yield index in the YT contract.
        invoke(d.tokenizer, 'claim_yield', `--user ${adminAddress}`, keys.admin_secret);
        console.log("Global yield index updated via Tokenizer.");
    } catch (e: any) {
        console.log("Failed to poke Tokenizer. claimable_yield may still show 0 in UI.", e?.message);
    }

    console.log("\nYield injected successfully!");
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
