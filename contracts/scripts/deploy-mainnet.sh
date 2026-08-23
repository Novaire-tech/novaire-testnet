#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Mainnet deploy for novaire (sy-wrapper, pt-token, yt-token, tokenizer, amm).
#
# SAFE BY DEFAULT: this script only simulates. Nothing is submitted to
# Mainnet unless you pass --execute-mainnet explicitly.
#
#   ./deploy-mainnet.sh                 # dry run: builds + simulates every
#                                        # op, prints exact fees, exits.
#   ./deploy-mainnet.sh --execute-mainnet   # after review, actually deploys.
#
# No private key is ever hardcoded. Uses whatever identity `stellar keys`
# already has configured (DEPLOY_IDENTITY, default "novaire-deployer").

set -euo pipefail

CONTRACTS_DIR="${CONTRACTS_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
REPO="${REPO:-$(cd "$CONTRACTS_DIR/.." && pwd)}"
cd "$CONTRACTS_DIR"

NETWORK="${NETWORK:-mainnet}"
EXPECTED_PASSPHRASE="Public Global Stellar Network ; September 2015"
IDENTITY="${DEPLOY_IDENTITY:-novaire-deployer}"
WASM_DIR="${WASM_DIR:-target/wasm32v1-none/release/optimized}"
DEPLOYMENTS_DIR="${DEPLOYMENTS_DIR:-$REPO/deployments}"

EXECUTE=0
if [[ "${1:-}" == "--execute-mainnet" ]]; then
  EXECUTE=1
fi

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "$1 not found"; }
require_cmd stellar
require_cmd python3

# --- network validation -----------------------------------------------
CONFIGURED_PASSPHRASE="$(stellar network ls --long 2>/dev/null | awk -v n="$NETWORK" '
  $0 ~ "^Name: "n"$" {found=1}
  found && /^Network passphrase:/ {sub("^Network passphrase: ",""); print; exit}
')"

if [[ -z "$CONFIGURED_PASSPHRASE" ]]; then
  die "network '$NETWORK' is not configured (stellar network add ...). Refusing to run."
fi
if [[ "$CONFIGURED_PASSPHRASE" != "$EXPECTED_PASSPHRASE" ]]; then
  die "network '$NETWORK' passphrase is '$CONFIGURED_PASSPHRASE', expected mainnet passphrase '$EXPECTED_PASSPHRASE'. Refusing to run."
fi
if [[ "$NETWORK" == *testnet* || "$NETWORK" == *futurenet* ]]; then
  die "NETWORK name '$NETWORK' looks like a non-mainnet network. Refusing to run."
fi

log "Network: $NETWORK"
log "Passphrase: $CONFIGURED_PASSPHRASE (verified Mainnet)"

if ! stellar keys address "$IDENTITY" >/dev/null 2>&1; then
  die "deployer identity '$IDENTITY' not found. Run: stellar keys generate $IDENTITY  (then fund it — no auto-fund on Mainnet)"
fi
DEPLOYER_ADDRESS="$(stellar keys address "$IDENTITY")"
log "Deployer: $DEPLOYER_ADDRESS"

BALANCE_JSON="$(curl -s -m 10 "https://horizon.stellar.org/accounts/$DEPLOYER_ADDRESS" || true)"
BALANCE="$(printf '%s' "$BALANCE_JSON" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    for b in d.get('balances', []):
        if b.get('asset_type') == 'native':
            print(b['balance']); break
    else:
        print('0')
except Exception:
    print('UNKNOWN')
" 2>/dev/null || echo UNKNOWN)"
log "Deployer XLM balance: $BALANCE"

CONTRACTS=(sy_wrapper pt_token yt_token tokenizer amm)

TOTAL_RESOURCE_FEE=0
declare -A UPLOAD_HASH

