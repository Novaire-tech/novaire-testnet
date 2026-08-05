import { rpc } from '@stellar/stellar-sdk';
import { Client as IntentEngineClient } from '../packages/bindings/intent_engine/src/index';
import { Client as PtClient } from '../packages/bindings/pt_token/src/index';
import { Client as YtClient } from '../packages/bindings/yt_token/src/index';
import { Client as TokenizerClient } from '../packages/bindings/tokenizer/src/index';
import { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } from '../src/config/contracts';
import { TransactionBuilder, Keypair } from '@stellar/stellar-sdk';

async function main() {
    console.log("Starting Mint Audit...");
    
    // Setup Admin Keypair
    const user = Keypair.fromSecret('SAVGFMYOMGLY2VSKO3H63GAVMENVELZZVKEDLRT6KKRLVCBROB42KUSZ');
    
    const clientOptions = {
        rpcUrl: RPC_URL,
        networkPassphrase: NETWORK_PASSPHRASE,
        publicKey: user.publicKey(),
    };
    
    const ptClient = new PtClient({ ...clientOptions, contractId: CONTRACTS.PT_TOKEN });
    const ytClient = new YtClient({ ...clientOptions, contractId: CONTRACTS.YT_TOKEN });
    const intentEngineClient = new IntentEngineClient({ ...clientOptions, contractId: CONTRACTS.INTENT_ENGINE });
    
    console.log(`User Address: ${user.publicKey()}`);
    
    // 1. Get Initial Balances
    let ptBefore, ytBefore;
    try { ptBefore = await ptClient.balance({ id: user.publicKey() }); } catch(e){}
    try { ytBefore = await ytClient.balance({ id: user.publicKey() }); } catch(e){}
    console.log(`PT Balance Before: ${ptBefore?.result || 0}`);
    console.log(`YT Balance Before: ${ytBefore?.result || 0}`);
    
    // 2. Execute Mint (Keep All YT) -> yt_sale_percentage = 0
    console.log("Minting Keep All YT via Intent Engine...");
    
    const amount = 100000000n; // 10 XLM
    
    const server = new rpc.Server(RPC_URL, { allowHttp: true });
    const latestLedger = await server.getLatestLedger();
    const maturityLedger = latestLedger.sequence + 50000;
    
    try {
        const tx = await intentEngineClient.execute_fixed_yield_intent({
            user: user.publicKey(),
            usdc_amount: amount,
            min_implied_rate: 0n,
            _maturity_ledger: maturityLedger,
            yt_sale_percentage: 0
        });
        
        const signTransaction = async (xdrTx: string) => {
            const tx = TransactionBuilder.fromXDR(xdrTx, NETWORK_PASSPHRASE);
            // tx.sign throws if it doesn't have a networkPassphrase passed to fromXDR correctly, but fromXDR requires passphrase.
            // Wait, TransactionBuilder.fromXDR returns Transaction | FeeBumpTransaction.
            // We need to cast it.
            if ("sign" in tx) {
                tx.sign(user);
            }
            return { signedTxXdr: tx.toXDR() };
        };
        
        const result = await tx.signAndSend({ signTransaction });
        console.log(`Mint TX Result:`, result);
        
    } catch (e: any) {
        console.error("Mint failed!", e);
        if (e.response && e.response.data) {
            console.error(e.response.data);
        }
    }
    
    // 3. Get Final Balances
    let ptAfter, ytAfter;
    try { ptAfter = await ptClient.balance({ id: user.publicKey() }); } catch(e){}
    try { ytAfter = await ytClient.balance({ id: user.publicKey() }); } catch(e){}
    console.log(`PT Balance After: ${ptAfter?.result || 0}`);
    console.log(`YT Balance After: ${ytAfter?.result || 0}`);
}

main().catch(console.error);
