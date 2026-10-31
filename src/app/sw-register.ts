import { Workbox } from 'workbox-window'
import { production } from '../production'
import type { SwControl } from './context'

const UPDATED = `${production.storageId}.sw-updated`

/**
 * Real worker control. A worker that installed during an earlier run is still waiting at this launch:
 * it is told to skip waiting and the page reloads once onto the new version; the reloaded launch reports true.
 * Workers installing mid-run are left waiting, so practice is never interrupted.
 */
export function registerSw(url = `${import.meta.env.BASE_URL}sw.js`): SwControl {
  return {
    async activateWaiting() {
      if (!('serviceWorker' in navigator)) return false
      const updated = sessionStorage.getItem(UPDATED) === '1'
      sessionStorage.removeItem(UPDATED)
      const wb = new Workbox(url)
      wb.addEventListener('waiting', (e) => {
        if (!e.wasWaitingBeforeRegister) return
        sessionStorage.setItem(UPDATED, '1')
        wb.addEventListener('controlling', () => location.reload())
        wb.messageSkipWaiting()
      })
      void wb.register()
      return updated
    },
  }
}
