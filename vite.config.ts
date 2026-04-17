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
      allowedHosts: true,
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
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    },
    
    // 安全修复: 已移除 Service Role Key，仅保留 Anon Key
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || 'https://qcrcgpwlfouqslokwbzl.supabase.co'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjcmNncHdsZm91cXNsb2t3YnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MzMzMzcsImV4cCI6MjA4OTUwOTMzN30.KFR8C1O0BnGWvR6GSCCq8opP2EljMwwOQrtn8snXqM0'),
    }
  }
})
