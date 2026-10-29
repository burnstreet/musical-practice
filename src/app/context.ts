import type { AudioEngine } from '../core/audio-engine'
import type { History } from '../core/history'
import type { Library } from '../core/library'
import type { PitchEngine } from '../core/pitch-engine'
import type { Session } from '../core/session'
import type { LoadedSong } from '../core/types'
import type { Vault } from '../core/vault'
import type { RepeatState } from './repeat'
import type { Route, settings } from './settings'

export type { Route }

/** Service worker control. Real one in sw-register.ts, fakes in tests. */
export interface SwControl {
  /** Activates a worker installed during an earlier run. True once the new worker is in charge (show the toast). */
  activateWaiting(): Promise<boolean>
}

/** What the composition root (main.ts) or a test hands to `<gu-app>`. */
export interface ShellDeps {
  vault: Vault
  library: Library
  history: History
  engine: AudioEngine
  pitch: PitchEngine
  sw: SwControl
  isIosSafariTab(): boolean
}

/** What screens use. Shell builds it from ShellDeps and adds the shell-owned methods. */
export interface AppContext extends ShellDeps {
  settings: typeof settings
  route(to: Route): void
  /** Set by the practice screen on enter; shell clears it on routes to songs/start. */
  live: { songId: string; song: LoadedSong; session: Session; repeat?: RepeatState } | null
  openSettings(): void
  /** Resolves when the singer may play (sheet confirmed or already seen). */
  ensureHeadphoneSheet(): Promise<void>
}

let current: AppContext | null = null

/** Screens call this. Screen tests call setContext(fake) first. */
export function getContext(): AppContext {
  if (!current) throw new Error('AppContext not set')
  return current
}

export function setContext(c: AppContext): void {
  current = c
}
