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
  // 2026-06-12 (Ricky): 3D game shells (Fluent City arcade) — same one-chunk-
  // per-shell rule, plus a single shared vendor chunk for the three.js stack
  // so the engine downloads once and every game reuses the cached copy.
  const g = id.match(/\/src\/practice\/shells3d\/([A-Za-z0-9_]+)\.tsx?$/)
  if (g) return `game3d-${g[1]}`
  // 2026-06-20 (Claude): English Metro WorldKit — the explorable 3D hub that
  // hosts per-game district portals. Separate from per-game game3d-* chunks;
  // budgeted under CONTRACT Addendum A (world chunk ≤ 600 KB gz).
  if (/\/src\/world\//.test(id)) return 'world-englishmetro'
  if (/\/node_modules\/(three|@react-three)\//.test(id)) return 'vendor-three'
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
    // Vite inlines assets under 4 KB as data: URIs. The site's CSP is
    // `font-src 'self'`, so every inlined @font-face subset was refused and
    // logged "Loading the font 'data:font/woff2...'" 13 times on every page
    // (2026-09-03 crawl). Keep fonts as files; everything else may inline.
    assetsInlineLimit: (filePath) => !/\.(woff2?|ttf|otf|eot)$/i.test(filePath),
    rollupOptions: {
      output: {
        manualChunks: shellManualChunks,
      },
    },
  },
})
