// Dev server with a production's songs (`./mp.ps1 dev` in a content repo, MP_PRODUCTION = its root).
// Code: Vite hot reload. Songs: packed with the local password "dev" into <root>/work/dev-content (git-ignored), served as
// content/, packed again when web/data or sources/config.json change, then the page reloads (its boot syncs the library).
// Only on localhost: the dev password guards nothing. `--lan` (a phone in the same network): listens on every address over
// HTTPS (the mic needs a secure context) with a mkcert certificate in <root>/work/dev-cert, and packs with a random password.
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, watch } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createServer } from 'vite'

const root = process.env.MP_PRODUCTION
if (!root) throw new Error('MP_PRODUCTION is not set: run ./mp.ps1 dev in the content repo')
const out = resolve(root, 'work/dev-content')
const venv = resolve(process.platform === 'win32' ? 'tools/.venv/Scripts/python.exe' : 'tools/.venv/bin/python')
const python = existsSync(venv) ? venv : 'python'
const lan = process.argv.includes('--lan')
const password = lan ? randomBytes(3).toString('hex') : 'dev'

function lanServer() {
  const dir = resolve(root, 'work/dev-cert')
  const [cert, key] = [join(dir, 'cert.pem'), join(dir, 'key.pem')]
  if (!existsSync(cert)) {
    const ips = Object.values(networkInterfaces())
      .flat()
      .filter((a) => a?.family === 'IPv4' && !a.internal)
      .map((a) => a.address)
    mkdirSync(dir, { recursive: true })
    execFileSync('mkcert', ['-cert-file', cert, '-key-file', key, 'localhost', ...ips], { stdio: 'inherit' })
  }
  return { host: true, https: { cert: readFileSync(cert), key: readFileSync(key) } }
}

const server = await createServer({
  server: lan ? lanServer() : {},
  plugins: [
    {
      name: 'dev-content',
      configureServer(s) {
        s.middlewares.use('/content', (req, res) => {
          const file = join(out, decodeURIComponent((req.url ?? '').split('?')[0]))
          const ok = file.startsWith(out + sep) && existsSync(file) && statSync(file).isFile()
          res.statusCode = ok ? 200 : 404
          res.setHeader('Cache-Control', 'no-store')
          res.end(ok ? readFileSync(file) : undefined)
        })
      },
    },
  ],
})
await server.listen()
server.printUrls()
console.log(`  Songs: unlock with the password "${password}"`)

let running = false
let again = false
function pack() {
  if (running) return void (again = true)
  running = true
  const started = Date.now()
  const p = spawn(python, [resolve('tools/pack.py'), '--out', out, '--cache', resolve(root, 'work/dev-cache')], {
    cwd: root,
    env: { ...process.env, PITCH_PASSWORD: password, PYTHONUTF8: '1' },
    stdio: 'inherit',
  })
  p.on('exit', (code) => {
    running = false
    console.log(`  pack ${code === 0 ? 'done' : `failed (exit ${code})`} in ${((Date.now() - started) / 1000).toFixed(1)} s`)
    if (code === 0) server.ws.send({ type: 'full-reload' })
    if (again) {
      again = false
      pack()
    }
  })
}

let timer
const soon = () => {
  clearTimeout(timer)
  timer = setTimeout(pack, 500) // the editor writes a song in several steps
}
watch(join(root, 'web/data'), (_, name) => {
  if (name && /\.(json|mp3)$/.test(name)) soon()
})
watch(join(root, 'sources/config.json'), soon)
pack()
