import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath } from 'node:url'
import { resolve } from 'path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Vite config: sử dụng vite-tsconfig-paths để hiểu alias từ tsconfig
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: [
      // giữ song song với tsconfig paths; plugin đã xử lý, nhưng alias rõ ràng giúp dev tools
      { find: '@', replacement: resolve(__dirname, 'src') }
    ]
  }
})
