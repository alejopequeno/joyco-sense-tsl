import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Every test in this project is pure CPU work — geometry construction and
    // scalar math. No DOM, no GPU.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
