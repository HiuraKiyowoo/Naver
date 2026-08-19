import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { fetchJson } from '../../lib/utils'

export const meta = {
  name: 'Anime Schedule', desc: 'Jadwal tayang anime berdasarkan hari.',
  category: 'ANIME' as const, params: ['day'], method: 'GET' as const,
}

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const

const app = new Hono()

app.get('/', zValidator('query', z.object({ day: z.enum(DAYS).default('monday') })), async (c) => {
  const { day } = c.req.valid('query')
  const data = await fetchJson<any>(`https://api.jikan.moe/v4/schedules?filter=${day}&limit=25`)
  const results = (data?.data ?? []).map((a: any) => ({
    title: a.title ?? '', slug: String(a.mal_id),
    thumbnail: a.images?.jpg?.image_url ?? '', score: String(a.score ?? ''),
    status: a.status ?? '', genres: (a.genres ?? []).map((g: any) => g.name),
  }))
  return c.json({ status: true, statusCode: 200, creator: 'Xena', result: results })
})

export default app
