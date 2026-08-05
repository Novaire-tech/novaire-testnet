#!/bin/bash
set -e

export VAULT=$(jq -r '.vault' ./scripts/deployments.testnet.json)
export TOKENIZER=$(jq -r '.tokenizer' ./scripts/deployments.testnet.json)
export MARKETPLACE=$(jq -r '.marketplace' ./scripts/deployments.testnet.json)
source .env
export SRC=$ADMIN_SECRET
export PUB=$ADMIN_PUBLIC
export RPC="https://soroban-testnet.stellar.org"
export NP="Test SDF Network ; September 2015"

# ── Guard: print current reserves to catch duplicate bootstrap runs ──────────
echo ">>> Current Marketplace reserves (must be [0,0,0] for a clean bootstrap):"
stellar contract invoke --id $MARKETPLACE --source-account $SRC --rpc-url $RPC --network-passphrase "$NP" -- get_reserves

echo ""
echo ">>> Minting SY via Vault..."
stellar contract invoke --id $VAULT --source-account $SRC --rpc-url $RPC --network-passphrase "$NP" -- deposit --depositor $PUB --amount 1000000000

echo ">>> Minting PT/YT via Tokenizer..."
stellar contract invoke --id $TOKENIZER --source-account $SRC --rpc-url $RPC --network-passphrase "$NP" -- mint_pt_yt --user $PUB --sy_shares 1000000000

# ── Economically correct liquidity: PT > Underlying ─────────────────────────
# With pt_amount=1_000_000_000 and underlying_amount=999_500_000,
# get_pt_price returns ~999_500_250 / 1e9 ≈ 0.9995 — a ~0.05% discount,
# which correctly models a near-maturity zero-coupon bond.
echo ">>> Adding Liquidity to Marketplace (pt=1_000_000_000, underlying=999_500_000)..."
stellar contract invoke --id $MARKETPLACE --source-account $SRC --rpc-url $RPC --network-passphrase "$NP" -- add_liquidity --provider $PUB --pt_amount 1000000000 --underlying_amount 999500000

echo ""
echo ">>> Reserves after bootstrap (expected: pt=1_000_000_000, underlying=999_500_000):"
stellar contract invoke --id $MARKETPLACE --source-account $SRC --rpc-url $RPC --network-passphrase "$NP" -- get_reserves

echo ""
echo ">>> Spot PT Price (expected: ~999_500_000, i.e. ~0.9995 in 1e9 fixed-point):"
stellar contract invoke --id $MARKETPLACE --source-account $SRC --rpc-url $RPC --network-passphrase "$NP" -- get_pt_price

echo ""
echo ">>> TWAP PT Price (initially unset, will return spot price as fallback):"
stellar contract invoke --id $MARKETPLACE --source-account $SRC --rpc-url $RPC --network-passphrase "$NP" -- get_twap_rate
