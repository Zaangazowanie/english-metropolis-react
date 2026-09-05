import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Keep review exports and lazy gameplay exports in one predictable shell chunk.
// Normalize separators because the production host and local worktrees differ.
function shellChunkName(moduleId) {
  const id = moduleId.replaceAll('\\', '/')
  const m = id.match(/\/src\/practice\/shells\/([A-Za-z0-9_]+)\.tsx?$/)
  if (m) return `shell-${m[1]}`
  // One lazy entry chunk per Three game; dependencies are shared separately.
  const g = id.match(/\/src\/practice\/shells3d\/([A-Za-z0-9_]+)\.tsx?$/)
  if (g) return `game3d-${g[1]}`
  // 2026-06-20 (Claude): English Metro WorldKit — the explorable 3D hub that
  // hosts per-game district portals. Separate from per-game game3d-* chunks;
  // budgeted under CONTRACT Addendum A (world chunk ≤ 600 KB gz).
  if (/\/src\/world\//.test(id)) return 'world-englishmetro'
  return null
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
    rolldownOptions: {
      // Explicit chunk membership must not change module execution order.
      preserveEntrySignatures: 'allow-extension',
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          // Rolldown's manualChunks compatibility mode recursively captures
          // dependencies. The first game then swallowed React, Three and the
          // shared stage, making every page import that game's 300 KB chunk.
          includeDependenciesRecursively: false,
          groups: [
            {
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: 'vendor-three',
              test: /[\\/]node_modules[\\/](three(?:-[^\\/]+)?|@react-three[\\/][^\\/]+)[\\/]/,
              priority: 20,
            },
            { name: shellChunkName, priority: 10 },
            {
              // Shared controllers and stage helpers must not fall back into
              // the app entry and make lazy chunks import that entry again.
              // Group by actual entry users so unrelated games stay lazy.
              name: 'shared',
              minShareCount: 2,
              entriesAware: true,
              priority: 0,
            },
          ],
        },
      },
    },
  },
})
