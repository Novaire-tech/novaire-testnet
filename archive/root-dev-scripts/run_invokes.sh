#!/bin/bash
export PT_TOKEN=$(jq -r '.pt_token' ./scripts/deployments.testnet.json)
export YT_TOKEN=$(jq -r '.yt_token' ./scripts/deployments.testnet.json)
export SY_WRAPPER=$(jq -r '.sy_wrapper' ./scripts/deployments.testnet.json)
export UNDERLYING=$(jq -r '.underlying_token' ./scripts/deployments.testnet.json)
source .env
export RPC="https://soroban-testnet.stellar.org"
export NP="Test SDF Network ; September 2015"

echo "1. PT Balance:"
stellar contract invoke --id $PT_TOKEN --source-account $ADMIN_SECRET --rpc-url $RPC --network-passphrase "$NP" -- balance --id $ADMIN_PUBLIC

echo "2. YT Balance:"
stellar contract invoke --id $YT_TOKEN --source-account $ADMIN_SECRET --rpc-url $RPC --network-passphrase "$NP" -- balance --id $ADMIN_PUBLIC

echo "3. Claimable Yield:"
stellar contract invoke --id $YT_TOKEN --source-account $ADMIN_SECRET --rpc-url $RPC --network-passphrase "$NP" -- claimable_yield --user $ADMIN_PUBLIC

echo "4. SY Rate:"
stellar contract invoke --id $SY_WRAPPER --source-account $ADMIN_SECRET --rpc-url $RPC --network-passphrase "$NP" -- get_exchange_rate

echo "5. Total SY Shares:"
stellar contract invoke --id $SY_WRAPPER --source-account $ADMIN_SECRET --rpc-url $RPC --network-passphrase "$NP" -- total_shares

echo "6. Underlying inside SY:"
stellar contract invoke --id $UNDERLYING --source-account $ADMIN_SECRET --rpc-url $RPC --network-passphrase "$NP" -- balance --id $SY_WRAPPER
