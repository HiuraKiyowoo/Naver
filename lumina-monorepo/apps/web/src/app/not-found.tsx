import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <div className="text-8xl font-bold gradient-text mb-4">404</div>
      <h1 className="text-2xl font-semibold mb-2">Halaman tidak ditemukan</h1>
      <p className="text-gray-400 mb-8">Endpoint atau halaman yang kamu cari tidak ada.</p>
      <div className="flex gap-3">
        <Link href="/" className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold transition-all">Home</Link>
        <Link href="/docs" className="px-5 py-2.5 rounded-xl glass hover:bg-white/10 font-semibold transition-all">Docs</Link>
      </div>
    </main>
  )
}
