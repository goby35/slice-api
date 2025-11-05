#!/usr/bin/env node
// Simple JWKS checker for LENS_API_URL
// Usage: node scripts/check-jwks.mjs [LENS_API_URL]

const lensArg = process.argv[2];
const LENS_API_URL = lensArg || process.env.LENS_API_URL;
if (!LENS_API_URL) {
  console.error('Missing LENS_API_URL (pass as arg or set env var)');
  process.exit(2);
}

const timeoutMs = Number(process.env.JWKS_FETCH_TIMEOUT_MS || '80000');

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

const normalize = (url) => url.replace(/\/$/, '');

const candidates = [];
try {
  const base = normalize(LENS_API_URL);
  candidates.push(`${base.replace('/graphql', '')}/.well-known/jwks.json`);
  candidates.push(`${base}/.well-known/jwks.json`);
  candidates.push(`${base.replace('/graphql', '')}/.well-known/openid-configuration`);
  candidates.push(`${base}/.well-known/openid-configuration`);
} catch (e) {
  // ignore
}

(async () => {
  // Try each candidate. If candidate looks like openid-configuration, fetch it and read jwks_uri.
  for (const c of candidates) {
    try {
      console.log(`Trying: ${c}`);
      const res = await fetchWithTimeout(c, timeoutMs);
      if (!res.ok) {
        console.log(`  -> HTTP ${res.status}`);
        continue;
      }
      const body = await res.json();
      // If this is an openid-configuration
      if (body && body.jwks_uri) {
        console.log(`  -> discovered jwks_uri: ${body.jwks_uri}`);
        const res2 = await fetchWithTimeout(body.jwks_uri, timeoutMs);
        if (!res2.ok) { console.log(`  -> jwks fetch HTTP ${res2.status}`); continue }
        const jwks = await res2.json();
        if (!jwks.keys || !Array.isArray(jwks.keys)) { console.error('Invalid JWKS shape:', jwks); process.exit(1) }
        console.log(`Found ${jwks.keys.length} keys via discovery`);
        for (const k of jwks.keys) console.log(`- kid=${k.kid||'<no-kid>'} kty=${k.kty||'<no-kty>'} alg=${k.alg||'<no-alg>'}`);
        process.exit(0);
      }

      // Otherwise assume this is JWKS
      if (body && body.keys && Array.isArray(body.keys)) {
        const jwks = body;
        console.log(`Found ${jwks.keys.length} keys`);
        for (const k of jwks.keys) console.log(`- kid=${k.kid||'<no-kid>'} kty=${k.kty||'<no-kty>'} alg=${k.alg||'<no-alg>'}`);
        process.exit(0);
      }
      console.log('  -> Not a JWKS or OpenID configuration');
    } catch (err) {
      console.log(`  -> error: ${err?.message || err}`);
      continue;
    }
  }

  console.error('Unable to locate JWKS. Tried candidates above.');
  process.exit(1);
})();
