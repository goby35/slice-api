import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

// Build config for a server-side Hono app. We use `ssr` build so Vite
// produces Node-compatible output and resolves TS path aliases.
export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    outDir: 'dist',
    ssr: true,
    rollupOptions: {
      // entry is src/index.ts
      input: 'src/index.ts',
      output: {
        entryFileNames: '[name].js'
      }
    },
    target: 'node18',
    minify: false
  },
  resolve: {
    conditions: ['node']
  }
})
