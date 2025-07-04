#!/usr/bin/env node

// Simple VAPID key generation script
// Note: In production, you should use a proper crypto library

const crypto = require('crypto');

function generateVAPIDKeys() {
  // Generate a random key pair
  const privateKey = crypto.randomBytes(32);
  const publicKey = crypto.randomBytes(65); // Uncompressed public key
  
  // Convert to base64url format
  const privateKeyBase64 = privateKey.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
    
  const publicKeyBase64 = publicKey.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  console.log('VAPID Keys Generated:');
  console.log('=====================');
  console.log('Public Key:', publicKeyBase64);
  console.log('Private Key:', privateKeyBase64);
  console.log('\nAdd these to your environment variables:');
  console.log('VAPID_PUBLIC_KEY=' + publicKeyBase64);
  console.log('VAPID_PRIVATE_KEY=' + privateKeyBase64);
  console.log('\nReplace "YOUR_VAPID_PUBLIC_KEY" in src/client/index.tsx with the public key above.');
}

generateVAPIDKeys(); 