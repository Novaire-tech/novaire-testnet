#!/bin/bash
export $(cat .env | xargs)
echo "Deployment Key currently in .env (ADMIN_PUBLIC):"
echo $ADMIN_PUBLIC
echo "Factory Admin on-chain:"
stellar contract read --id CCCGZFAE7TEMGKC7P5PSG73W3BY5475WETXNPD33K42YHKVL6RZ3YI6R --network testnet --output json > scripts/factory_storage.json
cat scripts/factory_storage.json | grep -A 5 '"symbol": "Admin"' | grep '"address"' | awk -F'"' '{print $4}'
