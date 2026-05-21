import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    cssMinify: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Order matters: more specific patterns must come before generic ones
          if (id.includes('node_modules/@codemirror/lang-')) {
            return 'codemirror-langs';
          }
          if (id.includes('node_modules/marked')) {
            return 'marked';
          }
          if (id.includes('node_modules/@codemirror')) {
            return 'codemirror-core';
          }
        },
      },
    },
  },
})
