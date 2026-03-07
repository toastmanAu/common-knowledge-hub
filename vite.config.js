import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [preact()],
  root: '.',
  publicDir: 'assets',
  build: {
    outDir: 'dist/ui',
    emptyOutDir: true,
  },
  resolve: {
    alias: { 'react': 'preact/compat', 'react-dom': 'preact/compat' }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001'   // CKH backend API
    }
  }
});
