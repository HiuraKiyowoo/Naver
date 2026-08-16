import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/anime': {
        target: 'https://www.sankavollerei.com',
        changeOrigin: true,
      }
    }
  }
})
