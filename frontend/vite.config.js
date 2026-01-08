import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  root: './',
  publicDir: 'public',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'build',
  },
})
