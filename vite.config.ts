import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// Second entry: `vite build --mode editor` bundles the editor view (staff shared with the player) for the vanilla editor in web/.
const editor = {
  publicDir: false as const,
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
        plugins: [
          VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src/app',
            filename: 'sw.ts',
            injectRegister: false, // the shell registers via workbox-window (src/app/sw-register.ts)
            injectManifest: {
              globPatterns: ['**/*.{html,js,css,woff2}'], // manifest and its icons are added by the plugin
              globIgnores: ['content/**'], // library stores content in IndexedDB
            },
            manifest: {
              name: 'LKG Musical 2026',
              short_name: 'LKG Musical 2026',
              lang: 'de',
              display: 'standalone',
              orientation: 'any', // turned sideways the practice screen shows more bars and seconds ahead
              start_url: './',
              theme_color: '#1F5FAB',
              background_color: '#1F5FAB',
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                // content stays inside the 80 % safe circle (tools/make_icons.py), so launchers may mask it
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
