import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ENDPOINTS, CATEGORIES } from '@/lib/endpoints'
import { getEndpoint } from '@/lib/endpoints'
import PlaygroundInline from '@/components/ui/PlaygroundInline'

interface Props {
  params: { category: string; slug: string }
}

export async function generateStaticParams() {
  return ENDPOINTS.map(ep => ({
    category: ep.category.toLowerCase().replace(/\s+/g, '-'),
    slug:     ep.slug,
  }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ep = getEndpoint(params.category, params.slug)
  if (!ep) return {}
  return {
    title:       `${ep.name} — Lumina API`,
    description: ep.desc,
    openGraph:   { title: ep.name, description: ep.desc },
  }
}

export default function EndpointPage({ params }: Props) {
  const ep = getEndpoint(params.category, params.slug)
  if (!ep) notFound()

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.lumina.vercel.app'
  const exampleUrl = `${apiBase}${ep.path}?${ep.params.filter(p => p.required).map(p => `${p.name}=example`).join('&')}`

  return (
    <main className="max-w-4xl mx-auto px-4 py-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-gray-300">Home</Link>
        <span>/</span>
        <Link href="/docs" className="hover:text-gray-300">Docs</Link>
        <span>/</span>
        <Link href={`/docs#${params.category}`} className="hover:text-gray-300">{ep.category}</Link>
        <span>/</span>
        <span className="text-white">{ep.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <span className={`text-sm font-mono font-bold px-3 py-1 rounded-lg ${ep.method === 'GET' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
            {ep.method}
          </span>
          <code className="text-lg font-mono text-indigo-300">{ep.path}</code>
        </div>
        <h1 className="text-3xl font-bold mb-2">{ep.name}</h1>
        <p className="text-gray-400">{ep.desc}</p>
      </div>

      {/* Parameters */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Parameters</h2>
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Required</th>
                <th className="text-left px-4 py-3">Description</th>
              </tr>
            </thead>
            <tbody>
              {ep.params.map(p => (
                <tr key={p.name} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 font-mono text-indigo-300">{p.name}</td>
                  <td className="px-4 py-3 text-gray-400">{p.type}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${p.required ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {p.required ? 'required' : 'optional'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Example URL */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Example Request</h2>
        <div className="glass rounded-2xl p-4 font-mono text-sm text-gray-300 break-all">
          <span className="text-gray-500">GET </span>{exampleUrl}
        </div>
      </section>

      {/* Playground */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Try It</h2>
        <PlaygroundInline endpoint={ep} apiBase={apiBase} />
      </section>
    </main>
  )
}
