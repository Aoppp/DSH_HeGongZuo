import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.HEGONGZUO_API_URL ?? 'http://127.0.0.1:4174'

function iconFileName(componentName: string): string {
  return componentName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([A-Za-z])([0-9])/g, '$1-$2')
    .replace(/([0-9])([A-Za-z])/g, '$1-$2')
    .toLowerCase()
}

function directLucideImports(): Plugin {
  const lucideImport = /import\s*{([\s\S]*?)}\s*from\s*['"]lucide-react['"]/g
  return {
    name: 'hegongzuo-direct-lucide-imports',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/src/') || !code.includes("from 'lucide-react'") && !code.includes('from "lucide-react"')) return null
      const transformed = code.replace(lucideImport, (_statement, imported: string) => imported
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => `import ${name} from 'lucide-react/dist/esm/icons/${iconFileName(name)}.mjs'`)
        .join('\n'))
      return transformed === code ? null : { code: transformed, map: null }
    },
  }
}

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
  plugins: [directLucideImports(), react()],
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
