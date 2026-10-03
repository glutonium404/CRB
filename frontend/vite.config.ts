import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:5340',
      '/health': 'http://localhost:5340',
      '/ping': 'http://localhost:5340',
    },
  },
})
