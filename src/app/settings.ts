import type { Mode } from '../core/audio-engine'
import type { RoleId } from '../core/content'
import type { Tolerance } from '../core/scorer'

export type Route = '#/start' | '#/songs' | `#/practice/${string}` | `#/results/${string}`

export interface Settings {
  tolerance: Tolerance
  micOffsetMs: number
  headphoneSheetSeen: boolean
  installHintSeen: boolean
  roles: RoleId[]
  mode: Mode
}

const KEY = 'gu.settings'
const DEFAULTS: Settings = { tolerance: 50, micOffsetMs: 0, headphoneSheetSeen: false, installHintSeen: false, roles: [], mode: 'all' }

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
