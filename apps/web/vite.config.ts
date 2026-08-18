import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import runtimeDefinitions from '../../config/account-agent-runtimes.json' with { type: 'json' }

const agentProxy = Object.fromEntries(runtimeDefinitions.map((runtime) => {
  const target = `http://127.0.0.1:${runtime.port}`

  return [runtime.apiBasePath, {
    target,
    changeOrigin: true,
    ws: true,
    headers: {
      origin: target,
    },
    rewrite: (requestPath: string) => requestPath.replace(runtime.apiBasePath, ''),
  }]
}))

const platformProxy = {
  ...agentProxy,
  '/api/employees': {
    target: process.env.HEGONGZUO_API_URL ?? 'http://127.0.0.1:4174',
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
