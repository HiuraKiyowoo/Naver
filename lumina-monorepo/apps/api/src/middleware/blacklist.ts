import type { MiddlewareHandler } from 'hono'
import { cache } from '../lib/cache'

export const blacklistMiddleware: MiddlewareHandler = async (c, next) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? c.req.header('x-real-ip') ?? 'unknown'
  if (cache.blacklist.has(ip)) {
    return c.json({ status: false, statusCode: 403, creator: 'Xena', error: 'Access denied.' }, 403)
  }
  c.set('ip', ip)
  await next()
}
