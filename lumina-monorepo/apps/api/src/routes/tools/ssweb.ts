import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

export const meta = {
  name: 'Screenshot Website', desc: 'Ambil screenshot dari sebuah website.',
  category: 'TOOLS' as const, params: ['url'], method: 'GET' as const,
}

const app = new Hono()

app.get('/', zValidator('query', z.object({ url: z.string().url() })), async (c) => {
  const { url } = c.req.valid('query')
  const imageUrl = `https://api.screenshotone.com/take?url=${encodeURIComponent(url)}&format=jpg&viewport_width=1280&viewport_height=800`
  return c.json({ status: true, statusCode: 200, creator: 'Xena', result: { image_url: imageUrl, source_url: url } })
})

export default app
