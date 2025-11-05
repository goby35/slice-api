import type { Context, Next } from 'hono'
// Simple authContext (token extractor) - if you already have a file, replace this with import
const authContext = async (c: Context, next: Next) => {
  // extract token from Authorization, X-Access-Token, token header or cookies
  const auth = c.req.header('Authorization') || c.req.header('authorization')
  if (auth && auth.startsWith('Bearer ')) {
    c.set('token', auth.slice(7).trim())
    return next()
  }

  const xt = c.req.header('X-Access-Token') || c.req.header('x-access-token') || c.req.header('token')
  if (xt) {
    c.set('token', xt)
    return next()
  }

  const cookie = c.req.header('Cookie') || c.req.header('cookie')
  if (cookie) {
    for (const part of cookie.split(';').map(p => p.trim())) {
      const [k, v] = part.split('=')
      if (k === 'access_token' || k === 'token' || k === 'accessToken') {
        c.set('token', decodeURIComponent(v || ''))
        break
      }
    }
  }

  return next()
}

export default authContext;