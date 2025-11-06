// import { LENS_API_URL } from "@slice/data/constants";
import "dotenv/config";
import { withPrefix } from '../logger.js';
import type { Context, Next } from "hono";
import { createRemoteJWKSet, createLocalJWKSet, jwtVerify } from "jose";


// Trong authMiddleware.ts (phiên bản mới)
// NOTE: initialize JWKS lazily to avoid throwing during module import time
// (Vercel may import modules during build where env vars aren't set).
let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
const getJWKS = async () => {
  if (JWKS) return JWKS;
  const LENS_API_URL = process.env.LENS_API_URL;
  if (!LENS_API_URL) {
    throw new Error("LENS_API_URL environment variable is required");
  }

  // Try to discover jwks_uri via common well-known locations. If discovery fails,
  // fall back to a conservative guess.
  const normalize = (u: string) => u.replace(/\/$/, '');
  const base = normalize(LENS_API_URL);

  const candidates = [
    `${base.replace('/graphql', '')}/.well-known/openid-configuration`,
    `${base}/.well-known/openid-configuration`,
    `${base.replace('/graphql', '')}/.well-known/jwks.json`,
    `${base}/.well-known/jwks.json`
  ];

  // Try discovery synchronously-ish by creating a RemoteJWKSet for the first URL we can parse
  // Note: createRemoteJWKSet expects a URL to the JWKS; if we hit openid-configuration we must fetch jwks_uri first.
  for (const candidate of candidates) {
    try {
      // If candidate looks like openid-configuration, try to fetch jwks_uri first
      if (candidate.endsWith('/openid-configuration')) {
        const controller = new AbortController();
        const timeoutMs = Number(process.env.JWKS_FETCH_TIMEOUT_MS || '80000');
        const to = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(candidate, { signal: controller.signal });
          clearTimeout(to);
          if (!res.ok) continue;
          const json = await res.json();
          if (json && json.jwks_uri) {
            JWKS = createRemoteJWKSet(new URL(json.jwks_uri));
            return JWKS;
          }
        } catch {
          // continue to next candidate
        }
      } else {
        // assume candidate is JWKS directly
        try {
          // quick HEAD to see if JWKS exists
          const controller2 = new AbortController();
          const timeoutMs2 = Number(process.env.JWKS_FETCH_TIMEOUT_MS || '80000');
          const to2 = setTimeout(() => controller2.abort(), timeoutMs2);
          const res2 = await fetch(candidate, { method: 'GET', signal: controller2.signal });
          clearTimeout(to2);
          if (!res2.ok) continue;
          // If reachable and returns JSON, use it as JWKS
          JWKS = createRemoteJWKSet(new URL(candidate));
          return JWKS;
        } catch {
          // continue
        }
      }
    } catch {
      // ignore and try next
    }
  }

  // final conservative fallback: try base without /graphql + /.well-known/jwks.json
  const fallback = `${base.replace('/graphql', '')}/.well-known/jwks.json`;
  JWKS = createRemoteJWKSet(new URL(fallback));
  return JWKS;
};

const unauthorized = (c: Context) => c.body("Unauthorized", 401);

/**
 * Extract a bearer token from common locations used by Hey/Lens clients:
 * - Authorization: Bearer <token>
 * - X-Access-Token header
 * - header `token`
 * - cookies: access_token or token
 */
const extractToken = (c: Context): string | undefined => {
  const auth = c.req.header("Authorization") || c.req.header("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();

  const x = c.req.header("X-Access-Token") || c.req.header("x-access-token") || c.get("token");
  if (x) return x;

  const cookieHeader = c.req.header("Cookie") || c.req.header("cookie");
  if (cookieHeader) {
    const parts = cookieHeader.split(";").map(p => p.trim());
    for (const p of parts) {
      const [k, v] = p.split("=");
      if (!k) continue;
      if (k === "access_token" || k === "token" || k === "accessToken") return decodeURIComponent(v || "");
    }
  }

  return undefined;
};

const authMiddleware = async (c: Context, next: Next) => {
  const log = withPrefix("[API]");
  const token = extractToken(c);

  if (!token) {
    log.warn("missing token");
    return unauthorized(c);
  }

  try {
    try {
      const { payload } = await jwtVerify(token, await getJWKS());
      // Attach the decoded payload to the context for downstream handlers.
      c.set("user", payload as Record<string, unknown>);
      return next();
    } catch (verifyErr: any) {
      // If JOSE refuses the JWKS because of unsupported alg values, or the JWKS fetch timed out,
      // try a fallback: fetch the JWKS manually (with a longer timeout), sanitize keys and use a local JWK set.
      if (verifyErr && (verifyErr.code === 'ERR_JOSE_NOT_SUPPORTED' || verifyErr.name === 'JOSENotSupported' || verifyErr.code === 'ERR_JWKS_TIMEOUT')) {
        try {
          const LENS_API_URL_FALLBACK = process.env.LENS_API_URL;
          if (!LENS_API_URL_FALLBACK) throw new Error('LENS_API_URL environment variable is required');
          const jwksUri = `${LENS_API_URL_FALLBACK.replace("/graphql", "")}/.well-known/jwks.json`;
          // manual fetch with configurable timeout (ms)
          const timeoutMs = Number(process.env.JWKS_FETCH_TIMEOUT_MS || '80000');
          const controller = new AbortController();
          const to = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(jwksUri, { signal: controller.signal });
          clearTimeout(to);
          const jwks = await res.json();
          // sanitize keys: remove 'alg' fields which may cause JOSENotSupported
          if (jwks && Array.isArray(jwks.keys)) {
            for (const k of jwks.keys) {
              if (k && typeof k === 'object' && 'alg' in k) {
                try { delete k.alg } catch {}
              }
            }
          }
          const localSet = createLocalJWKSet(jwks);
          const { payload } = await jwtVerify(token, localSet as any);
          c.set("user", payload as Record<string, unknown>);
          return next();
        } catch (fallbackErr) {
          log.warn("invalid token", fallbackErr as Error);
          return unauthorized(c);
        }
      }
      // otherwise rethrow to outer catch
      throw verifyErr;
    }
  } catch (err) {
    log.warn("invalid token", err as Error);
    return unauthorized(c);
  }

  return next();
};

export default authMiddleware;
