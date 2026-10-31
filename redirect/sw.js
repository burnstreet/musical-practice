// Kill switch for the app that used to live here: replaces the old worker, removes itself and reloads open pages onto the redirect.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Cache Storage is per origin: only the old app's caches (Workbox names them after this scope), never the new site's
      for (const key of await caches.keys()) if (key.includes(self.registration.scope)) await caches.delete(key)
      await self.registration.unregister()
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url)
    })(),
  )
})
