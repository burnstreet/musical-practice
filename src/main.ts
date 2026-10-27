// Composition root: real modules wired once, handed to <gu-app>.
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-700.css'
import './app/fonts.css'
import './app/tokens.css'
import { createAudioEngine } from './core/audio-engine'
import { createHistory } from './core/history'
import { createLibrary } from './core/library'
import { createPitchEngine } from './core/pitch-engine'
import { createVault } from './core/vault'
import { isIosSafariTab } from './app/platform'
import { GuApp } from './app/shell'
import { registerSw } from './app/sw-register'

const vault = createVault()
GuApp.deps = {
  vault,
  library: createLibrary({ vault }),
  history: createHistory({ vault }),
  engine: createAudioEngine(),
  pitch: createPitchEngine(),
  sw: registerSw(),
  isIosSafariTab: () =>
    isIosSafariTab(
      navigator.userAgent,
      matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
      navigator.maxTouchPoints,
    ),
}
document.body.append(new GuApp())
