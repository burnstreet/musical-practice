/** Keeps the screen on while something plays. Missing support or a refusal is ignored. */
export function createWakeLock(nav: Navigator = navigator, doc: Document = document) {
  let want = false
  let lock: WakeLockSentinel | null = null
  let asking = false

  async function acquire() {
    if (!want || lock || asking || doc.visibilityState !== 'visible' || !nav.wakeLock) return
    asking = true
    try {
      const l = await nav.wakeLock.request('screen')
      if (!want) return void l.release().catch(() => {})
      lock = l
      l.addEventListener('release', () => {
        if (lock === l) lock = null
      })
    } catch {
      /* ignore refusal */
    } finally {
      asking = false
    }
  }

  // the browser drops the lock when the tab is hidden: ask again on return
  doc.addEventListener('visibilitychange', () => void acquire())

  return {
    set(on: boolean) {
      want = on
      if (on) void acquire()
      else {
        lock?.release().catch(() => {})
        lock = null
      }
    },
  }
}

/** Shared by all screens. */
export const wake = createWakeLock()
