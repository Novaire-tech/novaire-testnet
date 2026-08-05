#!/bin/bash
export MARKETPLACE=$(jq -r '.marketplace' ./scripts/deployments.testnet.json)
export RPC="https://soroban-testnet.stellar.org"
export NP="Test SDF Network ; September 2015"
export SRC=$(jq -r '.admin' ./scripts/testnet_keys.json)

echo "Reserves:"
stellar contract invoke --id $MARKETPLACE --source-account $SRC --rpc-url $RPC --network-passphrase "$NP" -- get_reserves || echo "get_reserves failed"

echo "TWAP:"
stellar contract invoke --id $MARKETPLACE --source-account $SRC --rpc-url $RPC --network-passphrase "$NP" -- get_twap || echo "get_twap failed"
