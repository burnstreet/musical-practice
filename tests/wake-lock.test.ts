import { describe, expect, it } from 'vitest'
import { createWakeLock } from '../src/app/wake-lock'

function setup(opts: { missing?: boolean; refuse?: boolean } = {}) {
  const t = { requests: 0, releases: 0, visible: true, last: null as WakeLockSentinel | null }
  const doc = new EventTarget() as unknown as Document
  Object.defineProperty(doc, 'visibilityState', { get: () => (t.visible ? 'visible' : 'hidden') })
  const nav = {
    wakeLock: opts.missing
      ? undefined
      : {
          request: async () => {
            t.requests++
            if (opts.refuse) throw new Error('denied')
            const sentinel = new EventTarget() as unknown as WakeLockSentinel
            sentinel.release = async () => {
              t.releases++
              sentinel.dispatchEvent(new Event('release'))
            }
            t.last = sentinel
            return sentinel
          },
        },
  } as unknown as Navigator
  const flush = () => new Promise((r) => setTimeout(r, 0))
  const hide = (visible: boolean) => {
    t.visible = visible
    doc.dispatchEvent(new Event('visibilitychange'))
  }
  return { t, lock: createWakeLock(nav, doc), flush, hide }
}

describe('wake lock', () => {
  it('asks while on and lets go when off', async () => {
    const { t, lock, flush } = setup()
    lock.set(true)
    lock.set(true)
    await flush()
    expect(t.requests).toBe(1)
    lock.set(false)
    await flush()
    expect(t.releases).toBe(1)
  })

  it('asks again when the tab returns while still on', async () => {
    const { t, lock, flush, hide } = setup()
    lock.set(true)
    await flush()
    t.last!.dispatchEvent(new Event('release')) // the browser drops it in the background
    hide(false)
    hide(true)
    await flush()
    expect(t.requests).toBe(2)
  })

  it('does not hold the lock when switched off before the browser answered', async () => {
    const { t, lock, flush } = setup()
    lock.set(true)
    lock.set(false)
    await flush()
    expect(t.releases).toBe(t.requests)
  })

  it('does nothing without browser support or when refused', async () => {
    for (const o of [{ missing: true }, { refuse: true }]) {
      const { lock, flush } = setup(o)
      lock.set(true)
      await flush()
      lock.set(false)
    }
  })
})
