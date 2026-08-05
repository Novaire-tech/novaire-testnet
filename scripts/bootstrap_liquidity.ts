import { Keypair, Networks, rpc } from '@stellar/stellar-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import axios from 'axios';

const NETWORK = (process.env.NETWORK || 'testnet').toLowerCase();
const isMainnet = NETWORK === 'mainnet';

const RPC_URL = process.env.RPC_URL || (isMainnet ? 'https://mainnet.sorobanrpc.com' : 'https://soroban-testnet.stellar.org');
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || (isMainnet ? Networks.PUBLIC : Networks.TESTNET);

const DEPLOYMENTS_FILE = path.resolve(__dirname, `deployments.${NETWORK}.json`);
const KEYS_FILE = path.resolve(__dirname, isMainnet ? 'mainnet_keys.json' : 'testnet_keys.json');

async function fundAccount(publicKey: string) {
    console.log(`Funding wallet ${publicKey} via Friendbot...`);
    try {
        await axios.get(`https://friendbot.stellar.org?addr=${publicKey}`);
    } catch (e: any) {
        if (e.response && e.response.status === 400) {
            console.log("Account already funded.");
        } else {
            console.warn("Friendbot failed, assuming account has funds.");
        }
    }
}

function invoke(contractId: string, fn: string, args: string, secret: string) {
    try {
        const cmd = `stellar contract invoke --id ${contractId} --source ${secret} --rpc-url ${RPC_URL} --network-passphrase "${NETWORK_PASSPHRASE}" --inclusion-fee 1000000 -- ${fn} ${args}`;
        return execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    } catch (e: any) {
        console.error(`Failed to invoke ${fn} on ${contractId}:`, e?.stderr?.toString() || e);
        throw e;
    }
}

