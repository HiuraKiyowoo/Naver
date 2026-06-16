// ══════════════════════════════════════════
//  LUMINA API — Shared Types
// ══════════════════════════════════════════

/** Base response wrapper untuk semua endpoint */
export interface ApiResponse<T = unknown> {
  status: boolean
  statusCode: number
  creator: string
  message?: string
  result?: T
}

export interface ApiError {
  status: false
  statusCode: number
  creator: string
  error: string
}

/** Metadata tiap route, mirip pattern lama tapi TypeScript */
export interface RouteDefinition {
  name: string
  desc: string
  category: RouteCategory
  params: string[]
  bodyParams?: string[]
  method?: 'GET' | 'POST'
}

export type RouteCategory =
  | 'AI CHAT'
  | 'AI IMAGE'
  | 'AI VIDEO'
  | 'AI TOOLS'
  | 'DOWNLOADER'
  | 'TOOLS'
  | 'ANIME'
  | 'SEARCH'
  | 'ENTERTAINMENT'
  | 'RANDOM'
  | 'NSFW'

/** Format docs endpoint untuk frontend */
export interface EndpointDoc {
  slug: string
  category: RouteCategory
  name: string
  desc: string
  path: string
  method: 'GET' | 'POST'
  params: ParamDoc[]
}

export interface ParamDoc {
  name: string
  type: 'query' | 'body'
  required: boolean
  description?: string
}

/** AI Chat types */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatResponse {
  reply: string
  model?: string
  tokens?: number
}

/** Downloader types */
export interface DownloadResult {
  title?: string
  thumbnail?: string
  duration?: string
  author?: string
  url: string | DownloadMedia[]
}

export interface DownloadMedia {
  quality?: string
  url: string
  type: 'video' | 'audio' | 'image'
  size?: string
}

/** Anime types */
export interface AnimeResult {
  title: string
  slug: string
  thumbnail?: string
  episode?: string
  score?: string
  status?: string
  genres?: string[]
  synopsis?: string
}
