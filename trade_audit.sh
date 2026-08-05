#!/bin/bash
export MARKETPLACE=$(jq -r '.marketplace' ./scripts/deployments.testnet.json)
source .env
export SRC=$ADMIN_SECRET
export PUB=$(jq -r '.admin_public' ./scripts/testnet_keys.json)
export RPC="https://soroban-testnet.stellar.org"
export NP="Test SDF Network ; September 2015"

echo "Attempting swap_underlying_for_pt..."
stellar contract invoke --id $MARKETPLACE --source-account $SRC --rpc-url $RPC --network-passphrase "$NP" -- swap_underlying_for_pt --buyer $PUB --underlying_in 100000000 --min_pt_out 1
