"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveDeployments = saveDeployments;
var fs = require("fs");
var path = require("path");
function saveDeployments(dirname, deployments) {
    var data = JSON.stringify(deployments, null, 2);
    // Save to scripts/
    var scriptsDeploymentsFile = path.resolve(dirname, 'deployments.testnet.json');
    fs.writeFileSync(scriptsDeploymentsFile, data);
    // Save to src/config/
    var frontendDeploymentsFile = path.resolve(dirname, '../src/config/deployments.testnet.json');
    if (fs.existsSync(path.dirname(frontendDeploymentsFile))) {
        fs.writeFileSync(frontendDeploymentsFile, data);
    }
}
