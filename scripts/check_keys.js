const { Keypair } = require('@stellar/stellar-sdk');
const secret = process.env.ADMIN_SECRET;
if (!secret) {
  console.error('Set ADMIN_SECRET in the environment before running this script.');
  process.exit(1);
}
const admin = Keypair.fromSecret(secret);
console.log("Secret is for public key:", admin.publicKey());
