import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:9090',
        ws: true,
        rewriteWsPath: (path) => path.replace('/ws', '')
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'static',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'antd-vendor': ['antd']
        }
      }
    },
    chunkSizeWarningLimit: 3000
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api/tianditu': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tianditu/, '/api/tianditu')
      },
      '/api': {
        target: 'http://192.168.3.121:5000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://192.168.3.121:9000',
        ws: true,
        rewriteWsPath: (path) => path.replace('/ws', '')
      }
    }
  },
  optimizeDeps: {
    include: ['cesium', 'three'],
    exclude: ['mars3d']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify('/Cesium/')
  },
  publicDir: 'public'
})
