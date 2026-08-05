"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var stellar_sdk_1 = require("@stellar/stellar-sdk");
var fs = require("fs");
var path = require("path");
var child_process_1 = require("child_process");
var utils_1 = require("./utils");
var RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';
var NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || stellar_sdk_1.Networks.TESTNET;
var DEPLOYMENTS_FILE = path.resolve(__dirname, 'deployments.testnet.json');
var XLM_NATIVE_SAC = stellar_sdk_1.Asset.native().contractId(NETWORK_PASSPHRASE);
var deployments = {};
if (fs.existsSync(DEPLOYMENTS_FILE)) {
    deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, 'utf-8'));
}
else {
    throw new Error('deployments.testnet.json not found! Must have initial deployment and WASM hashes.');
}
function runCmd(cmd, retries) {
    if (retries === void 0) { retries = 5; }
    for (var i = 0; i < retries; i++) {
        try {
            console.log("Executing: ".concat(cmd));
            var result = (0, child_process_1.execSync)(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
            return result;
        }
        catch (e) {
            var stderr = e.stderr ? e.stderr.toString() : '';
            console.warn("Command failed: ".concat(e.message, "\nStderr: ").concat(stderr));
            if (i === retries - 1)
                throw e;
            var sleepTime = Math.pow(2, i) * 2000;
            console.log("Sleeping for ".concat(sleepTime, "ms..."));
            (0, child_process_1.execSync)("sleep ".concat(sleepTime / 1000));
        }
    }
    return '';
}
function runCmdNoFail(cmd) {
    try {
        return (0, child_process_1.execSync)(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    }
    catch (e) {
        return e.stderr ? e.stderr.toString() : e.message;
    }
}
function deployXlmEpoch() {
    return __awaiter(this, void 0, void 0, function () {
        function deployWasm(name, wasmHash) {
            console.log("Deploying ".concat(name, " from wasm hash ").concat(wasmHash, "..."));
            var cmd = "stellar contract deploy --wasm-hash ".concat(wasmHash, " --source ").concat(admin.secret(), " --rpc-url ").concat(RPC_URL, " --network-passphrase \"").concat(NETWORK_PASSPHRASE, "\" --fee 1000000");
            console.log("Executing: ".concat(cmd));
            var result = runCmd(cmd);
            console.log("".concat(name, " deployed -> ").concat(result));
            return result;
        }
        var KEYS_FILE, keys, admin, server, contractsToDeploy, _i, contractsToDeploy_1, name_1, wasmId, contractId, ledger, maturity_ledger, grace_period_ledgers, keeper, paramsJson, invokeArgs, out, _a, contractsToDeploy_2, name_2, epochCountOut, epochCount, epochOut, initOut, maturityOut, verifiedMaturity, bootstrapCmd;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    KEYS_FILE = path.resolve(__dirname, 'testnet_keys.json');
                    if (!fs.existsSync(KEYS_FILE)) {
                        throw new Error('testnet_keys.json not found!');
                    }
                    keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
                    admin = stellar_sdk_1.Keypair.fromSecret(keys.admin_secret);
                    console.log("Using Admin: ".concat(admin.publicKey()));
                    server = new stellar_sdk_1.rpc.Server(RPC_URL, { allowHttp: true });
                    // Ensure Factory exists
                    if (!deployments['factory']) {
                        throw new Error('Factory contract not found in deployments!');
                    }
                    console.log("Setting underlying token to Native XLM SAC: ".concat(XLM_NATIVE_SAC));
                    deployments['underlying_token'] = XLM_NATIVE_SAC;
                    (0, utils_1.saveDeployments)(__dirname, deployments);
                    contractsToDeploy = [
                        'sy_wrapper', 'vault', 'tokenizer', 'pt_token', 'yt_token',
                        'marketplace', 'intent_engine', 'rollover'
                    ];
                    console.log('Deploying new instances for XLM epoch...');
                    for (_i = 0, contractsToDeploy_1 = contractsToDeploy; _i < contractsToDeploy_1.length; _i++) {
                        name_1 = contractsToDeploy_1[_i];
                        wasmId = deployments["".concat(name_1, "_wasm")];
                        if (!wasmId) {
                            throw new Error("WASM hash not found for ".concat(name_1));
                        }
                        contractId = deployWasm(name_1, wasmId);
                        deployments[name_1] = contractId;
                        (0, utils_1.saveDeployments)(__dirname, deployments);
                    }
                    console.log("Invoking Factory.deploy_epoch()...");
                    return [4 /*yield*/, server.getLatestLedger()];
                case 1:
                    ledger = _b.sent();
                    maturity_ledger = ledger.sequence + 50000;
                    grace_period_ledgers = 1000;
                    keeper = admin.publicKey();
                    paramsJson = JSON.stringify({
                        maturity_ledger: maturity_ledger,
                        underlying_token: deployments.underlying_token,
                        sy_wrapper: deployments.sy_wrapper,
                        vault: deployments.vault,
                        pt_token: deployments.pt_token,
                        yt_token: deployments.yt_token,
                        tokenizer: deployments.tokenizer,
                        marketplace: deployments.marketplace,
                        intent_engine: deployments.intent_engine,
                        rollover_engine: deployments.rollover,
                        keeper: keeper,
                        grace_period_ledgers: grace_period_ledgers
                    });
                    invokeArgs = [
                        "--id ".concat(deployments.factory),
                        "--source ".concat(admin.secret()),
                        "--rpc-url ".concat(RPC_URL),
                        "--network-passphrase \"".concat(NETWORK_PASSPHRASE, "\""),
                        "--",
                        "deploy_epoch",
                        "--params '".concat(paramsJson, "'")
                    ].join(' ');
                    out = runCmdNoFail("stellar contract invoke ".concat(invokeArgs));
                    if (out.includes("AlreadyInitialized")) {
                        console.log("Epoch already deployed.");
                    }
                    else if (out.includes("error")) {
                        console.error("Epoch deploy failed:\n".concat(out));
                        process.exit(1);
                    }
                    else if (out.trim() !== '') {
                        console.log("Epoch Deployed! Epoch ID: ".concat(out.trim()));
                    }
                    else {
                        console.error("Epoch deploy failed with empty output.");
                        process.exit(1);
                    }
                    console.log("Generating TypeScript Bindings for new XLM Epoch...");
                    for (_a = 0, contractsToDeploy_2 = contractsToDeploy; _a < contractsToDeploy_2.length; _a++) {
                        name_2 = contractsToDeploy_2[_a];
                        runCmd("stellar contract bindings typescript --id ".concat(deployments[name_2], " --network testnet --output-dir ./packages/bindings/").concat(name_2, " --overwrite"));
                    }
                    // Also regenerate factory just in case
                    runCmd("stellar contract bindings typescript --id ".concat(deployments.factory, " --network testnet --output-dir ./packages/bindings/factory --overwrite"));
                    console.log("Verifying Deployment...");
                    epochCountOut = runCmdNoFail("stellar contract invoke --id ".concat(deployments.factory, " --network-passphrase \"").concat(NETWORK_PASSPHRASE, "\" --rpc-url ").concat(RPC_URL, " -- epoch_count"));
                    if (epochCountOut.includes("error") || !epochCountOut) {
                        console.error("Verification failed: Cannot retrieve epoch_count.");
                        process.exit(1);
                    }
                    epochCount = parseInt(epochCountOut.replace(/[^0-9]/g, ''));
                    epochOut = runCmdNoFail("stellar contract invoke --id ".concat(deployments.factory, " --network-passphrase \"").concat(NETWORK_PASSPHRASE, "\" --rpc-url ").concat(RPC_URL, " -- get_epoch --epoch_id ").concat(epochCount));
                    if (epochOut.includes("error") || !epochOut.includes(deployments.tokenizer)) {
                        console.error("Verification failed: Factory newest epoch does not return the newest Tokenizer.");
                        process.exit(1);
                    }
                    initOut = runCmdNoFail("stellar contract invoke --id ".concat(deployments.tokenizer, " --network-passphrase \"").concat(NETWORK_PASSPHRASE, "\" --rpc-url ").concat(RPC_URL, " -- initialized"));
                    if (initOut.includes("error") || !initOut.includes("true")) {
                        console.error("Verification failed: Newest Tokenizer is not initialized.");
                        process.exit(1);
                    }
                    maturityOut = runCmdNoFail("stellar contract invoke --id ".concat(deployments.tokenizer, " --network-passphrase \"").concat(NETWORK_PASSPHRASE, "\" --rpc-url ").concat(RPC_URL, " -- maturity_ledger"));
                    if (maturityOut.includes("error")) {
                        console.error("Verification failed: Cannot retrieve maturity ledger.");
                        process.exit(1);
                    }
                    verifiedMaturity = parseInt(maturityOut.replace(/[^0-9]/g, ''));
                    if (verifiedMaturity <= ledger.sequence) {
                        console.error("Verification failed: Tokenizer maturity is in the past.");
                        process.exit(1);
                    }
                    console.log("Verification Succeeded! Epoch ".concat(epochCount, " is active and initialized."));
                    console.log("XLM Epoch Deployment and Wiring Complete!");
                    console.log("\nStarting Automatic Protocol Bootstrap...");
                    try {
                        bootstrapCmd = "npx ts-node scripts/bootstrap_liquidity.ts";
                        console.log("Executing: ".concat(bootstrapCmd));
                        // Run from the project root instead of scripts folder, so we use ../ or change cwd
                        // Since we are in scripts, ts-node bootstrap_liquidity.ts should work
                        (0, child_process_1.execSync)("npx ts-node ".concat(path.resolve(__dirname, 'bootstrap_liquidity.ts')), { stdio: 'inherit' });
                        console.log("Bootstrap completed successfully!");
                    }
                    catch (e) {
                        console.error("Bootstrap failed during deployment:", e);
                        throw e;
                    }
                    return [2 /*return*/];
            }
        });
    });
}
deployXlmEpoch().catch(function (err) {
    console.error("XLM Deployment script failed:", err);
    process.exit(1);
});
