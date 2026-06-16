// ══════════════════════════════════════════
//  Static endpoint registry untuk SSG
//  Tambah entry di sini setiap ada route baru
// ══════════════════════════════════════════
import type { EndpointDoc } from '@lumina/types'

export const ENDPOINTS: EndpointDoc[] = [
  {
    slug:     'lumina',
    category: 'AI CHAT',
    name:     'LuminaAI',
    desc:     'Chat dengan Lumina AI (Original Persona) via Overchat Engine.',
    path:     '/api/ai-chat/lumina',
    method:   'GET',
    params:   [{ name: 'query', type: 'query', required: true, description: 'Pertanyaan atau pesan untuk Lumina AI' }],
  },
  {
    slug:     'deepseek',
    category: 'AI CHAT',
    name:     'DeepSeek Chat',
    desc:     'Chat dengan DeepSeek R1 model secara gratis.',
    path:     '/api/ai-chat/deepseek',
    method:   'GET',
    params:   [
      { name: 'query',  type: 'query', required: true,  description: 'Pertanyaan ke DeepSeek' },
      { name: 'system', type: 'query', required: false, description: 'System prompt custom' },
    ],
  },
  {
    slug:     'tiktok',
    category: 'DOWNLOADER',
    name:     'TikTok Downloader',
    desc:     'Download video TikTok tanpa watermark.',
    path:     '/api/downloader/tiktok',
    method:   'GET',
    params:   [{ name: 'url', type: 'query', required: true, description: 'URL video TikTok' }],
  },
  {
    slug:     'youtube',
    category: 'DOWNLOADER',
    name:     'YouTube Downloader',
    desc:     'Download video/audio dari YouTube.',
    path:     '/api/downloader/youtube',
    method:   'GET',
    params:   [
      { name: 'url',     type: 'query', required: true,  description: 'URL video YouTube' },
      { name: 'quality', type: 'query', required: false, description: '360p | 480p | 720p | 1080p | audio' },
    ],
  },
  {
    slug:     'ssweb',
    category: 'TOOLS',
    name:     'Screenshot Website',
    desc:     'Ambil screenshot dari sebuah website.',
    path:     '/api/tools/ssweb',
    method:   'GET',
    params:   [{ name: 'url', type: 'query', required: true, description: 'URL website target' }],
  },
  {
    slug:     'genius',
    category: 'TOOLS',
    name:     'Genius Lyrics',
    desc:     'Cari lirik lagu dari Genius.',
    path:     '/api/tools/genius',
    method:   'GET',
    params:   [{ name: 'query', type: 'query', required: true, description: 'Judul lagu atau nama artis' }],
  },
  {
    slug:     'search',
    category: 'ANIME',
    name:     'Anime Search',
    desc:     'Cari anime berdasarkan judul via MyAnimeList.',
    path:     '/api/anime/search',
    method:   'GET',
    params:   [{ name: 'query', type: 'query', required: true, description: 'Judul anime' }],
  },
  {
    slug:     'schedule',
    category: 'ANIME',
    name:     'Anime Schedule',
    desc:     'Jadwal tayang anime berdasarkan hari.',
    path:     '/api/anime/schedule',
    method:   'GET',
    params:   [{ name: 'day', type: 'query', required: false, description: 'monday | tuesday | ... | sunday' }],
  },
]

export const CATEGORIES = [...new Set(ENDPOINTS.map(e => e.category))]

export function getEndpointsByCategory(cat: string) {
  return ENDPOINTS.filter(e => e.category === cat)
}

export function getEndpoint(category: string, slug: string) {
  return ENDPOINTS.find(
    e => e.category.toLowerCase().replace(/\s+/g, '-') === category && e.slug === slug
  )
}
