# Lumina Monorepo

Monorepo untuk **Lumina API** — Free REST API untuk AI Chat, Downloader, Tools, Anime, dan banyak lagi.

## Structure

```
lumina-monorepo/
├── apps/
│   ├── api/          → Hono.js backend (TypeScript)
│   └── web/          → Next.js 14 frontend (SEO-ready)
├── packages/
│   ├── types/        → Shared TypeScript types
│   └── utils/        → Shared fetch helpers
├── turbo.json
└── package.json
```

## Tech Stack

| Layer     | Tech                              |
|-----------|-----------------------------------|
| Backend   | Hono.js + TypeScript + Zod        |
| Frontend  | Next.js 14 App Router + Tailwind  |
| Database  | Firebase Firestore                |
| Deploy    | Vercel (separate projects)        |
| Monorepo  | Turborepo                         |

## Quick Start

```bash
# Install semua dependencies
npm install

# Jalanin semua sekaligus
npm run dev

# Atau per app
cd apps/api && npm run dev     # http://localhost:3000
cd apps/web && npm run dev     # http://localhost:3001
```

## Setup Environment

```bash
# apps/api
cp .env.example .env
# Isi FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
```

## Cara Tambah Route Baru

1. Buat file di `apps/api/src/routes/<category>/<nama>.ts`
2. Export `meta` dan `default` (Hono app)
3. Import & mount di `apps/api/src/index.ts`
4. Tambah entry di `apps/web/src/lib/endpoints.ts`

Route langsung auto-SEO karena setiap endpoint punya halaman SSG di `/docs/<category>/<slug>`.

## Deploy ke Vercel

```bash
# Deploy API
cd apps/api && vercel --prod

# Deploy Web (set NEXT_PUBLIC_API_URL ke domain API)
cd apps/web && vercel --prod
```

## Rate Limits

- 60 request/menit per IP
- IP bisa di-blacklist via Firestore collection `blacklist`
- Endpoint bisa di-disable via Firestore `endpoints_status`
- API key support via Firestore `apikeys`
