// ══════════════════════════════════════════
//  LUMINA API — Route Registry
//  Tambah route baru cukup import + daftarin di sini
// ══════════════════════════════════════════
import { Hono } from 'hono'
import type { EndpointDoc } from '../lib/types'

// AI Chat
import luminaRoute, { meta as luminaMeta }     from './ai-chat/lumina.js'
import deepseekRoute, { meta as deepseekMeta } from './ai-chat/deepseek.js'

// Downloader
import tiktokRoute, { meta as tiktokMeta }   from './downloader/tiktok.js'
import youtubeRoute, { meta as youtubeMeta } from './downloader/youtube.js'

// Tools
import sswebRoute,  { meta as sswebMeta }  from './tools/ssweb.js'
import geniusRoute, { meta as geniusMeta } from './tools/genius.js'

// Anime
import animeSearchRoute, { meta as animeSearchMeta } from './anime/search.js'
import animeInfoRoute,   { meta as animeInfoMeta }   from './anime/info.js'

// ── Registry ──────────────────────────────
const ROUTES = [
  { path: '/ai-chat/lumina',       app: luminaRoute,      meta: luminaMeta },
  { path: '/ai-chat/deepseek',     app: deepseekRoute,    meta: deepseekMeta },
  { path: '/downloader/tiktok',    app: tiktokRoute,      meta: tiktokMeta },
  { path: '/downloader/youtube',   app: youtubeRoute,     meta: youtubeMeta },
  { path: '/tools/ssweb',          app: sswebRoute,       meta: sswebMeta },
  { path: '/tools/genius',         app: geniusRoute,      meta: geniusMeta },
  { path: '/anime/search',         app: animeSearchRoute, meta: animeSearchMeta },
  { path: '/anime/info',           app: animeInfoRoute,   meta: animeInfoMeta },
] as const

export function registerRoutes(api: Hono) {
  for (const route of ROUTES) {
    api.route(route.path, route.app)
  }
}

/** Semua endpoint docs, dipakai frontend untuk generate halaman SSG */
export function getEndpointDocs(): EndpointDoc[] {
  return ROUTES.map(r => ({
    slug:     r.path.replace(/\//g, '-').replace(/^-/, ''),
    category: r.meta.category,
    name:     r.meta.name,
    desc:     r.meta.desc,
    path:     `/api${r.path}`,
    method:   r.meta.method ?? 'GET',
    params:   r.meta.params.map(p => ({ name: p, type: 'query' as const, required: true })),
  }))
}
