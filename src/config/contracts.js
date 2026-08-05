"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NETWORK_PASSPHRASE = exports.RPC_URL = exports.CONTRACTS = exports.NETWORK = void 0;
var deployments_testnet_json_1 = __importDefault(require("./deployments.testnet.json"));
var deployments_mainnet_json_1 = __importDefault(require("./deployments.mainnet.json"));
exports.NETWORK = (process.env.NEXT_PUBLIC_NETWORK || 'TESTNET').toUpperCase();
var isMainnet = exports.NETWORK === 'MAINNET';
var deployments = isMainnet ? deployments_mainnet_json_1.default : deployments_testnet_json_1.default;
exports.CONTRACTS = {
    FACTORY: deployments.factory || '',
    VAULT: deployments.vault || '',
    PT_TOKEN: deployments.pt_token || '',
    YT_TOKEN: deployments.yt_token || '',
    SY_WRAPPER: deployments.sy_wrapper || '',
    MARKETPLACE: deployments.marketplace || '',
    INTENT_ENGINE: deployments.intent_engine || '',
    ROLLOVER: deployments.rollover || '',
    TOKENIZER: deployments.tokenizer || '',
    MOCK_USDC: deployments.underlying_token || '',
};
exports.RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ||
    (isMainnet ? 'https://mainnet.sorobanrpc.com' : 'https://soroban-testnet.stellar.org');
exports.NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ||
    (isMainnet ? 'Public Global Stellar Network ; September 2015' : 'Test SDF Network ; September 2015');
