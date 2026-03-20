import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    base: '/admin/',
    
    server: {
      port: 5174,
      host: '0.0.0.0',
      allowedHosts: [
        'admin.seardao.org',
        '47.243.83.253',
        '47.82.73.79',
        'tezbarakat.com',
        'localhost'
      ],
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
          chunkFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
          assetFileNames: `assets/[name]-[hash]-${Date.now()}.[ext]`
        }
      }
    },
    
    // 确保环境变量在构建时可用
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || 'https://qcrcgpwlfouqslokwbzl.supabase.co'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2b3V2amtyZXhvd3R1am5xdG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MjEzOTgsImV4cCI6MjA4MzQ5NzM5OH0.-fb0nWhyAMdmzKBIzNqV0gXoANT7rPMmwYCwiszd7jM'),
      'import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY': JSON.stringify(env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2b3V2amtyZXhvd3R1am5xdG5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzkyMTM5OCwiZXhwIjoyMDgzNDk3Mzk4fQ.9Dkzh2A1bmYF1NM_rxQInLhD_fPsBEFY-RwkEAJb_-I'),
    }
  }
})
