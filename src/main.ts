// Composition root: real modules wired once, handed to <gu-app>.
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-700.css'
import './app/fonts.css'
import './app/tokens.css'
import { isIosSafariTab } from './app/platform'
import { settings } from './app/settings'
import { GuApp } from './app/shell'
import { registerSw } from './app/sw-register'
import { createAudioEngine } from './core/audio-engine'
import { createHistory } from './core/history'
import { createLibrary } from './core/library'
import { createPitchEngine } from './core/pitch-engine'
import { createVault } from './core/vault'

const vault = createVault()
const pitch = createPitchEngine()
pitch.setDelayMs(settings.get().delayMs)
GuApp.deps = {
  vault,
  library: createLibrary({ vault }),
  history: createHistory({ vault }),
  engine: createAudioEngine(),
  pitch,
  sw: registerSw(),
  isIosSafariTab: () =>
    isIosSafariTab(
      navigator.userAgent,
      matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
      navigator.maxTouchPoints,
    ),
}
document.body.append(new GuApp())
