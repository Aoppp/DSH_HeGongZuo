import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.HEGONGZUO_API_URL ?? 'http://127.0.0.1:4174'

const platformProxy = {
  '/api/employee-agent': {
    target: apiTarget,
    changeOrigin: true,
    ws: true,
  },
  '/api/auth': {
    target: apiTarget,
    changeOrigin: true,
  },
  '/api/accounts': {
    target: apiTarget,
    changeOrigin: true,
  },
  '/api/employees': {
    target: apiTarget,
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    strictPort: true,
    proxy: platformProxy,
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: platformProxy,
  },
})
