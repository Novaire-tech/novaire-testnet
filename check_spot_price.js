const { execSync } = require('child_process');
const fs = require('fs');

const d = JSON.parse(fs.readFileSync('./scripts/deployments.testnet.json', 'utf-8'));
const market = d.marketplace;
console.log(execSync(`stellar contract invoke --id ${market} --source null --rpc-url https://soroban-testnet.stellar.org --network-passphrase "Test SDF Network ; September 2015" -- get_pt_price`).toString());
