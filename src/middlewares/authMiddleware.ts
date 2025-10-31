// import { LENS_API_URL } from "@slice/data/constants";
import "dotenv/config";
import { withPrefix } from '../logger.js';
import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";


// Trong authMiddleware.ts (phiên bản mới)
const LENS_API_URL = process.env.LENS_API_URL; // Đọc từ Vercel
if (!LENS_API_URL) {
  throw new Error("LENS_API_URL environment variable is required");
}
const jwksUri = `${LENS_API_URL.replace("/graphql", "")}/.well-known/jwks.json`;
const JWKS = createRemoteJWKSet(new URL(jwksUri), {
  cacheMaxAge: 60 * 60 * 12
});

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
    const { payload } = await jwtVerify(token, JWKS);
    // Attach the decoded payload to the context for downstream handlers.
    // Downstream code can read it via `c.get('user')` or `c.req` depending on needs.
    c.set("user", payload as Record<string, unknown>);
  } catch (err) {
    log.warn("invalid token", err as Error);
    return unauthorized(c);
  }

  return next();
};

export default authMiddleware;
