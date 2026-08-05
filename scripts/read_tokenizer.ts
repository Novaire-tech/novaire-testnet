import { Contract, rpc, Networks } from '@stellar/stellar-sdk';
import fs from 'fs';
import path from 'path';

const RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const tokenizerId = 'CB362JYZEJNVMIOE3GX6T3GMOODQ35CWIYQ7VT76YR4IIV2RUT3OMVTC';
const tokenizer = new Contract(tokenizerId);

async function readTokenizerState() {
    try {
        const latestLedger = await server.getLatestLedger();
        console.log('Current Ledger:', latestLedger.sequence);
        
        const builder = await server.prepareTransaction({
            account: {
                accountId: () => 'GBULVWCJSEZOBASS4PM2KLIMTDOLIY2MTDNA6M3YZBRNWPICEGI3754U',
                sequenceNumber: () => '1',
                incrementSequenceNumber: () => {}
            } as any,
            networkPassphrase: Networks.TESTNET,
            fee: "100",
            timebounds: { minTime: 0, maxTime: 0 }
        } as any);

        async function simulate(method: string, args: any[] = []) {
            try {
                const tx = builder.addOperation(tokenizer.call(method, ...args)).build();
                const sim = await server.simulateTransaction(tx);
                if (rpc.Api.isSimulationSuccess(sim)) {
                    return sim.result?.retval;
                }
                return `Error: ${JSON.stringify(sim)}`;
            } catch (e: any) {
                return `Exception: ${e.message}`;
            }
        }

        console.log("maturity_ledger:", await simulate("get_maturity_ledger"));
        console.log("epoch_state:", await simulate("get_epoch_state"));
        console.log("settlement_exchange_rate:", await simulate("get_settlement_exchange_rate"));
        console.log("initialized flag:", await simulate("get_is_initialized")); // not sure of exact function name
    } catch(e) {
        console.error(e);
    }
}
readTokenizerState();
