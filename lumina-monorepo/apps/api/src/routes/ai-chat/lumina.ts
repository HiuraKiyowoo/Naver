import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { postJson } from '../../lib/utils'
import type { ApiResponse, ChatResponse } from '../../lib/types'
import crypto from 'crypto'

export const meta = {
  name: 'LuminaAI',
  desc: 'Chat dengan Lumina AI (Original Persona) via Overchat Engine.',
  category: 'AI CHAT' as const,
  params: ['query'],
  method: 'GET' as const,
}

const SYSTEM_PROMPT = `Kamu adalah Lumina AI, asisten kecerdasan buatan yang cerdas, ramah, dan helpful.
Identitas kamu: Nama: Lumina AI | Versi: 1.0 | Dibuat oleh: Xena
Kepribadian: Ramah, sopan, informatif, sedikit humoris tapi tetap profesional
Aturan: Selalu perkenalkan diri sebagai "Lumina AI". Jangan sebut diri sebagai Claude, GPT, dll.`

const app = new Hono()

app.get('/', zValidator('query', z.object({ query: z.string().min(1) })), async (c) => {
  const { query } = c.req.valid('query')
  const body = {
    chatId: crypto.randomUUID(),
    model: 'gpt-5.2-nano',
    messages: [
      { id: crypto.randomUUID(), role: 'system', content: SYSTEM_PROMPT },
      { id: crypto.randomUUID(), role: 'user',   content: query },
    ],
    personaId: 'free-chat-gpt-landing',
    max_tokens: 4000,
    stream: false,
    temperature: 0.7,
  }
  const data  = await postJson<any>('https://overchat.ai/api/chat', body)
  const reply = data?.choices?.[0]?.message?.content ?? data?.reply ?? ''
  const result: ApiResponse<ChatResponse> = { status: true, statusCode: 200, creator: 'Xena', result: { reply, model: 'Lumina Engine v1.0' } }
  return c.json(result)
})

export default app
