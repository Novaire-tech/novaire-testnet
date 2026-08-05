"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var stellar_sdk_1 = require("@stellar/stellar-sdk");
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
var child_process_1 = require("child_process");
var axios_1 = __importDefault(require("axios"));
var RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';
var NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || stellar_sdk_1.Networks.TESTNET;
var DEPLOYMENTS_FILE = path.resolve(__dirname, 'deployments.testnet.json');
var TESTNET_KEYS = path.resolve(__dirname, 'testnet_keys.json');
function fundAccount(publicKey) {
    return __awaiter(this, void 0, void 0, function () {
        var e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("Funding wallet ".concat(publicKey, " via Friendbot..."));
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
function invoke(contractId, fn, args, secret) {
    var _a;
    try {
        var cmd = "stellar contract invoke --id ".concat(contractId, " --source ").concat(secret, " --rpc-url ").concat(RPC_URL, " --network-passphrase \"").concat(NETWORK_PASSPHRASE, "\" -- ").concat(fn, " ").concat(args);
        return (0, child_process_1.execSync)(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    }
    catch (e) {
        console.error("Failed to invoke ".concat(fn, " on ").concat(contractId, ":"), ((_a = e === null || e === void 0 ? void 0 : e.stderr) === null || _a === void 0 ? void 0 : _a.toString()) || e);
        throw e;
    }
}
function parseSorobanI128(val) {
    try {
        // Handle vector/array outputs like `["100", "200"]`
        if (val.startsWith('[')) {
            var arr = JSON.parse(val);
            if (Array.isArray(arr) && arr.length > 0) {
                return BigInt(arr[0].toString().replace(/['"]/g, ''));
            }
        }
        // Handle raw Ok("123") or just "123"
        var cleanVal = val.replace(/^Ok\((.+)\)$/, '$1').replace(/['"]/g, '');
        return BigInt(cleanVal);
    }
    catch (e) {
        console.error("Failed to parse BigInt from: ".concat(val));
        throw e;
    }
}
function parseReserves(val) {
    try {
        var cleanVal = val.replace(/^Ok\((.+)\)$/, '$1');
        var arr = JSON.parse(cleanVal);
        return arr.map(function (x) { return BigInt(x.replace(/['"]/g, '')); });
    }
    catch (e) {
        console.error("Failed to parse reserves from: ".concat(val));
        return [BigInt(0), BigInt(0), BigInt(0)];
    }
}
function run() {
    return __awaiter(this, void 0, void 0, function () {
        var d, keys, adminKp, adminAddress, initXlmRaw, initXlm, reservesRaw, _a, ptRes, undRes, ytRes, DEPOSIT_AMOUNT, vaultReturnRaw, actualSyShares, ptBalanceRaw, actualPtBalance, ytBalanceRaw, actualYtBalance, exchangeRateRaw, exchangeRate, ptToAdd, faceValueUnderlying, discountedUnderlyingToAdd, postReservesRaw, _b, postPtRes, postUndRes, postYtRes, WARMUP_AMOUNT, twapRaw, twapValue, testWallet, rpcServer, latestLedger, currentMaturityLedger, retailDeposit, SWAP_AMOUNT, SELL_AMOUNT, verifyTrade;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    console.log('--- Step 1: Loading Artifacts ---');
                    if (!fs.existsSync(DEPLOYMENTS_FILE))
                        throw new Error('Deployments missing.');
                    d = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, 'utf-8'));
                    console.log("Contracts Loaded:");
                    console.log("Underlying: ".concat(d.underlying_token));
                    console.log("SY Wrapper: ".concat(d.sy_wrapper));
                    console.log("Vault: ".concat(d.vault));
                    console.log("Tokenizer: ".concat(d.tokenizer));
                    console.log("Marketplace: ".concat(d.marketplace));
                    console.log("Intent Engine: ".concat(d.intent_engine));
                    console.log("PT Token: ".concat(d.pt_token));
                    console.log("YT Token: ".concat(d.yt_token));
                    console.log('\n--- Step 2: Treasury Setup ---');
                    if (!fs.existsSync(TESTNET_KEYS))
                        throw new Error('testnet_keys.json missing');
                    keys = JSON.parse(fs.readFileSync(TESTNET_KEYS, 'utf-8'));
                    adminKp = stellar_sdk_1.Keypair.fromSecret(keys.admin_secret);
                    adminAddress = adminKp.publicKey();
                    console.log("Treasury Wallet: ".concat(adminAddress));
                    return [4 /*yield*/, fundAccount(adminAddress)];
                case 1:
                    _c.sent();
                    initXlmRaw = invoke(d.underlying_token, 'balance', "--id ".concat(adminAddress), adminKp.secret());
                    initXlm = parseSorobanI128(initXlmRaw);
                    console.log("Treasury Initial XLM Balance (stroops): ".concat(initXlm.toString()));
                    if (initXlm < BigInt(1000000000)) {
                        throw new Error('Treasury lacks sufficient XLM to bootstrap (need at least 100 XLM).');
                    }
                    console.log('\n--- Step 3: Checking Existing Liquidity (Idempotency) ---');
                    reservesRaw = invoke(d.marketplace, 'get_reserves', '', adminKp.secret());
                    _a = parseReserves(reservesRaw), ptRes = _a[0], undRes = _a[1], ytRes = _a[2];
                    console.log("Marketplace Reserves: PT=".concat(ptRes, ", Underlying=").concat(undRes, ", YT=").concat(ytRes));
                    if (ptRes > BigInt(0) && undRes > BigInt(0)) {
                        console.log('✅ Marketplace already bootstrapped. Exiting gracefully.');
                        return [2 /*return*/];
                    }
                    console.log('\n--- Step 4: Vault Deposit (Dynamic) ---');
                    DEPOSIT_AMOUNT = "1000000000";
                    console.log("Depositing ".concat(DEPOSIT_AMOUNT, " underlying into Vault..."));
                    vaultReturnRaw = invoke(d.vault, 'deposit', "--depositor ".concat(adminAddress, " --amount ").concat(DEPOSIT_AMOUNT), adminKp.secret());
                    actualSyShares = parseSorobanI128(vaultReturnRaw);
                    console.log("ACTUAL SY Shares Received: ".concat(actualSyShares.toString()));
                    if (actualSyShares <= BigInt(0)) {
                        throw new Error("❌ Bootstrap Failed: Received 0 SY shares from Vault deposit.");
                    }
                    console.log('\n--- Step 5: Mint PT/YT (Dynamic) ---');
                    console.log("Minting PT/YT using ".concat(actualSyShares.toString(), " SY shares..."));
                    invoke(d.tokenizer, 'mint_pt_yt', "--user ".concat(adminAddress, " --sy_shares ").concat(actualSyShares.toString()), adminKp.secret());
                    ptBalanceRaw = invoke(d.pt_token, 'balance', "--id ".concat(adminAddress), adminKp.secret());
                    actualPtBalance = parseSorobanI128(ptBalanceRaw);
                    console.log("ACTUAL PT Balance: ".concat(actualPtBalance.toString()));
                    ytBalanceRaw = invoke(d.yt_token, 'balance', "--id ".concat(adminAddress), adminKp.secret());
                    actualYtBalance = parseSorobanI128(ytBalanceRaw);
                    console.log("ACTUAL YT Balance: ".concat(actualYtBalance.toString()));
                    if (actualPtBalance <= BigInt(0) || actualYtBalance <= BigInt(0)) {
                        throw new Error("❌ Bootstrap Failed: Minted 0 PT or YT.");
                    }
                    console.log('\n--- Step 6: Add Liquidity (Dynamic) ---');
                    exchangeRateRaw = invoke(d.sy_wrapper, 'get_exchange_rate', '', adminKp.secret());
                    exchangeRate = parseSorobanI128(exchangeRateRaw);
                    console.log("Live SY Exchange Rate: ".concat(exchangeRate.toString()));
                    ptToAdd = (actualPtBalance * BigInt(95)) / BigInt(100);
                    faceValueUnderlying = (ptToAdd * exchangeRate) / BigInt(1000000000);
                    discountedUnderlyingToAdd = (faceValueUnderlying * BigInt(95)) / BigInt(100);
                    console.log("Adding Liquidity: PT=".concat(ptToAdd.toString(), ", Underlying=").concat(discountedUnderlyingToAdd.toString(), "..."));
                    invoke(d.marketplace, 'add_liquidity', "--provider ".concat(adminAddress, " --pt_amount ").concat(ptToAdd.toString(), " --underlying_amount ").concat(discountedUnderlyingToAdd.toString()), adminKp.secret());
                    postReservesRaw = invoke(d.marketplace, 'get_reserves', '', adminKp.secret());
                    _b = parseReserves(postReservesRaw), postPtRes = _b[0], postUndRes = _b[1], postYtRes = _b[2];
                    console.log("\u2705 Liquidity Verified: PT=".concat(postPtRes, ", Underlying=").concat(postUndRes));
                    if (postPtRes <= BigInt(0) || postUndRes <= BigInt(0)) {
                        throw new Error("❌ Bootstrap Failed: Marketplace reserves are still zero after add_liquidity.");
                    }
                    console.log('\n--- Step 7: TWAP Initialization ---');
                    WARMUP_AMOUNT = "1000000";
                    console.log("Warm-up swap: swap_underlying_for_pt(".concat(WARMUP_AMOUNT, " stroops)..."));
                    invoke(d.marketplace, 'swap_underlying_for_pt', "--buyer ".concat(adminAddress, " --underlying_in ").concat(WARMUP_AMOUNT, " --min_pt_out 1"), adminKp.secret());
                    twapRaw = invoke(d.marketplace, 'get_twap_rate', '', adminKp.secret());
                    twapValue = parseSorobanI128(twapRaw);
                    console.log("\u2705 TWAP Verified: ".concat(twapValue.toString()));
                    if (twapValue <= BigInt(0)) {
                        throw new Error("❌ Bootstrap Failed: TWAP is still 0 after warm-up swap.");
                    }
                    console.log('\n--- Step 8: Trade Verification Loop ---');
                    testWallet = stellar_sdk_1.Keypair.random();
                    console.log("Retail Test Wallet: ".concat(testWallet.publicKey()));
                    return [4 /*yield*/, fundAccount(testWallet.publicKey())];
                case 2:
                    _c.sent();
                    // Wait for Friendbot
                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 3000); })];
                case 3:
                    // Wait for Friendbot
                    _c.sent();
                    rpcServer = new stellar_sdk_1.rpc.Server(RPC_URL, { allowHttp: true });
                    return [4 /*yield*/, rpcServer.getLatestLedger()];
                case 4:
                    latestLedger = _c.sent();
                    currentMaturityLedger = latestLedger.sequence + 50000;
                    console.log('Seeding retail wallet via Intent Engine...');
                    retailDeposit = "10000000";
                    invoke(d.intent_engine, 'execute_fixed_yield_intent', "--user ".concat(testWallet.publicKey(), " --usdc_amount ").concat(retailDeposit, " --min_implied_rate 0 --_maturity_ledger ").concat(currentMaturityLedger, " --yt_sale_percentage 100"), testWallet.secret());
                    invoke(d.intent_engine, 'execute_fixed_yield_intent', "--user ".concat(testWallet.publicKey(), " --usdc_amount ").concat(retailDeposit, " --min_implied_rate 0 --_maturity_ledger ").concat(currentMaturityLedger, " --yt_sale_percentage 0"), testWallet.secret());
                    SWAP_AMOUNT = "100000";
                    SELL_AMOUNT = "50000";
                    verifyTrade = function (name, fn, args) {
                        console.log("\nVerifying: ".concat(name));
                        var resBefore = parseReserves(invoke(d.marketplace, 'get_reserves', '', testWallet.secret()));
                        console.log("Reserves Before: PT=".concat(resBefore[0], ", Underlying=").concat(resBefore[1]));
                        var txLog = invoke(d.marketplace, fn, args, testWallet.secret());
                        console.log("\u2705 Success");
                        var resAfter = parseReserves(invoke(d.marketplace, 'get_reserves', '', testWallet.secret()));
                        console.log("Reserves After:  PT=".concat(resAfter[0], ", Underlying=").concat(resAfter[1]));
                        var ptPrice = parseSorobanI128(invoke(d.marketplace, 'get_pt_price', '', testWallet.secret()));
                        var ytPrice = BigInt(1000000000) - ptPrice;
                        console.log("Spot Prices: PT = ".concat(ptPrice.toString(), " / 1e9, YT = ").concat(ytPrice.toString(), " / 1e9"));
                    };
                    try {
                        verifyTrade('Buy PT', 'swap_underlying_for_pt', "--buyer ".concat(testWallet.publicKey(), " --underlying_in ").concat(SWAP_AMOUNT, " --min_pt_out 1"));
                        verifyTrade('Sell PT', 'swap_pt_for_underlying', "--seller ".concat(testWallet.publicKey(), " --pt_in ").concat(SELL_AMOUNT, " --min_underlying_out 1"));
                        verifyTrade('Buy YT', 'swap_underlying_for_yt', "--buyer ".concat(testWallet.publicKey(), " --underlying_in ").concat(SWAP_AMOUNT, " --min_yt_out 1"));
                        verifyTrade('Sell YT', 'swap_yt_for_underlying', "--seller ".concat(testWallet.publicKey(), " --yt_in ").concat(SELL_AMOUNT, " --min_underlying_out 1"));
                    }
                    catch (e) {
                        throw new Error("\u274C Bootstrap Failed during Trade Verification Loop!");
                    }
                    console.log('\n✅ Protocol Verification Passed. All assertions successful!');
                    return [2 /*return*/];
            }
        });
    });
}
run().catch(function (err) {
    console.error("Script failed:", err);
    process.exit(1);
});
