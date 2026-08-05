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
var contracts_1 = require("./src/config/contracts");
var index_1 = require("../packages/bindings/marketplace/src/index");
var STROOP_SCALE = 10000000;
function unwrapResult(result) {
    if (result === undefined || result === null)
        return null;
    if (typeof result === 'bigint' || typeof result === 'number')
        return BigInt(result);
    if (typeof result === 'object') {
        if (typeof result.unwrap === 'function') {
            try {
                var unwrapped = result.unwrap();
                return typeof unwrapped === 'bigint' ? unwrapped : BigInt(unwrapped);
            }
            catch (e) {
                return null;
            }
        }
        if (result.ok !== undefined)
            return BigInt(result.ok);
    }
    return null;
}
function debug() {
    return __awaiter(this, void 0, void 0, function () {
        var client, ptPriceTx, ptPrice, twapTx, twap, reservesTx, ptRes, ytRes, undRes, rawReserves, unwrappedRes, amountInStroops, tx, outStroops, simErr_1, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("CONTRACTS.MARKETPLACE =", contracts_1.CONTRACTS.MARKETPLACE);
                    client = new index_1.Client({
                        rpcUrl: contracts_1.RPC_URL,
                        networkPassphrase: contracts_1.NETWORK_PASSPHRASE,
                        contractId: contracts_1.CONTRACTS.MARKETPLACE,
                        publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
                    });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 9, , 10]);
                    return [4 /*yield*/, client.get_pt_price()];
                case 2:
                    ptPriceTx = _a.sent();
                    ptPrice = Number(unwrapResult(ptPriceTx.result) || 0n) / STROOP_SCALE;
                    console.log("PT Price:", ptPrice);
                    return [4 /*yield*/, client.get_twap_rate()];
                case 3:
                    twapTx = _a.sent();
                    twap = Number(unwrapResult(twapTx.result) || 0n) / STROOP_SCALE;
                    console.log("TWAP:", twap);
                    return [4 /*yield*/, client.get_reserves()];
                case 4:
                    reservesTx = _a.sent();
                    ptRes = 0, ytRes = 0, undRes = 0;
                    rawReserves = reservesTx.result;
                    if (rawReserves) {
                        unwrappedRes = rawReserves;
                        if (typeof rawReserves.unwrap === 'function') {
                            try {
                                unwrappedRes = rawReserves.unwrap();
                            }
                            catch (e) { }
                        }
                        if (Array.isArray(unwrappedRes) && unwrappedRes.length === 3) {
                            ptRes = Number(unwrappedRes[0]) / STROOP_SCALE;
                            ytRes = Number(unwrappedRes[1]) / STROOP_SCALE;
                            undRes = Number(unwrappedRes[2]) / STROOP_SCALE;
                        }
                    }
                    console.log("Reserves -> PT: ".concat(ptRes, ", YT: ").concat(ytRes, ", Underlying: ").concat(undRes));
                    amountInStroops = BigInt(10 * STROOP_SCALE);
                    console.log("Simulating swap_underlying_for_pt with 10 XLM");
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, client.swap_underlying_for_pt({
                            buyer: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
                            underlying_in: amountInStroops,
                            min_pt_out: 0n
                        })];
                case 6:
                    tx = _a.sent();
                    outStroops = unwrapResult(tx.result);
                    console.log("Quote outStroops:", outStroops);
                    return [3 /*break*/, 8];
                case 7:
                    simErr_1 = _a.sent();
                    console.error("Simulation failed:", simErr_1);
                    if (simErr_1.response && simErr_1.response.data) {
                        console.error("Simulation data:", JSON.stringify(simErr_1.response.data, null, 2));
                    }
                    return [3 /*break*/, 8];
                case 8: return [3 /*break*/, 10];
                case 9:
                    e_1 = _a.sent();
                    console.error(e_1);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
debug();
