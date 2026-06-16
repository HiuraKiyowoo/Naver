import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { fetchJson } from '../../lib/utils'

export const meta = {
  name: 'Genius Lyrics', desc: 'Cari lirik lagu dari Genius.',
  category: 'TOOLS' as const, params: ['query'], method: 'GET' as const,
}

const app = new Hono()

app.get('/', zValidator('query', z.object({ query: z.string().min(1) })), async (c) => {
  const { query } = c.req.valid('query')
  const search = await fetchJson<any>(`https://genius.com/api/search/multi?per_page=1&q=${encodeURIComponent(query)}`)
  const hit = search?.response?.sections?.[0]?.hits?.[0]?.result
  if (!hit) return c.json({ status: false, statusCode: 404, creator: 'Xena', error: 'Lagu tidak ditemukan' }, 404)
  return c.json({ status: true, statusCode: 200, creator: 'Xena', result: { title: hit.title, artist: hit.primary_artist?.name ?? '', thumbnail: hit.song_art_image_url ?? '', url: hit.url } })
})

export default app
