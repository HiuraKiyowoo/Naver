import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { fetchJson } from '../../lib/utils'
import type { ApiResponse, AnimeResult } from '../../lib/types'

export const meta = {
  name: 'Anime Info',
  desc: 'Detail info anime berdasarkan MAL ID.',
  category: 'ANIME' as const,
  params: ['id'],
  method: 'GET' as const,
}

const schema = z.object({ id: z.coerce.number().min(1) })

const app = new Hono()

app.get('/', zValidator('query', schema), async (c) => {
  const { id } = c.req.valid('query')
  const data = await fetchJson<any>(`https://api.jikan.moe/v4/anime/${id}/full`)
  const a = data?.data

  if (!a) return c.json({ status: false, statusCode: 404, creator: 'Xena', error: 'Anime tidak ditemukan' }, 404)

  const result: ApiResponse<AnimeResult> = {
    status: true, statusCode: 200, creator: 'Xena',
    result: {
      title:     a.title,
      slug:      String(a.mal_id),
      thumbnail: a.images?.jpg?.large_image_url ?? '',
      score:     String(a.score ?? ''),
      status:    a.status ?? '',
      genres:    a.genres?.map((g: any) => g.name) ?? [],
      synopsis:  a.synopsis ?? '',
    },
  }
  return c.json(result)
})

export default app
