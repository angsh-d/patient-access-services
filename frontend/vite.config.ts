import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 9001,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:9002',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:9002',
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'framer-motion'],
  },
})
