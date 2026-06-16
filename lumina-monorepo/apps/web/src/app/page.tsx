import type { Metadata } from 'next'
import Link from 'next/link'
import { ENDPOINTS, CATEGORIES } from '@/lib/endpoints'

export const metadata: Metadata = {
  title: 'Lumina API — Free REST API',
  description: 'Free REST API for AI Chat, Downloader, Tools, Anime, and more. 100+ endpoints, no registration needed.',
}

const CATEGORY_ICONS: Record<string, string> = {
  'AI CHAT':      '🤖',
  'AI IMAGE':     '🎨',
  'AI VIDEO':     '🎬',
  'AI TOOLS':     '🧠',
  'DOWNLOADER':   '⬇️',
  'TOOLS':        '🔧',
  'ANIME':        '🎌',
  'SEARCH':       '🔍',
  'ENTERTAINMENT':'🎉',
  'RANDOM':       '🎲',
  'NSFW':         '🔞',
}

export default function HomePage() {
  return (
    <main>
      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center text-center px-4 pt-28 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-indigo-900/20 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />

        <span className="mb-4 px-3 py-1 rounded-full text-xs font-medium glass text-indigo-300 border-indigo-500/30">
          ✨ {ENDPOINTS.length}+ endpoints tersedia
        </span>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
          <span className="gradient-text">Lumina API</span>
        </h1>

        <p className="max-w-xl text-lg text-gray-400 mb-10">
          Free REST API untuk AI Chat, Downloader, Tools, Anime, dan banyak lagi.
          Tanpa registrasi, langsung pakai.
        </p>

        <div className="flex gap-3 flex-wrap justify-center">
          <Link href="/docs" className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold transition-all hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25">
            Explore Docs
          </Link>
          <Link href="/playground" className="px-6 py-3 rounded-xl glass hover:bg-white/10 font-semibold transition-all hover:scale-105">
            Try Playground
          </Link>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Endpoints',  value: `${ENDPOINTS.length}+` },
            { label: 'Kategori',   value: `${CATEGORIES.length}`  },
            { label: 'Rate Limit', value: '60/min'                },
          ].map(s => (
            <div key={s.label} className="glass rounded-2xl p-6 text-center glow">
              <div className="text-3xl font-bold gradient-text">{s.value}</div>
              <div className="text-sm text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="max-w-5xl mx-auto px-4 pb-24">
        <h2 className="text-2xl font-bold mb-8 text-center">Kategori Endpoint</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {CATEGORIES.map(cat => {
            const count = ENDPOINTS.filter(e => e.category === cat).length
            const catSlug = cat.toLowerCase().replace(/\s+/g, '-')
            return (
              <Link
                key={cat}
                href={`/docs#${catSlug}`}
                className="glass rounded-2xl p-5 hover:bg-white/10 hover:border-indigo-500/50 transition-all hover:scale-105 group"
              >
                <div className="text-2xl mb-2">{CATEGORY_ICONS[cat] ?? '📦'}</div>
                <div className="font-semibold text-sm group-hover:text-indigo-300 transition-colors">{cat}</div>
                <div className="text-xs text-gray-500 mt-1">{count} endpoint{count > 1 ? 's' : ''}</div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 py-8 text-center text-sm text-gray-500">
        Made with 💜 by <a href="https://github.com/hiuraaaaa" className="text-indigo-400 hover:text-indigo-300">Xena</a>
      </footer>
    </main>
  )
}
