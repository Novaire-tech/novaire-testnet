const { Contract, rpc, Networks, Keypair, Address, xdr, scValToNative } = require('@stellar/stellar-sdk');
const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL, {allowHttp: true});

async function run() {
    const factoryId = 'CCCGZFAE7TEMGKC7P5PSG73W3BY5475WETXNPD33K42YHKVL6RZ3YI6R';
    const contract = new Address(factoryId);
        
    const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
        contract: contract.toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent()
    }));

    const res = await server.getLedgerEntries(key);
    const entry = res.entries[0];
    const data = xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64').contractData();
    const storage = data.val().instance().storage();
    for (const item of storage) {
        if (item.key().switch().name === 'scvVec' && item.key().vec()[0].sym().toString() === 'Admin') {
            console.log("Factory Admin:", Address.fromScAddress(item.val().address()).toString());
        }
    }
}
run();
