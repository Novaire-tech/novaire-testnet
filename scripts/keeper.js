require('dotenv').config();
const { rpc, Keypair, Contract, Networks, TransactionBuilder, BASE_FEE } = require('@stellar/stellar-sdk');
const fs = require('fs');
const path = require('path');

const KEEPER_SECRET = process.env.KEEPER_SECRET;
const ROLLOVER_CONTRACT_ID = process.env.ROLLOVER_CONTRACT_ID;
const NETWORK = (process.env.NETWORK || 'testnet').toLowerCase();
const isMainnet = NETWORK === 'mainnet';

const RPC_URL = process.env.RPC_URL || (isMainnet ? 'https://mainnet.sorobanrpc.com' : 'https://soroban-testnet.stellar.org');
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || (isMainnet ? Networks.PUBLIC : Networks.TESTNET);

if (!KEEPER_SECRET || !ROLLOVER_CONTRACT_ID) {
    console.error("Please set KEEPER_SECRET and ROLLOVER_CONTRACT_ID environment variables.");
    process.exit(1);
}

const keeperKeypair = Keypair.fromSecret(KEEPER_SECRET);
const server = new rpc.Server(RPC_URL);
const contract = new Contract(ROLLOVER_CONTRACT_ID);

async function getLedgerSequence() {
    try {
        const latestLedger = await server.getLatestLedger();
        return latestLedger.sequence;
    } catch (e) {
        console.error("Error fetching latest ledger:", e);
        return 0;
    }
}

async function executeRollover(userAddress) {
    try {
        const sourceAccount = await server.getAccount(keeperKeypair.publicKey());
        
        // Construct the execute_rollover transaction
        const tx = new TransactionBuilder(sourceAccount, {
            fee: BASE_FEE,
            networkPassphrase: NETWORK_PASSPHRASE,
        })
        .addOperation(contract.call('execute_rollover', userAddress))
        .setTimeout(30)
        .build();

        // Simulate transaction
        const simulatedTx = await server.simulateTransaction(tx);
        if (simulatedTx.error) {
            console.error(`Simulation failed for user ${userAddress}:`, simulatedTx.error);
            return;
        }

        // Assemble and sign
        const assembledTx = rpc.assembleTransaction(tx, simulatedTx).build();
        assembledTx.sign(keeperKeypair);

        console.log(`Sending execute_rollover for user ${userAddress}...`);
        
        // Send transaction
        const txResponse = await server.sendTransaction(assembledTx);
        if (txResponse.status !== "PENDING") {
            console.error(`Transaction failed: ${txResponse.status}`);
            return;
        }

        // Wait for confirmation
        let txResult = await server.getTransaction(txResponse.hash);
        while (txResult.status === "NOT_FOUND" || txResult.status === "PENDING") {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            txResult = await server.getTransaction(txResponse.hash);
        }

        if (txResult.status === "SUCCESS") {
            console.log(`Successfully rolled over position for user ${userAddress}. Tx: ${txResponse.hash}`);
        } else {
            console.error(`Transaction failed to confirm: ${txResult.status}`);
        }
    } catch (error) {
        console.error(`Failed to execute rollover for ${userAddress}:`, error.message);
    }
}

// In a real production keeper, you would read all registered users from an indexer 
// or from the contract's events. For simplicity in this script, we read from a local file 
// populated by the frontend, falling back to environment variables.
function getRegisteredUsers() {
    try {
        const filePath = path.join(__dirname, '..', 'registered_users.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to read registered_users.json', e);
    }
    return process.env.REGISTERED_USERS ? process.env.REGISTERED_USERS.split(',') : [];
}

async function pollMaturities() {
    console.log(`[${new Date().toISOString()}] Polling maturities...`);
    const currentLedger = await getLedgerSequence();
    
    if (currentLedger === 0) return;
    
    console.log(`Current Ledger: ${currentLedger}`);

    const registeredUsers = getRegisteredUsers();
    if (registeredUsers.length === 0) {
        console.log('No registered users found.');
        return;
    }

    for (const userAddress of registeredUsers) {
        try {
            // Read position from contract
            const positionVal = await server.getContractData(
                ROLLOVER_CONTRACT_ID,
                // Assuming standard ScVal representation for DataKey::Position(user)
                // This would be encoded properly in a real app, here we skip raw encoding for brevity
                // and assume we use an indexer to track maturities
            );
            
            // For the sake of this MVP, we execute the transaction and let the contract 
            // revert if the epoch is not expired.
            // Alternatively, we could simulate first (which we do in executeRollover).
            await executeRollover(userAddress);
        } catch (error) {
            // Data not found or other error
            console.error(`Error processing user ${userAddress}:`, error.message);
        }
    }
}

async function runKeeper() {
    console.log("Starting Novaire Autonomous Rollover Keeper...");
    console.log(`Keeper Public Key: ${keeperKeypair.publicKey()}`);
    console.log(`Rollover Contract ID: ${ROLLOVER_CONTRACT_ID}`);
    
    // Poll every 30 seconds
    setInterval(pollMaturities, 30 * 1000);
    pollMaturities();
}

runKeeper();
