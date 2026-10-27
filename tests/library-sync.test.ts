import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { openDb } from '../src/core/db'
import { createLibrary } from '../src/core/library'
import type { Vault } from '../src/core/vault'

it('concurrent sync calls share one run', async () => {
  let manifestFetches = 0
  const fetch = (async () => {
    manifestFetches++
    return new Response(null, { status: 404 })
  }) as unknown as typeof globalThis.fetch
  const vault = { state: () => 'unlocked', onWipe: () => {} } as unknown as Vault
  const lib = createLibrary({ vault, fetch, db: () => openDb('gu-test-sync') })
  const a = lib.sync()
  expect(lib.sync()).toBe(a)
  await a
  expect(manifestFetches).toBe(1)
  await lib.sync() // finished run is not reused
  expect(manifestFetches).toBe(2)
})
