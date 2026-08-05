import sys
import re

with open('scripts/deploy_xlm_epoch.ts', 'r') as f:
    content = f.read()

replacement = """
    console.log("Generating TypeScript Bindings for new XLM Epoch...");
    for (const name of contractsToDeploy) {
        runCmd(`stellar contract bindings typescript --id ${deployments[name]} --network testnet --output-dir ../packages/bindings/${name} --overwrite`);
    }
    
    // Also regenerate factory just in case
    runCmd(`stellar contract bindings typescript --id ${deployments.factory} --network testnet --output-dir ../packages/bindings/factory --overwrite`);

    console.log("Verifying Deployment...");
    const epochCountOut = runCmdNoFail(`stellar contract invoke --id ${deployments.factory} --network-passphrase "${NETWORK_PASSPHRASE}" --rpc-url ${RPC_URL} -- epoch_count`);
    if (epochCountOut.includes("error") || !epochCountOut) {
        console.error("Verification failed: Cannot retrieve epoch_count.");
        process.exit(1);
    }
    const epochCount = parseInt(epochCountOut.replace(/[^0-9]/g, ''));
    
    const epochOut = runCmdNoFail(`stellar contract invoke --id ${deployments.factory} --network-passphrase "${NETWORK_PASSPHRASE}" --rpc-url ${RPC_URL} -- get_epoch --epoch_id ${epochCount}`);
    if (epochOut.includes("error") || !epochOut.includes(deployments.tokenizer)) {
        console.error("Verification failed: Factory newest epoch does not return the newest Tokenizer.");
        process.exit(1);
    }

    const initOut = runCmdNoFail(`stellar contract invoke --id ${deployments.tokenizer} --network-passphrase "${NETWORK_PASSPHRASE}" --rpc-url ${RPC_URL} -- initialized`);
    if (initOut.includes("error") || !initOut.includes("true")) {
        console.error("Verification failed: Newest Tokenizer is not initialized.");
        process.exit(1);
    }

    const maturityOut = runCmdNoFail(`stellar contract invoke --id ${deployments.tokenizer} --network-passphrase "${NETWORK_PASSPHRASE}" --rpc-url ${RPC_URL} -- maturity_ledger`);
    if (maturityOut.includes("error")) {
        console.error("Verification failed: Cannot retrieve maturity ledger.");
        process.exit(1);
    }
    const verifiedMaturity = parseInt(maturityOut.replace(/[^0-9]/g, ''));
    if (verifiedMaturity <= ledger.sequence) {
        console.error("Verification failed: Tokenizer maturity is in the past.");
        process.exit(1);
    }

    console.log(`Verification Succeeded! Epoch ${epochCount} is active and initialized.`);
    console.log("XLM Epoch Deployment and Wiring Complete!");
"""

content = re.sub(
    r'    console\.log\("Generating TypeScript Bindings for new XLM Epoch..."\);\n[\s\S]*?console\.log\("XLM Epoch Deployment and Wiring Complete!"\);',
    replacement,
    content
)

with open('scripts/deploy_xlm_epoch.ts', 'w') as f:
    f.write(content)
