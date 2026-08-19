import type { Metadata } from 'next'
import Link from 'next/link'
import { ENDPOINTS, CATEGORIES } from '@/lib/endpoints'

export const metadata: Metadata = {
  title: 'API Documentation',
  description: 'Dokumentasi lengkap semua endpoint Lumina API. AI Chat, Downloader, Tools, Anime, dan banyak lagi.',
}

export default function DocsPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-16">
      <div className="mb-12 text-center">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-4 inline-block">← Back to Home</Link>
        <h1 className="text-4xl font-bold gradient-text mb-3">API Documentation</h1>
        <p className="text-gray-400">Base URL: <code className="font-mono text-indigo-300 text-sm">{process.env.NEXT_PUBLIC_API_URL ?? 'https://api.lumina.vercel.app'}</code></p>
      </div>

      <div className="space-y-12">
        {CATEGORIES.map(cat => {
          const catSlug = cat.toLowerCase().replace(/\s+/g, '-')
          const eps     = ENDPOINTS.filter(e => e.category === cat)
          return (
            <section key={cat} id={catSlug}>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="w-1 h-6 rounded bg-indigo-500 inline-block" />
                {cat}
                <span className="text-xs text-gray-500 font-normal ml-1">{eps.length} endpoints</span>
              </h2>
              <div className="grid gap-3">
                {eps.map(ep => (
                  <Link
                    key={ep.slug}
                    href={`/docs/${catSlug}/${ep.slug}`}
                    className="glass rounded-xl p-5 hover:bg-white/10 hover:border-indigo-500/40 transition-all flex items-start justify-between group"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${ep.method === 'GET' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {ep.method}
                        </span>
                        <code className="text-sm font-mono text-gray-300">{ep.path}</code>
                      </div>
                      <div className="font-semibold group-hover:text-indigo-300 transition-colors">{ep.name}</div>
                      <div className="text-sm text-gray-500 mt-0.5">{ep.desc}</div>
                    </div>
                    <span className="text-gray-600 group-hover:text-indigo-400 transition-colors mt-1">→</span>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
