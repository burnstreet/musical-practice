import { expect } from 'vitest'
import { steps } from '../gherkin'
import { createVault, type VaultRecord, type VaultStore } from '../../src/core/vault'
import type { Manifest } from '../../src/core/content'

// fake-indexeddb cannot clone a CryptoKey, so steps inject an in-memory store.
const memStore = (): VaultStore => {
  let rec: VaultRecord | undefined
  return { get: async () => rec, put: async (r) => void (rec = r), delete: async () => void (rec = undefined) }
}

const SALT = Buffer.alloc(16, 7)
const LIBRARY = JSON.stringify({ roles: [], songs: [] })
const manifest = (keyId = '0123456789abcdef'): Manifest => ({ format: 1, build: 'x', keyId, salt: SALT.toString('base64'), iterations: 1000, library: 'fedcba9876543210', songCount: 0, totalBytes: 0, files: {} })

async function encrypt(password: string, text: string): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: SALT, iterations: 1000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)))
  return new Uint8Array([...iv, ...ct]).buffer
}

export default steps(({ Given, When, Then }) => {
  const setup = async (ctx: any, keyId?: string) => {
    ctx.store = memStore()
    ctx.manifest = manifest(keyId)
    ctx.cipher = await encrypt('cast2026', LIBRARY)
    ctx.vault = createVault(ctx.store)
  }
  const unlock = async (ctx: any, pw: string) => { ctx.result = await ctx.vault.unlock(pw, ctx.manifest, ctx.cipher) }
  const recreate = (ctx: any) => { ctx.vault = createVault(ctx.store) }

  Given(/^a manifest and a library blob encrypted with password "([^"]*)"$/, async (ctx) => { await setup(ctx) })
  Given(/^I unlocked with "([^"]*)"$/, async (ctx, pw) => { await setup(ctx); await unlock(ctx, pw) })
  Given(/^I unlocked with "([^"]*)" against a manifest with keyId "([^"]*)"$/, async (ctx, pw, id) => { await setup(ctx, id); await unlock(ctx, pw) })
  Given(/^I unlocked with "([^"]*)" and a wipe hook is registered$/, async (ctx, pw) => {
    await setup(ctx)
    await unlock(ctx, pw)
    ctx.wiped = 0
    ctx.vault.onWipe(async () => { ctx.wiped++ })
  })

  When(/^I unlock with "([^"]*)"$/, async (ctx, pw) => { await unlock(ctx, pw) })
  When(/^the vault is re-created and init runs with the same manifest$/, async (ctx) => { recreate(ctx); await ctx.vault.init(ctx.manifest) })
  When(/^the vault is re-created and init runs with manifest null$/, async (ctx) => { recreate(ctx); await ctx.vault.init(null) })
  When(/^the vault is re-created and init runs with a manifest with keyId "([^"]*)"$/, async (ctx, id) => { recreate(ctx); await ctx.vault.init(manifest(id)) })
  When(/^I lock$/, async (ctx) => { await ctx.vault.lock() })

  Then(/^the result is "([^"]*)" and the state is "([^"]*)"$/, (ctx, r, s) => {
    expect(ctx.result).toBe(r)
    expect(ctx.vault.state()).toBe(s)
  })
  Then(/^decrypt of the library blob yields valid library JSON$/, async (ctx) => {
    const plain = await ctx.vault.decrypt(ctx.cipher)
    expect(JSON.parse(new TextDecoder().decode(plain))).toEqual({ roles: [], songs: [] })
  })
  Then(/^decrypt throws$/, async (ctx) => { await expect(ctx.vault.decrypt(ctx.cipher)).rejects.toThrow() })
  Then(/^the state is "([^"]*)" without entering a password$/, (ctx, s) => { expect(ctx.vault.state()).toBe(s) })
  Then(/^the state is "([^"]*)"$/, (ctx, s) => { expect(ctx.vault.state()).toBe(s) })
  Then(/^no key is stored$/, async (ctx) => { expect(await ctx.store.get()).toBeUndefined() })
  Then(/^the state is "([^"]*)", decrypt throws, and the wipe hook ran once$/, async (ctx, s) => {
    expect(ctx.vault.state()).toBe(s)
    await expect(ctx.vault.decrypt(ctx.cipher)).rejects.toThrow()
    expect(ctx.wiped).toBe(1)
  })
})
