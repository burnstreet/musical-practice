import type { Mode } from '../core/audio-engine'
import type { RoleId } from '../core/content'
import type { Tolerance } from '../core/scorer'

export type Route = '#/start' | '#/songs' | `#/practice/${string}` | `#/results/${string}`

export interface Settings {
  tolerance: Tolerance
  /** Total delay for scoring, ms, 0..1500; null = as the browser reports it. */
  delayMs: number | null
  headphoneSheetSeen: boolean
  installHintSeen: boolean
  roles: RoleId[]
  mode: Mode
  /** Mic input device, '' = auto (the phone's built-in mic). */
  micDeviceId: string
}

const KEY = 'gu.settings'
const DEFAULTS: Settings = { tolerance: 50, delayMs: null, headphoneSheetSeen: false, installHintSeen: false, roles: [], mode: 'all', micDeviceId: '' }

export const settings = {
  get(): Settings {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    } catch {
      return { ...DEFAULTS }
    }
  },
  set(p: Partial<Settings>): void {
    localStorage.setItem(KEY, JSON.stringify({ ...settings.get(), ...p }))
  },
  reset(): void {
    localStorage.removeItem(KEY)
  },
}
