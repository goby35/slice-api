import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authMiddleware from './middlewares/authMiddleware.js';

const app = new Hono()

// CHO PHÉP FRONTEND "HEY" GỌI
app.use('*', cors({
  origin: [
    'http://localhost:3000', // Cho máy dev của bạn
    'https://app.hey.xyz' // Domain của "Hey" (thay thế nếu cần)
  ],
  allowHeaders: ['X-Access-Token', 'Content-Type'],
  allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE'],
}))

const welcomeStrings = [
  'Hello Hono!',
  'To learn more about Hono on Vercel, visit https://vercel.com/docs/frameworks/backend/hono'
]

app.get('/', (c) => {
  return c.text(welcomeStrings.join('\n\n'))
})

// Shim / Proxy for legacy Hey endpoints -> forward to https://api.hey.xyz
const HEY_API_ORIGIN = 'https://api.hey.xyz';

// Helper to forward request to Hey upstream
const forwardToHey = async (c: any, upstreamPath: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000);

  try {
    const rawUrl: string = (c.req.raw && c.req.raw.url) ? c.req.raw.url : c.req.url;
    const query = rawUrl.split('?')[1] || '';
    const url = query ? `${HEY_API_ORIGIN}${upstreamPath}?${query}` : `${HEY_API_ORIGIN}${upstreamPath}`;

    // Copy all incoming headers except host using Hono's headers iterator
    const headers: Record<string, string> = {};
    try {
      for (const [k, v] of c.req.headers) {
        if (!k) continue;
        if (k.toLowerCase() === 'host') continue;
        headers[k] = v as string;
      }
    } catch (e) {
      // Fallback: try c.req.raw.headers if headers isn't iterable in this runtime
      const rawHeaders = (c.req.raw && (c.req.raw.headers as any)) || {};
      for (const [k, v] of Object.entries(rawHeaders)) {
        if (!k) continue;
        if (k.toLowerCase() === 'host') continue;
        if (Array.isArray(v)) {
          headers[k] = v.join(',');
        } else if (v !== undefined && v !== null) {
          headers[k] = String(v);
        }
      }
    }

    // Ensure content-type present when body exists
    const method = c.req.method.toUpperCase();
    let body: undefined | ArrayBuffer | Uint8Array;
    if (!['GET', 'HEAD'].includes(method)) {
      const arr = await c.req.arrayBuffer();
      // prefer Uint8Array for fetch BodyInit compatibility
      body = new Uint8Array(arr);
      if (!headers['content-type'] && !headers['Content-Type']) {
        headers['content-type'] = 'application/octet-stream';
      }
    }

    const res = await fetch(url, {
      method,
      headers,
      body: (body as any) ?? undefined,
      signal: controller.signal
    });

    const respArrayBuf = await res.arrayBuffer();
    const respBuffer = Buffer.from(respArrayBuf);
    const contentType = res.headers.get('content-type') || 'application/octet-stream';

    // If JSON, attempt to return JSON; otherwise return raw Uint8Array
    const respUint8 = new Uint8Array(respArrayBuf);
    if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(new TextDecoder('utf-8').decode(respUint8));
        return c.json(json, res.status);
      } catch (e) {
        // fallthrough to text
        return c.body(new TextDecoder('utf-8').decode(respUint8), res.status, { 'Content-Type': contentType });
      }
    }

    return c.body(respUint8, res.status, { 'Content-Type': contentType });
  } catch (err: any) {
    if (err && err.name === 'AbortError') {
      return c.body('Upstream timeout', 504);
    }
    return c.body('Upstream error', 502);
  } finally {
    clearTimeout(timeoutId);
  }
};

// Forward GET /oembed/get?url=...
app.get('/oembed/get', async (c) => {
  // build upstream path exactly
  return forwardToHey(c, '/oembed/get');
});

// Forward GET /metadata/sts
app.get('/metadata/sts', async (c) => {
  return forwardToHey(c, '/metadata/sts');
});

// Forward POST /pageview
// Require auth for write routes (pageview/posts) — copy Lens/Hey JWT check
app.use('/pageview', authMiddleware);
app.use('/posts', authMiddleware);

// Forward POST /pageview
app.post('/pageview', async (c) => {
  return forwardToHey(c, '/pageview');
});

// Forward POST /posts
app.post('/posts', async (c) => {
  return forwardToHey(c, '/posts');
});

export default app
