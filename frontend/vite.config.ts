import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // WS rule MUST come before the generic /api rule — first match wins for upgrades
      '/api/v1/knowledge/progress': {
        target: 'ws://backend:8000',
        ws: true,
        changeOrigin: true,
      },
      // HTTP API routes
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
})
