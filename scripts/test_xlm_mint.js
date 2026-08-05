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
var axios_1 = require("axios");
var index_1 = require("../packages/bindings/intent_engine/src/index");
var RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';
var NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || stellar_sdk_1.Networks.TESTNET;
function fundAccount(publicKey) {
    return __awaiter(this, void 0, void 0, function () {
        var e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("Funding test wallet ".concat(publicKey, " via Friendbot..."));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, axios_1.default.get("https://friendbot.stellar.org?addr=".concat(publicKey))];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _a.sent();
                    if (e_1.response && e_1.response.status === 400) {
                        console.log("Account already funded.");
                    }
                    else {
                        console.warn("Friendbot failed, assuming account has funds.");
                    }
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function testXlmMint() {
    return __awaiter(this, void 0, void 0, function () {
        var DEPLOYMENTS_FILE, deployments, server, testWallet, client, amountToMint, ledger, currentMaturityLedger, txBuilder, _a, result, error;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log('--- Testing XLM Mint Flow ---');
                    DEPLOYMENTS_FILE = path.resolve(__dirname, 'deployments.testnet.json');
                    deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, 'utf-8'));
                    server = new stellar_sdk_1.rpc.Server(RPC_URL, { allowHttp: true });
                    testWallet = stellar_sdk_1.Keypair.random();
                    console.log("Test Wallet: ".concat(testWallet.publicKey()));
                    console.log("Secret Key: ".concat(testWallet.secret()));
                    return [4 /*yield*/, fundAccount(testWallet.publicKey())];
                case 1:
                    _b.sent();
                    client = new index_1.Client({
                        networkPassphrase: NETWORK_PASSPHRASE,
                        rpcUrl: RPC_URL,
                        contractId: deployments.intent_engine
                    });
                    amountToMint = 10000000;
                    return [4 /*yield*/, server.getLatestLedger()];
                case 2:
                    ledger = _b.sent();
                    currentMaturityLedger = ledger.sequence + 50000;
                    console.log('Building intent_engine execute_fixed_yield_intent transaction...');
                    return [4 /*yield*/, client.execute_fixed_yield_intent({
                            user: testWallet.publicKey(),
                            usdc_amount: BigInt(amountToMint), // The parameter is named usdc_amount in the contract, but it represents the underlying token (XLM)
                            min_implied_rate: BigInt(0), // Accept any rate for testing
                            _maturity_ledger: currentMaturityLedger,
                            yt_sale_percentage: 100
                        })];
                case 3:
                    txBuilder = _b.sent();
                    // The bindings return a generic AssembledTransaction. We need to sign and send.
                    console.log('Simulating transaction...');
                    return [4 /*yield*/, txBuilder.signAndSend({
                            signTransaction: function (xdr) { return __awaiter(_this, void 0, void 0, function () {
                                var tx;
                                return __generator(this, function (_a) {
                                    tx = stellar_sdk_1.TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
                                    tx.sign(testWallet);
                                    return [2 /*return*/, tx.toXDR()];
                                });
                            }); }
                        })];
                case 4:
                    _a = _b.sent(), result = _a.result, error = _a.error;
                    if (error) {
                        console.error('Transaction Failed:', error);
                        throw new Error('Mint transaction failed!');
                    }
                    else {
                        console.log('Transaction Success!');
                        console.log('Mint Intent Record:', result);
                    }
                    console.log('✅ Native XLM successfully minted PT and YT without requiring any trustlines.');
                    return [2 /*return*/];
            }
        });
    });
}
testXlmMint().catch(function (err) {
    console.error("Test script failed:", err);
    process.exit(1);
});
