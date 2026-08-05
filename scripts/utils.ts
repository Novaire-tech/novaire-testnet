import * as fs from 'fs';
import * as path from 'path';

export function saveDeployments(dirname: string, deployments: Record<string, string>) {
    const data = JSON.stringify(deployments, null, 2);
    const network = (process.env.NETWORK || 'testnet').toLowerCase();
    
    // Save to scripts/
    const scriptsDeploymentsFile = path.resolve(dirname, `deployments.${network}.json`);
    fs.writeFileSync(scriptsDeploymentsFile, data);

    // Save to src/config/
    const frontendDeploymentsFile = path.resolve(dirname, `../src/config/deployments.${network}.json`);
    if (fs.existsSync(path.dirname(frontendDeploymentsFile))) {
        fs.writeFileSync(frontendDeploymentsFile, data);
    }
}
