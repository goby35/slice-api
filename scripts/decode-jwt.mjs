#!/usr/bin/env node
// Decode JWT header and payload without verifying. Usage:
// node scripts/decode-jwt.mjs <JWT>

const token = process.argv[2] || process.env.JWT_TO_DECODE;
if (!token) {
  console.error('Usage: node scripts/decode-jwt.mjs <JWT>');
  process.exit(2);
}

const b64 = (s) => s.replace(/-/g, '+').replace(/_/g, '/');
const decodePart = (p) => {
  try {
    return JSON.parse(Buffer.from(b64(p), 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
};

const parts = token.split('.');
if (parts.length < 2) {
  console.error('Invalid JWT');
  process.exit(1);
}

const header = decodePart(parts[0]);
const payload = decodePart(parts[1]);

console.log('HEADER:');
console.log(JSON.stringify(header, null, 2));
console.log('\nPAYLOAD:');
console.log(JSON.stringify(payload, null, 2));

if (payload && payload.iss) console.log('\nSuggested openid-configuration candidates:');
if (payload && payload.iss) console.log(`- ${payload.iss.replace(/\/$/, '')}/.well-known/openid-configuration`);
if (payload && payload.iss) console.log(`- ${payload.iss.replace(/\/$/, '')}/.well-known/jwks.json`);

process.exit(0);
