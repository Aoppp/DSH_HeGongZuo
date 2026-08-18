import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import runtimeDefinitions from '../../.runtime/account-agent-runtimes.json' with { type: 'json' }

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

const apiTarget = process.env.HEGONGZUO_API_URL ?? 'http://127.0.0.1:4174'

const platformProxy = {
  ...agentProxy,
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
