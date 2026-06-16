import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@lumina/types'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' }
    ]
  }
}

export default nextConfig
