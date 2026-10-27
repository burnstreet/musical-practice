// Playwright web server: build the app, add the synthetic encrypted fixture, serve it.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { build, preview } from 'vite'

const venv = process.platform === 'win32' ? 'tools/.venv/Scripts/python.exe' : 'tools/.venv/bin/python'
const python = existsSync(venv) ? venv : 'python'

await build({ logLevel: 'warn' })
const r = spawnSync(python, ['e2e/fixture.py', 'dist', 'e2e/.tmp'], { stdio: 'inherit' })
if (r.status !== 0) process.exit(1)
const server = await preview({ preview: { port: 4174, strictPort: true, host: '127.0.0.1' } })
server.printUrls()
