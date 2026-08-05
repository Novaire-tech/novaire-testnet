import { Keypair, rpc, Networks, TransactionBuilder, BASE_FEE, Asset, Operation } from '@stellar/stellar-sdk';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Client } from '../packages/bindings/intent_engine/src/index';

const RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || Networks.TESTNET;

async function fundAccount(publicKey: string) {
    console.log(`Funding test wallet ${publicKey} via Friendbot...`);
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

async function testXlmMint() {
    console.log('--- Testing XLM Mint Flow ---');
    const DEPLOYMENTS_FILE = path.resolve(__dirname, 'deployments.testnet.json');
    const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, 'utf-8'));

    const server = new rpc.Server(RPC_URL, { allowHttp: true });

    // Generate a fresh wallet with NO trustlines
    const testWallet = Keypair.random();
    console.log(`Test Wallet: ${testWallet.publicKey()}`);
    console.log(`Secret Key: ${testWallet.secret()}`);

    await fundAccount(testWallet.publicKey());

    const client = new Client({
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: RPC_URL,
        contractId: deployments.intent_engine
    });

    const amountToMint = 10000000; // 1 XLM

    const ledger = await server.getLatestLedger();
    const currentMaturityLedger = ledger.sequence + 50000; // Close enough to the deployed epoch

    console.log('Building intent_engine execute_fixed_yield_intent transaction...');

    const txBuilder = await client.execute_fixed_yield_intent({
        user: testWallet.publicKey(),
        usdc_amount: BigInt(amountToMint), // The parameter is named usdc_amount in the contract, but it represents the underlying token (XLM)
        min_implied_rate: BigInt(0), // Accept any rate for testing
        _maturity_ledger: currentMaturityLedger,
        yt_sale_percentage: 100
    });

    // The bindings return a generic AssembledTransaction. We need to sign and send.
    console.log('Simulating transaction...');
    // We can use signAndSend which simulates and signs it
    const { result, error } = await txBuilder.signAndSend({
        signTransaction: async (xdr: string) => {
            const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
            tx.sign(testWallet);
            return tx.toXDR();
        }
    });

    if (error) {
        console.error('Transaction Failed:', error);
        throw new Error('Mint transaction failed!');
    } else {
        console.log('Transaction Success!');
        console.log('Mint Intent Record:', result);
    }

    console.log('✅ Native XLM successfully minted PT and YT without requiring any trustlines.');
}

testXlmMint().catch(err => {
    console.error("Test script failed:", err);
    process.exit(1);
});
