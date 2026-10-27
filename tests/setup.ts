import { webcrypto } from 'node:crypto'

// Node's WebCrypto is the WebCrypto in tests (happy-dom's window may lack subtle)
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
