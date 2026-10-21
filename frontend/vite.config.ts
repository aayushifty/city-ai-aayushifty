import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    // three.js alone is ~600 kB minified and cannot be split further
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        // libraries change far less often than the app: separate chunks stay cached across rebuilds
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/three/examples/')) return 'three-addons'
          if (id.includes('/three/')) return 'three'
          if (id.includes('/react') || id.includes('/scheduler/')) return 'react'
          if (id.includes('/lucide-react/')) return 'icons'
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true
      }
    }
  }
})
