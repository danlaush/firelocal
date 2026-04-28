import { defineConfig } from 'vite';

export default defineConfig({
  // Tell Vite not to pre-bundle sqlite-wasm — it ships its own WASM loader
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (used by sqlite-wasm's OPFS VFS)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
