import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Ở local, web chạy ở 5173 còn API ở 4000 — proxy để app gọi
    // `/api` như khi deploy, nên không phải đổi code nào.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
