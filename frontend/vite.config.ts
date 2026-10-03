import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const apiBaseUrl = env.VITE_API_BASE_URL || '/api'
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:5340'

  return {
    server: {
      proxy: apiBaseUrl.startsWith('/')
        ? {
            '/api': backendUrl,
            '/health': backendUrl,
            '/ping': backendUrl,
          }
        : undefined,
    },
  }
})
