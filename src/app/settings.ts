import type { Mode } from '../core/audio-engine'
import type { RoleId } from '../core/content'
import type { Tolerance } from '../core/scorer'
import { production } from '../production'

export type Route = '#/start' | '#/songs' | '#/text' | `#/text/${string}` | `#/practice/${string}` | `#/results/${string}`

/** Text practice (dialog trainer). */
export interface DialogSettings {
  /** Own line: shown, first words, hidden. */
  hint: 'show' | 'start' | 'hide'
  /** Silence after speech before the cue moves on, 500..3000. */
  silenceMs: number
  /** Playback rate of the other roles, 0.8..1.3. */
  rate: number
  showDirections: boolean
  loopScene: boolean
}

/** Where a role set stopped last; `at` = epoch ms. */
export interface DialogPosition {
  sceneId: string
  itemId: string
  at: number
}

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
  /** Last tab of the mode switch. */
  tab: 'songs' | 'text'
  dialog: DialogSettings
  /** Per role set (roleSetKey). */
  dialogPositions: Record<string, DialogPosition>
}

/** Key of a role set in dialogPositions: order does not matter. */
export const roleSetKey = (roles: RoleId[]): string => [...roles].sort().join(',')

const KEY = `${production.storageId}.settings`
const DIALOG: DialogSettings = { hint: 'start', silenceMs: 1200, rate: 1, showDirections: true, loopScene: false }
const DEFAULTS: Settings = {
  tolerance: 50,
  delayMs: null,
  headphoneSheetSeen: false,
  installHintSeen: false,
  roles: [],
  mode: 'all',
  micDeviceId: '',
  tab: 'songs',
  dialog: DIALOG,
  dialogPositions: {},
}

export const settings = {
  get(): Settings {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}')
      return { ...DEFAULTS, ...stored, dialog: { ...DIALOG, ...stored.dialog } }
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
