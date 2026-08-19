'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ENDPOINTS, CATEGORIES } from '@/lib/endpoints'
import type { EndpointDoc } from '@lumina/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.lumina.vercel.app'

export default function PlaygroundPage() {
  const [selected, setSelected] = useState<EndpointDoc>(ENDPOINTS[0])
  const [values,   setValues]   = useState<Record<string, string>>({})
  const [loading,  setLoading]  = useState(false)
  const [response, setResponse] = useState<string | null>(null)
  const [status,   setStatus]   = useState<number | null>(null)
  const [filter,   setFilter]   = useState('')

  const filtered = ENDPOINTS.filter(e =>
    e.name.toLowerCase().includes(filter.toLowerCase()) ||
    e.category.toLowerCase().includes(filter.toLowerCase())
  )

  const selectEndpoint = (ep: EndpointDoc) => {
    setSelected(ep)
    setValues({})
    setResponse(null)
    setStatus(null)
  }

  const handleSend = async () => {
    setLoading(true)
    setResponse(null)
    try {
      const qs  = new URLSearchParams(Object.fromEntries(Object.entries(values).filter(([, v]) => v))).toString()
      const url = `${API_BASE}${selected.path}${qs ? '?' + qs : ''}`
      const res = await fetch(url, { method: selected.method })
      setStatus(res.status)
      setResponse(JSON.stringify(await res.json(), null, 2))
    } catch (e: any) {
      setResponse(e.message)
      setStatus(500)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex h-screen overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-72 border-r border-white/10 flex flex-col shrink-0">
        <div className="p-4 border-b border-white/10">
          <Link href="/" className="text-xs text-gray-500 hover:text-gray-300 block mb-3">← Home</Link>
          <h1 className="font-bold text-lg">Playground</h1>
          <input
            type="text"
            placeholder="Cari endpoint..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="mt-3 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {CATEGORIES.map(cat => {
            const eps = filtered.filter(e => e.category === cat)
            if (!eps.length) return null
            return (
              <div key={cat} className="mb-3">
                <div className="text-xs text-gray-500 font-semibold px-2 py-1">{cat}</div>
                {eps.map(ep => (
                  <button
                    key={ep.slug}
                    onClick={() => selectEndpoint(ep)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${selected.slug === ep.slug && selected.category === ep.category ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-gray-300'}`}
                  >
                    <span className={`text-xs font-mono ${ep.method === 'GET' ? 'text-green-400' : 'text-blue-400'}`}>{ep.method}</span>
                    {ep.name}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-sm font-mono font-bold px-2 py-1 rounded ${selected.method === 'GET' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
              {selected.method}
            </span>
            <code className="font-mono text-indigo-300">{selected.path}</code>
          </div>
          <h2 className="text-2xl font-bold mb-1">{selected.name}</h2>
          <p className="text-gray-400 mb-8">{selected.desc}</p>

          <div className="space-y-3 mb-6">
            {selected.params.map(p => (
              <div key={p.name}>
                <label className="block text-xs text-gray-400 mb-1 font-mono">
                  {p.name}{p.required && <span className="text-red-400 ml-1">*</span>}
                  <span className="text-gray-600 ml-2">— {p.description}</span>
                </label>
                <input
                  type="text"
                  placeholder={p.description}
                  value={values[p.name] ?? ''}
                  onChange={e => setValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleSend}
            disabled={loading}
            className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold transition-all mb-8"
          >
            {loading ? 'Sending...' : 'Send Request'}
          </button>

          {response && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-semibold">Response</span>
                <span className={`text-xs px-2 py-1 rounded font-mono ${status && status < 300 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  HTTP {status}
                </span>
              </div>
              <pre className="bg-black/50 border border-white/10 rounded-2xl p-5 text-xs font-mono text-gray-300 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                {response}
              </pre>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
