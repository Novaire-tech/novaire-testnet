const { rpc, xdr, scValToNative, Address } = require('@stellar/stellar-sdk');
const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);

async function run() {
    try {
        const tokenizerId = 'CB362JYZEJNVMIOE3GX6T3GMOODQ35CWIYQ7VT76YR4IIV2RUT3OMVTC';
        const contract = new Address(tokenizerId);
        
        const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
            contract: contract.toScAddress(),
            key: xdr.ScVal.scvLedgerKeyContractInstance(),
            durability: xdr.ContractDataDurability.persistent()
        }));

        const res = await server.getLedgerEntries(key);
        console.log(JSON.stringify(res, null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
