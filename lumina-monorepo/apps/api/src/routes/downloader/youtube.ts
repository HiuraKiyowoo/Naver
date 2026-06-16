import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { postJson } from '../../lib/utils'
import type { ApiResponse, DownloadResult } from '../../lib/types'

export const meta = {
  name: 'YouTube Downloader', desc: 'Download video/audio dari YouTube.',
  category: 'DOWNLOADER' as const, params: ['url', 'quality'], method: 'GET' as const,
}

const app = new Hono()

app.get('/', zValidator('query', z.object({ url: z.string().url(), quality: z.enum(['360p','480p','720p','1080p','audio']).default('720p') })), async (c) => {
  const { url, quality } = c.req.valid('query')
  const data = await postJson<any>('https://api.cobalt.tools/api/json', { url, vQuality: quality === 'audio' ? '720' : quality, isAudioOnly: quality === 'audio' })
  const result: ApiResponse<DownloadResult> = { status: true, statusCode: 200, creator: 'Xena', result: { url: data?.url ?? '', title: data?.filename ?? '' } }
  return c.json(result)
})

export default app
