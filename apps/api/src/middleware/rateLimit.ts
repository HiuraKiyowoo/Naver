import type { MiddlewareHandler } from 'hono'

const rateMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT  = 60
const RATE_WINDOW = 60_000

setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateMap.entries()) {
    if (now > entry.resetAt) rateMap.delete(ip)
  }
}, 5 * 60_000)

function checkRateLimit(ip: string): boolean {
  const now   = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT
}

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const ip = c.get('ip') ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return c.json({ status: false, statusCode: 429, creator: 'Xena', error: 'Too many requests.', retryAfter: '60s' }, 429)
  }
  await next()
}
