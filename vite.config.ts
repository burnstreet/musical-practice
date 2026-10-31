import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import { parseProduction } from './src/production-config'

// The production (content repo) this build is for: its production.json and public/ (logo, icons). Without MP_PRODUCTION: neutral defaults.
const productionDir = process.env.MP_PRODUCTION
const production = parseProduction(productionDir ? JSON.parse(readFileSync(join(productionDir, 'production.json'), 'utf8')) : {})
const publicDir = productionDir && existsSync(join(productionDir, 'public')) ? join(productionDir, 'public') : 'public'
const define = { __PRODUCTION__: JSON.stringify(production) }

// Second entry: `vite build --mode editor` bundles the editor view (staff shared with the player) for the vanilla editor in web/.
const editor = {
  publicDir: false as const,
  define,
  build: {
    lib: { entry: 'src/editor/view.ts', formats: ['es' as const], fileName: () => 'editor-view.js' },
    outDir: 'web/lib',
    emptyOutDir: true,
  },
}

export default defineConfig(({ mode }) =>
  mode === 'editor'
    ? editor
    : {
        // relative base: works under the GitHub Pages project path
        base: './',
        publicDir,
        define,
        plugins: [
          {
            name: 'production-title',
            transformIndexHtml: { order: 'pre' as const, handler: (html: string) => html.replaceAll('%MP_TITLE%', production.title) },
          },
          VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src/app',
            filename: 'sw.ts',
            injectRegister: false, // the shell registers via workbox-window (src/app/sw-register.ts)
            injectManifest: {
              globPatterns: ['**/*.{html,js,css,woff2}'], // manifest and its icons are added by the plugin
              globIgnores: ['content/**'], // the deploy adds content/; the library stores it in IndexedDB
            },
            manifest: {
              name: production.title,
              short_name: production.shortName,
              lang: 'de',
              display: 'standalone',
              orientation: 'any', // turned sideways the practice screen shows more bars and seconds ahead
              start_url: './',
              theme_color: '#1F5FAB',
              background_color: '#1F5FAB',
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                // icons keep their content inside the 80 % safe circle, so launchers may mask it
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
          }),
        ],
        test: {
          environment: 'happy-dom',
          include: ['tests/**/*.test.ts'],
          setupFiles: ['tests/setup.ts'],
        },
      },
)
