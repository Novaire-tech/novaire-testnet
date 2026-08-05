const { Keypair } = require('@stellar/stellar-sdk');
const admin = Keypair.fromSecret('SC5LWQ4W2A7JQS7LUJ3FZSPU253MICTDQDNSYHTTNZWMWRRRXWRO65FC');
console.log("Secret is for public key:", admin.publicKey());
