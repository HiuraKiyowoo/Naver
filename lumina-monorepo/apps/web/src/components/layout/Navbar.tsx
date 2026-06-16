'use client'
import Link from 'next/link'
import { useState } from 'react'

export default function Navbar() {
  const [open, setOpen] = useState(false)
  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-gray-950/80 backdrop-blur border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <span className="text-lumina-500">⚡</span>
          <span>Lumina<span className="text-lumina-500">API</span></span>
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
          <Link href="/docs"       className="hover:text-white transition-colors">Docs</Link>
          <Link href="/playground" className="hover:text-white transition-colors">Playground</Link>
          <a href="https://github.com/hiuraaaaa" target="_blank" className="hover:text-white transition-colors">GitHub</a>
          <Link href="/docs" className="btn-primary text-sm py-2">Get Started</Link>
        </div>
        <button onClick={() => setOpen(!open)} className="md:hidden text-gray-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
          </svg>
        </button>
      </div>
      {open && (
        <div className="md:hidden px-4 pb-4 flex flex-col gap-3 text-sm text-gray-400 border-t border-gray-800 pt-4">
          <Link href="/docs"       onClick={() => setOpen(false)}>Docs</Link>
          <Link href="/playground" onClick={() => setOpen(false)}>Playground</Link>
          <a href="https://github.com/hiuraaaaa" target="_blank">GitHub</a>
        </div>
      )}
    </nav>
  )
}
