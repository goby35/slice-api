import type { Context, Next } from 'hono';
import sha256 from "../utils/sha256.js";

/**
 * Simple in-memory rate limiter suitable for local/dev use.
 * Not intended for production (no clustering, memory resets on restart).
 */
interface RateLimiterOptions {
  requests: number;
  windowMs?: number;
}

const getIp = (req: Request): string => {
  const ips = (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for") ||
    "unknown"
  ).split(",");

  return ips[0].trim();
};

const rateLimiter = ({ requests, windowMs = 60 * 1000 }: RateLimiterOptions) => {
  // Map<key, { count, expiresAt }>
  const store = new Map<string, { count: number; expiresAt: number }>();

  return async (c: Context, next: Next) => {
    const pathHash = sha256(c.req.path).slice(0, 25);
    const ipHash = sha256(getIp(c.req.raw)).slice(0, 25);
    const key = `rate-limit:${pathHash}:${ipHash}`;

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.expiresAt <= now) {
      store.set(key, { count: 1, expiresAt: now + windowMs });
    } else {
      entry.count += 1;
      store.set(key, entry);
      if (entry.count > requests) {
        // Too many requests
        const retryAfter = Math.ceil((entry.expiresAt - now) / 1000);
        c.header('Retry-After', String(retryAfter));
        return c.text('Too Many Requests', 429);
      }
    }

    return next();
  };
};

export default rateLimiter;
