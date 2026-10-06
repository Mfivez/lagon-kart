import { defineConfig } from 'vite';
export default defineConfig({
  root: 'client',
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: { port: 5173, proxy: { '/matchmake': 'http://127.0.0.1:3000', '/healthz': 'http://127.0.0.1:3000', '^/(?!@|src|node_modules|assets|room|$)[^/]+/[^/]+$': { target: 'ws://127.0.0.1:3000', ws: true } } }
});
