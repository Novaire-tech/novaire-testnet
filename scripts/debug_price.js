"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var index_1 = require("../packages/bindings/marketplace/src/index");
var contracts_1 = require("../src/config/contracts");
function unwrapResult(rawResult) {
    if (rawResult !== undefined && typeof rawResult === 'object' && rawResult !== null) {
        if (typeof rawResult.unwrap === 'function')
            return rawResult.unwrap();
        if ('ok' in rawResult)
            return rawResult.ok;
        if ('value' in rawResult)
            return rawResult.value;
    }
    return rawResult;
}
function run() {
    return __awaiter(this, void 0, void 0, function () {
        var clientOptions, marketClient, reservesTx, rawReserves, ptReserve, underlyingReserve, ytReserve, derivedPtPrice, ptPriceTx, rawPtPrice, ptSpotPrice;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("=== Auditing PT Pricing Pipeline ===");
                    clientOptions = {
                        rpcUrl: contracts_1.RPC_URL,
                        networkPassphrase: contracts_1.NETWORK_PASSPHRASE,
                    };
                    marketClient = new index_1.Client(__assign(__assign({}, clientOptions), { contractId: contracts_1.CONTRACTS.MARKETPLACE }));
                    console.log("\n1. Fetching reserves from Marketplace Contract...");
                    return [4 /*yield*/, marketClient.get_reserves()];
                case 1:
                    reservesTx = _a.sent();
                    rawReserves = unwrapResult(reservesTx.result);
                    console.log("Raw get_reserves() output:", rawReserves);
                    ptReserve = 0;
                    underlyingReserve = 0;
                    ytReserve = 0;
                    if (Array.isArray(rawReserves) && rawReserves.length >= 3) {
                        ptReserve = Number(rawReserves[0]);
                        underlyingReserve = Number(rawReserves[1]);
                        ytReserve = Number(rawReserves[2]);
                    }
                    console.log("\n2. Interpreting Reserves (assumed 1e7 decimal scaling on Stellar):");
                    console.log("PT Reserve: ".concat(ptReserve, " raw => ").concat(ptReserve / 1e7, " scaled"));
                    console.log("Underlying Reserve: ".concat(underlyingReserve, " raw => ").concat(underlyingReserve / 1e7, " scaled"));
                    console.log("YT Reserve: ".concat(ytReserve, " raw => ").concat(ytReserve / 1e7, " scaled"));
                    console.log("\n3. Intermediate AMM calculations:");
                    derivedPtPrice = ptReserve > 0 ? underlyingReserve / ptReserve : 0;
                    console.log("Derived PT Price (Underlying / PT reserve ratio): ".concat(derivedPtPrice));
                    console.log("\n4. Fetching PT Spot Price directly from Contract:");
                    return [4 /*yield*/, marketClient.get_pt_price()];
                case 2:
                    ptPriceTx = _a.sent();
                    rawPtPrice = Number(unwrapResult(ptPriceTx.result));
                    console.log("Raw get_pt_price() output: ".concat(rawPtPrice));
                    ptSpotPrice = rawPtPrice / 1e9;
                    console.log("Decimal scaled (1e9): ".concat(ptSpotPrice));
                    return [2 /*return*/];
            }
        });
    });
}
run().catch(console.error);
