import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

// Minimal worker typing; the webworker lib clashes with DOM in the shared tsconfig.
declare const self: {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[]
  skipWaiting(): Promise<void>
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void
}

// App shell only; content/ is excluded in vite.config.ts (the library stores it in IndexedDB).
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// New versions wait until the shell asks at the next launch (see sw-register.ts).
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
