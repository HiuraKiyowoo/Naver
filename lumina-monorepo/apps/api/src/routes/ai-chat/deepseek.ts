import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { postJson } from '../../lib/utils'
import type { ApiResponse, ChatResponse } from '../../lib/types'

export const meta = {
  name: 'DeepSeek Chat',
  desc: 'Chat dengan DeepSeek R1 model secara gratis.',
  category: 'AI CHAT' as const,
  params: ['query', 'system'],
  method: 'GET' as const,
}

const app = new Hono()

app.get('/', zValidator('query', z.object({ query: z.string().min(1), system: z.string().optional().default('You are a helpful assistant.') })), async (c) => {
  const { query, system } = c.req.valid('query')
  const data = await postJson<any>('https://api.deepseek.com/v1/chat/completions', {
    model: 'deepseek-reasoner',
    messages: [{ role: 'system', content: system }, { role: 'user', content: query }],
    stream: false,
  }, { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY ?? ''}` } })
  const reply = data?.choices?.[0]?.message?.content ?? ''
  const result: ApiResponse<ChatResponse> = { status: true, statusCode: 200, creator: 'Xena', result: { reply, model: 'deepseek-reasoner' } }
  return c.json(result)
})

export default app