log "---- Simulating WASM upload for each contract (no submission) ----"
for name in "${CONTRACTS[@]}"; do
  wasm="$WASM_DIR/novaire_${name}.wasm"
  [[ -f "$wasm" ]] || die "missing $wasm — run build-optimized-wasm.sh first"
  bytes=$(stat -c%s "$wasm")
  hash="$(stellar contract info hash --wasm "$wasm")"
  UPLOAD_HASH[$name]="$hash"

  XDR="$(stellar contract upload --wasm "$wasm" --source-account "$DEPLOYER_ADDRESS" --network "$NETWORK" --build-only 2>/dev/null)"
  SIMXDR="$(echo "$XDR" | stellar tx simulate --source-account "$DEPLOYER_ADDRESS" --network "$NETWORK" 2>/dev/null)" \
    || die "simulation failed for $name upload — check RPC / account existence on Mainnet"

  DECODED="$(echo "$SIMXDR" | stellar tx decode 2>/dev/null)"
  read -r FEE RESFEE INSN WBYTES <<<"$(python3 -c "
import json
d=json.loads('''$DECODED''')
tx=d['tx']['tx']
v1=tx['ext']['v1']
res=v1['resources']
print(tx['fee'], v1['resource_fee'], res['instructions'], res['write_bytes'])
")"
  TOTAL_RESOURCE_FEE=$((TOTAL_RESOURCE_FEE + RESFEE))
  printf '  %-12s %6d B  hash=%s  resource_fee=%d stroops (%.7f XLM)\n' \
    "$name" "$bytes" "${hash:0:12}..." "$RESFEE" "$(python3 -c "print($RESFEE/1e7)")"
done

TOTAL_XLM="$(python3 -c "print($TOTAL_RESOURCE_FEE/1e7)")"
BUFFER_XLM="$(python3 -c "print(round($TOTAL_RESOURCE_FEE/1e7*0.10, 7))")"
RESERVE_XLM="1.0"
FUNDING_XLM="$(python3 -c "print(round($TOTAL_RESOURCE_FEE/1e7 + 0.10*$TOTAL_RESOURCE_FEE/1e7 + $RESERVE_XLM, 7))")"

echo
log "Simulated WASM-upload resource fees total: $TOTAL_XLM XLM"
log "10% buffer: $BUFFER_XLM XLM"
log "Account reserve (base 2 entries * 0.5 XLM): $RESERVE_XLM XLM"
log "Recommended funding (upload only — see report for create+init): $FUNDING_XLM XLM"
warn "Contract-create + initialize resource fees are NOT included above (each references an already-uploaded hash and cannot be simulated until its wasm is actually on-chain). They are consistently tiny (no wasm bytes moved) relative to upload cost — confirm exact figures live once uploads land, before spending on create+init."

if [[ "$EXECUTE" != "1" ]]; then
  echo
  warn "DRY RUN ONLY. No transaction was submitted. Re-run with --execute-mainnet to deploy for real."
  exit 0
fi

# --- real execution path ------------------------------------------------
[[ "$BALANCE" != "UNKNOWN" && "$BALANCE" != "0" ]] || die "could not confirm a funded balance for $DEPLOYER_ADDRESS on Mainnet — refusing to execute"

read -r -p "Type EXECUTE to confirm real Mainnet deployment of ${#CONTRACTS[@]} contracts from $DEPLOYER_ADDRESS: " CONFIRM
[[ "$CONFIRM" == "EXECUTE" ]] || die "confirmation not given"

mkdir -p "$DEPLOYMENTS_DIR"
RESULT_FILE="$DEPLOYMENTS_DIR/mainnet.$(date -u +%Y%m%dT%H%M%SZ).json"
declare -A ADDR
for name in "${CONTRACTS[@]}"; do
  wasm="$WASM_DIR/novaire_${name}.wasm"
  log "Deploying $name to Mainnet"
  ADDR[$name]="$(stellar contract deploy --wasm "$wasm" --source "$IDENTITY" --network "$NETWORK" 2>&1 | tail -1)"
  log "  $name -> ${ADDR[$name]}"
done

python3 -c "
import json
json.dump({
  'network': '$NETWORK',
  'deployer': '$DEPLOYER_ADDRESS',
  'contracts': { $(for n in "${CONTRACTS[@]}"; do printf '\"%s\": \"%s\", ' "$n" "${ADDR[$n]}"; done) },
}, open('$RESULT_FILE', 'w'), indent=2)
"
log "Saved deployment addresses to $RESULT_FILE"
warn "Initialize calls are NOT included in this script yet — wire them up (mirroring deploy-testnet-resilient.sh's invoke_once calls) before using this in anger, and re-run the whole dry-run flow once more against them first."