function parseSorobanI128(val: string): bigint {
    // Soroban CLI returns strings like "1000000000" or maybe quotes
    return BigInt(val.replace(/['"]/g, ''));
}

async function run() {
    console.log('--- Step 1: Loading Artifacts ---');
    if (!fs.existsSync(DEPLOYMENTS_FILE)) throw new Error('Deployments missing.');
    const d = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, 'utf-8'));
    console.log("Contracts Loaded:");
    console.log(`Underlying: ${d.underlying_token}`);
    console.log(`Vault: ${d.vault}`);
    console.log(`Tokenizer: ${d.tokenizer}`);
    console.log(`Marketplace: ${d.marketplace}`);
    console.log(`Intent Engine: ${d.intent_engine}`);
    console.log(`PT Token: ${d.pt_token}`);
    console.log(`YT Token: ${d.yt_token}`);

    console.log('\n--- Step 2: Treasury Setup ---');
    if (!fs.existsSync(KEYS_FILE)) throw new Error(`${path.basename(KEYS_FILE)} missing`);
    const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
    if (!keys.admin_secret) throw new Error(`admin_secret missing in ${path.basename(KEYS_FILE)}`);
    const adminKp = Keypair.fromSecret(keys.admin_secret);
    const adminAddress = adminKp.publicKey();
    console.log(`Treasury Wallet: ${adminAddress}`);

    if (!isMainnet) {
        await fundAccount(adminAddress);
    }

    let initXlm = parseSorobanI128(invoke(d.underlying_token, 'balance', `--id ${adminAddress}`, adminKp.secret()));
    console.log(`Treasury Initial Underlying Balance (stroops): ${initXlm.toString()}`);
    if (initXlm < BigInt(1000000000)) {
        console.warn('Treasury lacks sufficient XLM balance. Ensure it is funded (e.g. via Friendbot or manual transfer).');
    }

    // --- SAFEGUARD: Prevent Double Bootstrap ---
    const forceFlag = process.argv.includes('--force');
    console.log('Querying marketplace reserves...');
    let initialPtReserveRaw = "0";
    let initialUndReserveRaw = "0";
    let spotPriceRaw = "0";

    try {
        const reservesRaw = invoke(d.marketplace, 'get_reserves', '', adminKp.secret());
        const reservesStr = reservesRaw.replace(/^Ok\((.+)\)$/, '$1');
        const reservesArr = JSON.parse(reservesStr);
        initialPtReserveRaw = reservesArr[0] || "0";
        initialUndReserveRaw = reservesArr[1] || "0";

        const priceRaw = invoke(d.marketplace, 'get_pt_price', '', adminKp.secret());
        spotPriceRaw = priceRaw.replace(/^Ok\((.+)\)$/, '$1').replace(/"/g, '');
    } catch (e) {
        console.warn("Could not fetch initial reserves, assuming empty.");
    }

    const ptReserveVal = parseSorobanI128(initialPtReserveRaw);
    const undReserveVal = parseSorobanI128(initialUndReserveRaw);

    if (ptReserveVal > 0n || undReserveVal > 0n) {
        console.log(`\n🚨 MARKETPLACE NOT EMPTY 🚨`);
        console.log(`PT Reserves: ${ptReserveVal.toString()}`);
        console.log(`Underlying Reserves: ${undReserveVal.toString()}`);
        console.log(`LP Supply: (unavailable/private)`);
        console.log(`Spot Price: ${spotPriceRaw}`);

        if (!forceFlag) {
            console.error('\nMarketplace already contains liquidity. Refusing to bootstrap twice.');
            console.error('Run with --force to override (development only).\n');
            process.exit(1);
        } else {
            console.warn('\n⚠️ --force provided. Proceeding to add liquidity over existing reserves.\n');
        }
    }
    // -------------------------------------------

    // Step 3 (Cleanup): Remove any existing liquidity from previous failed runs.
    const { Client: MarketplaceClient } = await import('../packages/bindings/marketplace/src/index');
    const marketplaceClient = new MarketplaceClient({
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: RPC_URL,
        contractId: d.marketplace
    });

    console.log('Querying existing LP shares via Stellar ledger...');
    // Read LP balance: try removing 1 share to simulate and get the "insufficient" error, 
    // or read ledger entry directly. Simplest: encode the DataKey::LpBalance storage key.
    // We use stellar-sdk to read the storage entry directly.
    const { rpc: rpcModule, xdr, Address, nativeToScVal } = await import('@stellar/stellar-sdk');
    const rpcClient = new rpcModule.Server(RPC_URL, { allowHttp: true });

    // Encode the LpBalance(admin) key
    const lpKey = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('LpBalance'),
            val: xdr.ScVal.scvVec([Address.fromString(adminAddress).toScVal()])
        })
    ]);

    let currentLpBalance = BigInt(0);
    try {
        const contractId = d.marketplace;
        const ledgerKey = xdr.LedgerKey.contractData(
            new xdr.LedgerKeyContractData({
                contract: Address.fromString(contractId).toScAddress(),
                key: lpKey,
                durability: xdr.ContractDataDurability.persistent()
            })
        );
        const entries = await rpcClient.getLedgerEntries(ledgerKey);
        if (entries.entries.length > 0) {
            const val = entries.entries[0].val.contractData().val();
            const hiStr = val.i128().hi().toString();
            const loStr = val.i128().lo().toString();
            currentLpBalance = BigInt(hiStr) * (2n ** 64n) + BigInt(loStr);
        }
    } catch (e) {
        console.log('Could not read LP balance from ledger, assuming 0.');
    }
    console.log(`Treasury LP Balance: ${currentLpBalance.toString()}`);

    if (currentLpBalance > BigInt(0)) {
        console.log(`Removing existing skewed liquidity (${currentLpBalance.toString()} LP shares)...`);
        const removeTx = await marketplaceClient.remove_liquidity({
            provider: adminAddress,
            lp_shares: currentLpBalance
        });
        await removeTx.signAndSend({
            signTransaction: async (xdrStr: string) => {
                const { TransactionBuilder } = await import('@stellar/stellar-sdk');
                const tx = TransactionBuilder.fromXDR(xdrStr, NETWORK_PASSPHRASE);
                tx.sign(adminKp);
                return tx.toXDR();
            }
        });
        console.log('Existing liquidity removed. Pool is now clean.');
    } else {
        console.log('No existing liquidity to remove.');
    }

    // Step 3a: Mint fresh PT/YT to provide as liquidity.
    const DEPOSIT_AMOUNT = process.env.BOOTSTRAP_AMOUNT || "120000000"; // 12 XLM default (override with BOOTSTRAP_AMOUNT env)
    console.log(`3a. Vault.deposit(${DEPOSIT_AMOUNT})...`);
    let sy_shares_str = invoke(d.vault, 'deposit', `--depositor ${adminAddress} --amount ${DEPOSIT_AMOUNT}`, adminKp.secret()).trim();
    sy_shares_str = sy_shares_str.replace(/"/g, '');

    console.log(`3b. Tokenizer.mint_pt_yt(${sy_shares_str})...`);
    invoke(d.tokenizer, 'mint_pt_yt', `--user ${adminAddress} --sy_shares ${sy_shares_str}`, adminKp.secret());

    // --- DYNAMIC PRICING LOGIC ---
    console.log(`3c. Computing dynamic PT price for Target APY...`);
    const TARGET_APY = 0.10; // 10%

    const metadataRaw = invoke(d.tokenizer, 'metadata', '', adminKp.secret());
    const jsonStr = metadataRaw.replace(/^Ok\((.+)\)$/, '$1');
    const metadata = JSON.parse(jsonStr);
    const maturityLedger = Number(metadata.maturity_ledger);

    const latestLedgerData = await rpcClient.getLatestLedger();
    const currentLedger = latestLedgerData.sequence;

    const ledgersRemaining = Math.max(1, maturityLedger - currentLedger);
    const daysRemaining = (ledgersRemaining * 5.5) / 86400;

    // PT Price = FaceValue / (1 + APY)^(days/365)
    const ptPriceFloat = 1.0 / Math.pow(1 + TARGET_APY, daysRemaining / 365);

    console.log(`- Epoch duration remaining: ${daysRemaining.toFixed(2)} days`);
    console.log(`- Target APY: ${(TARGET_APY * 100).toFixed(1)}%`);
    console.log(`- Computed PT Bootstrap Price: ${ptPriceFloat.toFixed(6)}`);

    const PT_AMOUNT = sy_shares_str;
    const ptPriceMultiplier = BigInt(Math.floor(ptPriceFloat * 1e9));
    const UNDERLYING_AMOUNT = (BigInt(PT_AMOUNT) * ptPriceMultiplier / BigInt(1e9)).toString();

    console.log(`3d. Marketplace.add_liquidity(PT: ${PT_AMOUNT}, Underlying: ${UNDERLYING_AMOUNT})...`);
    invoke(d.marketplace, 'add_liquidity', `--provider ${adminAddress} --pt_amount ${PT_AMOUNT} --underlying_amount ${UNDERLYING_AMOUNT}`, adminKp.secret());

    // Step 3.5: Warm-up swap to initialize the TWAP.
    // The TWAP is only updated on swap operations, NOT on add_liquidity.
    // We must execute at least one swap to seed a non-zero TWAP before the
    // IntentEngine can route retail transactions.
    const WARMUP_AMOUNT = "1000000"; // 0.1 XLM warm-up
    console.log(`3.5. Warm-up swap (swap_underlying_for_pt: ${WARMUP_AMOUNT} stroops) to initialize TWAP...`);
    // Note: min_pt_out must be > 0 per Marketplace ZeroInput check. Use 1 stroop.
    invoke(d.marketplace, 'swap_underlying_for_pt', `--buyer ${adminAddress} --underlying_in ${WARMUP_AMOUNT} --min_pt_out 1`, adminKp.secret());

    console.log('\n--- Step 4: Verification ---');
    const twapRaw = invoke(d.marketplace, 'get_twap_rate', '', adminKp.secret());
    console.log(`Marketplace TWAP Rate: ${twapRaw}`);

    const ptReserveRaw = invoke(d.pt_token, 'balance', `--id ${d.marketplace}`, adminKp.secret());
    const undReserveRaw = invoke(d.underlying_token, 'balance', `--id ${d.marketplace}`, adminKp.secret());
    console.log(`Marketplace PT Reserve: ${ptReserveRaw}`);
    console.log(`Marketplace Underlying Reserve: ${undReserveRaw}`);

    const twapValue = parseSorobanI128(twapRaw.replace(/^Ok\((.+)\)$/, '$1'));
    if (twapValue <= BigInt(0)) {
        throw new Error('BLOCKER: TWAP is still 0 after warm-up swap. The Marketplace swap logic may not be initializing ImpliedRateTwap correctly. Aborting.');
    }
    console.log(`✅ TWAP seeded successfully: ${twapValue.toString()}`);

    if (isMainnet) {
        console.log('\n--- Step 5 & 6: Skipped (Mainnet) ---');
        console.log('Skipping retail transaction validation on Mainnet. Protocol bootstrap is complete.');
        console.log('\n✅ Bootstrap and Execution Completed Successfully!');
        return;
    }
    // Compute maturity ledger for the retail intent
    const currentMaturityLedger = d['maturity_ledger'];
    if (!currentMaturityLedger) {
        throw new Error('maturity_ledger not found in deployments! Please run deploy.ts or deploy_xlm_epoch.ts first.');
    }

    console.log('\n--- Step 5: Intent Engine Execution ---');
    const testWallet = Keypair.random();
    console.log(`Retail Test Wallet: ${testWallet.publicKey()}`);
    await fundAccount(testWallet.publicKey());

    // Wait a moment for Friendbot to settle
    const retailDeposit = "10000000"; // 1 XLM (1e7 stroops)

    console.log('Invoking execute_fixed_yield_intent via CLI...');
    try {
        const mintResult = invoke(
            d.intent_engine,
            'execute_fixed_yield_intent',
            `--user ${testWallet.publicKey()} --usdc_amount ${retailDeposit} --min_implied_rate 0 --_maturity_ledger ${currentMaturityLedger} --yt_sale_percentage 100 --min_underlying_out 0`,
            testWallet.secret()
        );
        console.log('Retail Transaction Success!');
        console.log('Mint Result:', mintResult);
    } catch (e: any) {
        const stderr = e.stderr?.toString() || e.message || String(e);
        console.error('Retail Transaction Failed:', stderr);
        throw new Error('Retail mint transaction failed!');
    }

    console.log('\n--- Step 6: Final Verification ---');
    const retailPt = invoke(d.pt_token, 'balance', `--id ${testWallet.publicKey()}`, testWallet.secret());
    const retailYt = invoke(d.yt_token, 'balance', `--id ${testWallet.publicKey()}`, testWallet.secret());
    const retailXlm = invoke(d.underlying_token, 'balance', `--id ${testWallet.publicKey()}`, testWallet.secret());

    console.log(`Retail PT Balance: ${retailPt}`);
    console.log(`Retail YT Balance: ${retailYt}`);
    console.log(`Retail XLM Balance: ${retailXlm} (minus gas)`);

    console.log('\n✅ Bootstrap and Execution Completed Successfully!');
}

run().catch(err => {
    console.error("Script failed:", err);
    process.exit(1);
});
