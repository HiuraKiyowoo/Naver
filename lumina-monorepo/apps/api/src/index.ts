import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { prettyJSON } from 'hono/pretty-json'
import { reloadCache } from './lib/cache'
import { blacklistMiddleware } from './middleware/blacklist'
import { rateLimitMiddleware } from './middleware/rateLimit'
import { authMiddleware } from './middleware/auth'
import { loggerMiddleware } from './middleware/logger'

import aiLumina,      { meta as metaLumina }    from './routes/ai-chat/lumina'
import aiDeepseek,    { meta as metaDeepseek }  from './routes/ai-chat/deepseek'
import dlTiktok,      { meta as metaTiktok }    from './routes/downloader/tiktok'
import dlYoutube,     { meta as metaYoutube }   from './routes/downloader/youtube'
import toolsSsweb,    { meta as metaSsweb }     from './routes/tools/ssweb'
import toolsGenius,   { meta as metaGenius }    from './routes/tools/genius'
import animeSearch,   { meta as metaAnimeSearch }   from './routes/anime/search'
import animeSchedule, { meta as metaAnimeSchedule } from './routes/anime/schedule'

const app = new Hono()

// Global middleware
app.use('*', cors({ origin: '*' }))
app.use('*', prettyJSON())
app.use('/api/*', blacklistMiddleware)
app.use('/api/*', rateLimitMiddleware)
app.use('/api/*', authMiddleware)
app.use('/api/*', loggerMiddleware)

// Routes
app.route('/api/ai-chat/lumina',    aiLumina)
app.route('/api/ai-chat/deepseek',  aiDeepseek)
app.route('/api/downloader/tiktok', dlTiktok)
app.route('/api/downloader/youtube',dlYoutube)
app.route('/api/tools/ssweb',       toolsSsweb)
app.route('/api/tools/genius',      toolsGenius)
app.route('/api/anime/search',      animeSearch)
app.route('/api/anime/schedule',    animeSchedule)

// Endpoints listing
const ALL_META = [
  { path: '/api/ai-chat/lumina',     ...metaLumina },
  { path: '/api/ai-chat/deepseek',   ...metaDeepseek },
  { path: '/api/downloader/tiktok',  ...metaTiktok },
  { path: '/api/downloader/youtube', ...metaYoutube },
  { path: '/api/tools/ssweb',        ...metaSsweb },
  { path: '/api/tools/genius',       ...metaGenius },
  { path: '/api/anime/search',       ...metaAnimeSearch },
  { path: '/api/anime/schedule',     ...metaAnimeSchedule },
]

app.get('/endpoints', (c) => {
  const grouped = ALL_META.reduce<Record<string, typeof ALL_META>>((acc, m) => {
    acc[m.category] ??= []
    acc[m.category].push(m)
    return acc
  }, {})
  return c.json({ status: true, statusCode: 200, creator: 'Xena', result: grouped })
})

app.get('/', (c) =>
  c.json({ status: true, message: 'Lumina API is running 🚀', creator: 'Xena' })
)

app.notFound((c) =>
  c.json({ status: false, statusCode: 404, creator: 'Xena', error: 'Endpoint tidak ditemukan' }, 404)
)

app.onError((err, c) => {
  console.error('[ERROR]', c.req.path, err.message)
  return c.json({ status: false, statusCode: 500, creator: 'Xena', error: err.message }, 500)
})

// Init cache (non-blocking)
reloadCache().catch(console.warn)

module.exports = app
export default app
