import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // HTTP API routes — proxied to backend container (Docker internal hostname)
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      // WebSocket upgrade for ingestion progress — MUST be a separate entry with ws: true
      // Without this, browser WebSocket connects to vite dev server (wrong host in Docker)
      '/api/v1/knowledge/progress': {
        target: 'ws://backend:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
