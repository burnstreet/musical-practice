import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    viewport: { width: 430, height: 900 },
    permissions: ['microphone'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${resolve('e2e/.tmp/mic.wav')}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: { command: 'node e2e/start.mjs', url: 'http://127.0.0.1:4174', timeout: 180_000, reuseExistingServer: false },
})
