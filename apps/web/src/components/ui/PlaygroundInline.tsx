'use client'

import { useState } from 'react'
import type { EndpointDoc } from '@lumina/types'

interface Props {
  endpoint: EndpointDoc
  apiBase:  string
}

export default function PlaygroundInline({ endpoint, apiBase }: Props) {
  const [values,   setValues]   = useState<Record<string, string>>({})
  const [loading,  setLoading]  = useState(false)
  const [response, setResponse] = useState<string | null>(null)
  const [status,   setStatus]   = useState<number | null>(null)

  const handleSubmit = async () => {
    setLoading(true)
    setResponse(null)
    try {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(values).filter(([, v]) => v))
      ).toString()
      const url  = `${apiBase}${endpoint.path}${qs ? '?' + qs : ''}`
      const res  = await fetch(url, { method: endpoint.method })
      const data = await res.json()
      setStatus(res.status)
      setResponse(JSON.stringify(data, null, 2))
    } catch (e: any) {
      setResponse(e.message)
      setStatus(500)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-5">
      {/* Inputs */}
      <div className="grid gap-3">
        {endpoint.params.map(p => (
          <div key={p.name}>
            <label className="block text-xs text-gray-400 mb-1 font-mono">
              {p.name}
              {p.required && <span className="text-red-400 ml-1">*</span>}
            </label>
            <input
              type="text"
              placeholder={p.description ?? p.name}
              value={values[p.name] ?? ''}
              onChange={e => setValues(prev => ({ ...prev, [p.name]: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        ))}
      </div>

      {/* Button */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-wait font-semibold text-sm transition-all"
      >
        {loading ? 'Sending...' : `Send ${endpoint.method} Request`}
      </button>

      {/* Response */}
      {response && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-400">Response</span>
            <span className={`text-xs px-2 py-0.5 rounded font-mono ${status && status < 300 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {status}
            </span>
          </div>
          <pre className="bg-black/40 rounded-xl p-4 text-xs font-mono text-gray-300 overflow-x-auto max-h-72 overflow-y-auto whitespace-pre-wrap">
            {response}
          </pre>
        </div>
      )}
    </div>
  )
}
