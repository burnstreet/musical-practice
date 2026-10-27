import { defineConfig } from 'vitest/config'

export default defineConfig({
  // web/ holds the old vanilla editor; keep it out of the app build
  publicDir: false,
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
})
