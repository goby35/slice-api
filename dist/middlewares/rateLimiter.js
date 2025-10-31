import sha256 from "../utils/sha256";
const getIp = (req) => {
    const ips = (req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-real-ip") ||
        req.headers.get("x-forwarded-for") ||
        "unknown").split(",");
    return ips[0].trim();
};
const rateLimiter = ({ requests, windowMs = 60 * 1000 }) => {
    // Map<key, { count, expiresAt }>
    const store = new Map();
    return async (c, next) => {
        const pathHash = sha256(c.req.path).slice(0, 25);
        const ipHash = sha256(getIp(c.req.raw)).slice(0, 25);
        const key = `rate-limit:${pathHash}:${ipHash}`;
        const now = Date.now();
        const entry = store.get(key);
        if (!entry || entry.expiresAt <= now) {
            store.set(key, { count: 1, expiresAt: now + windowMs });
        }
        else {
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
