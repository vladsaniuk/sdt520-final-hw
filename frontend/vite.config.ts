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
      // HTTP API routes — configure agent to disable keep-alive so proxy
      // re-resolves the backend hostname on every request (avoids 502 after restart)
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if ('writeHead' in res) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'backend_unavailable' }))
            }
          })
        },
        agent: new (require('http').Agent)({ keepAlive: false }),
      },
    },
  },
})
