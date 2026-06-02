import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 2026-05-02 (Ricky): force every practice shell into its own deterministic
// chunk regardless of import shape (static vs lazy). Without this, Vite hits
// the INEFFECTIVE_DYNAMIC_IMPORT case for shells that are BOTH statically
// imported (for renderXReviewItem) AND lazy-imported (in the Shells map),
// producing TWO chunk references in the main bundle but only one chunk on
// disk -- a 404 race for the loser. manualChunks collapses each shell into
// a single chunk that satisfies both import sites.
function shellManualChunks(id) {
  const m = id.match(/\/src\/practice\/shells\/([A-Za-z0-9_]+)\.tsx?$/)
  if (m) return `shell-${m[1]}`
  return undefined
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: shellManualChunks,
      },
    },
  },
})
