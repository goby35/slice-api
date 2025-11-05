import { Hono } from 'hono'
import type { Context } from 'hono'
import cors from './middlewares/cors.js'
import authMiddleware from './middlewares/authMiddleware.js'
import rateLimiter from './middlewares/rateLimiter.js'
import authContext from './middlewares/authContext.js'
import tasksRouter from './routes/tasks.js'
import usersRouter from './routes/users.js'
import taskApplicationsRouter from './routes/taskApplications.js'
import { db } from './db/index.js'
import { tasks } from './db/schema.js'

const app = new Hono()



// Global middleware: CORS then authContext
app.use('*', cors)
app.use('*', authContext)

const REAL_HEY_API_URL = (process.env.REAL_HEY_API_URL || process.env.HEY_API_URL || 'https://api.hey.xyz').replace(/\/$/, '')
const REAL_LENS_API_URL = (process.env.REAL_LENS_API_URL || process.env.LENS_API_URL || '').replace(/\/$/, '')

const forward = async (c: Context, target: string) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 50000)
  try {
    // build headers (exclude host)
    const headers: Record<string, string> = {}
    const rawHeaders = (c.req.raw && (c.req.raw.headers as any)) || {}
    try {
      // Headers can be a Headers instance
      if (typeof rawHeaders.forEach === 'function') {
        rawHeaders.for1Each((v: any, k: string) => { if (k.toLowerCase() !== 'host') headers[k] = String(v) })
      } else {
        for (const [k, v] of Object.entries(rawHeaders)) {
          if (k.toLowerCase() === 'host') continue
          if (Array.isArray(v)) headers[k] = v.join(',')
          else if (v != null) headers[k] = String(v)
        }
      }
    } catch {
      // best-effort fallback: copy common headers
      const maybeAuth = c.req.header('authorization') || c.req.header('Authorization')
      if (maybeAuth) headers['authorization'] = maybeAuth
      const maybeX = c.req.header('x-access-token') || c.req.header('X-Access-Token')
      if (maybeX) headers['x-access-token'] = maybeX
      const ct = c.req.header('content-type')
      if (ct) headers['content-type'] = ct
    }

    const method = c.req.method.toUpperCase()
    let body: BodyInit | undefined
    if (!['GET', 'HEAD'].includes(method)) {
      const arr = await c.req.arrayBuffer()
      body = new Uint8Array(arr)
      if (!headers['content-type'] && !headers['Content-Type']) headers['content-type'] = 'application/json'
    }

    const res = await fetch(target, { method, headers, body, signal: controller.signal })
    const status = res.status
    const contentType = res.headers.get('content-type') || ''
    const arrBuf = await res.arrayBuffer()
    const uint8 = new Uint8Array(arrBuf)

    if (contentType.includes('application/json')) {
      try {
        const jsonText = new TextDecoder().decode(uint8)
        return new Response(jsonText, { status, headers: { 'Content-Type': 'application/json' } })
      } catch (e) {
        const txt = new TextDecoder().decode(uint8)
        return new Response(txt, { status, headers: { 'Content-Type': contentType } })
      }
    }

    return new Response(uint8, { status, headers: { 'Content-Type': contentType } })
  } catch (err: any) {
    if (err && err.name === 'AbortError') return c.text('Upstream timeout', 504)
    return c.text('Upstream error', 502)
  } finally {
    clearTimeout(timeout)
  }
}

// Public REST shim
app.get('/metadata/sts', async (c) => forward(c, `${REAL_HEY_API_URL}/metadata/sts`))
app.get('/oembed/get', async (c) => {
  const qs = c.req.raw.url?.split('?')[1] || ''
  const url = qs ? `${REAL_HEY_API_URL}/oembed/get?${qs}` : `${REAL_HEY_API_URL}/oembed/get`
  return forward(c, url)
})
app.get('/og/*', async (c) => forward(c, `${REAL_HEY_API_URL}${c.req.path}`))

// Mount local routers for development/testing
// These routers expose the tasks, users and applications endpoints defined in src/routes
app.route('/tasks', tasksRouter)
app.route('/users', usersRouter)
app.route('/applications', taskApplicationsRouter)

// Simple root to verify server is running
app.get('/', (c) => c.text('slice-api running'))

// API: create task (protected)
app.post('/tasks', authMiddleware, async (c) => {
  // Get verified user payload from authMiddleware
  const userPayload = (c as any).get('user') as Record<string, any> | undefined
  const profileIdFromToken = userPayload?.act?.sub || userPayload?.sub
  if (!profileIdFromToken) return c.text('Unauthorized', 401)

  // Parse request body
  let body: any
  try {
    body = await c.req.json()
  } catch (e) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  // Basic validation (required fields)
  const { title, objective, deliverables, acceptanceCriteria, rewardPoints, deadline } = body || {}
  if (!title || !objective || !deliverables || !acceptanceCriteria || typeof rewardPoints !== 'number') {
    return c.json({ error: 'Missing or invalid required fields' }, 400)
  }

  // Build values and ignore any client-sent employerProfileId
  const values: Record<string, any> = {
    employerProfileId: profileIdFromToken,
    title,
    objective,
    deliverables,
    acceptanceCriteria,
    rewardPoints
  }

  if (deadline) {
    try {
      values.deadline = new Date(deadline)
    } catch {
      // ignore invalid date and let DB validation handle if necessary
    }
  }

  try {
  const [newTask] = await db.insert(tasks).values(values as any).returning()
    return c.json(newTask, 201)
  } catch (err: any) {
    // Drizzle / DB error
    console.error('Failed to create task', err)
    return c.json({ error: 'Failed to create task' }, 500)
  }
})

// Protected REST shim routes (rate limiter then auth)
app.use('/pageview', rateLimiter({ requests: 60 }))
app.use('/pageview', authMiddleware)
app.post('/pageview', async (c) => forward(c, `${REAL_HEY_API_URL}/pageview`))

app.use('/posts', rateLimiter({ requests: 60 }))
app.use('/posts', authMiddleware)
app.post('/posts', async (c) => forward(c, `${REAL_HEY_API_URL}/posts`))
export default app
