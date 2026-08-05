#!/bin/bash
RPC_URL="https://soroban-testnet.stellar.org"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
export $(cat .env | xargs)

LEDGER=$(curl -s $RPC_URL/ledger | grep sequence)
# generate a dynamic maturity ledger
MATURITY=3600000

# read from scripts/deployments.testnet.json
UNDERLYING=$(cat scripts/deployments.testnet.json | grep '"underlying_token"' | awk -F '"' '{print $4}')
SY_WRAPPER=$(cat scripts/deployments.testnet.json | grep '"sy_wrapper"' | awk -F '"' '{print $4}')
VAULT=$(cat scripts/deployments.testnet.json | grep '"vault"' | awk -F '"' '{print $4}')
# TODO(operator): sy_wrapper now actively supplies the underlying into a real Blend
# Capital lending pool rather than just holding it idle, so deploy_epoch requires the
# address of that pool. Set BLEND_POOL to the real Blend testnet pool contract id for
# the underlying asset being deployed (see https://docs.blend.capital for testnet pool
# addresses) before running this script against testnet.
BLEND_POOL="${BLEND_POOL:-REPLACE_WITH_BLEND_POOL_ADDRESS}"
PT_TOKEN=$(cat scripts/deployments.testnet.json | grep '"pt_token"' | awk -F '"' '{print $4}')
YT_TOKEN=$(cat scripts/deployments.testnet.json | grep '"yt_token"' | awk -F '"' '{print $4}')
TOKENIZER=$(cat scripts/deployments.testnet.json | grep '"tokenizer"' | awk -F '"' '{print $4}')
MARKETPLACE=$(cat scripts/deployments.testnet.json | grep '"marketplace"' | awk -F '"' '{print $4}')
INTENT=$(cat scripts/deployments.testnet.json | grep '"intent_engine"' | awk -F '"' '{print $4}')
ROLLOVER=$(cat scripts/deployments.testnet.json | grep '"rollover"' | awk -F '"' '{print $4}')
FACTORY=$(cat scripts/deployments.testnet.json | grep '"factory"' | awk -F '"' '{print $4}')

PARAMS=$(cat <<JSON
{
  "maturity_ledger": $MATURITY,
  "underlying_token": "$UNDERLYING",
  "sy_wrapper": "$SY_WRAPPER",
  "vault": "$VAULT",
  "blend_pool": "$BLEND_POOL",
  "pt_token": "$PT_TOKEN",
  "yt_token": "$YT_TOKEN",
  "tokenizer": "$TOKENIZER",
  "marketplace": "$MARKETPLACE",
  "intent_engine": "$INTENT",
  "rollover_engine": "$ROLLOVER",
  "keeper": "$ADMIN_PUBLIC",
  "grace_period_ledgers": 1000
}
JSON
)

stellar contract invoke --id $FACTORY --source $ADMIN_SECRET --rpc-url $RPC_URL --network-passphrase "$NETWORK_PASSPHRASE" -- deploy_epoch --params "$PARAMS"
