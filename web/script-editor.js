// ---------- script view (the spoken script, see specs/script-editor.spec.md) ----------
// palette: role colours to start from; roles(): the config roles (or null); songs(): the config songs
import * as ops from './script-ops.js'

const $ = (id) => document.getElementById(id)
const el = (tag, props) => Object.assign(document.createElement(tag), props)

export function initScript({ palette, roles, songs }) {
  const SCRIPT_COLORS = [...palette, '#FFD166', '#F4B6C2', '#9AD0EC', '#E0C3A0']
  let script = null,
    scriptDirty = false,
    scriptMode = false,
    missing = new Set(),
    hashes = {},
    scriptSel = null, // id of the selected item
    cursor = 0, // caret offset in the selected item's text field
    cursorEnd = 0, // end of its text selection
    statusSeq = 0
  const rendering = new Set()
  const scriptPlayer = new Audio()
  const scriptMsg = (text, ok = false) => {
    $('status').className = ok ? 'ok' : ''
    $('status').textContent = text
  }
  const speakers = () => (roles() || []).filter((r) => r.speaks)
  const scriptColor = (role) =>
    SCRIPT_COLORS[
      Math.max(
        0,
        (roles() || []).findIndex((r) => r.id === role),
      ) % SCRIPT_COLORS.length
    ]
  const scriptItems = () => script.scenes.flatMap((sc) => sc.items)
  const findItem = (id) => scriptItems().find((it) => it.id === id)

  // the server knows the line hashes and which audio files exist; never hashed here
  async function scriptStatus() {
    const seq = ++statusSeq
    try {
      const r = await fetch('script-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(script) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (seq !== statusSeq) return
      missing = new Set(j.missing)
      hashes = j.hashes || {}
    } catch (e) {
      if (seq === statusSeq) scriptMsg(`Tonstatus nicht geladen (${e.message}). Run tools/serve.py.`)
    }
    showScript()
  }
  function scriptEdit(op, selectId) {
    try {
      script = op(script)
      scriptDirty = true
      if (selectId) scriptSel = selectId(script)
      scriptStatus()
    } catch (e) {
      scriptMsg(e.message)
    }
    showScript()
  }
  async function saveScript() {
    try {
      const r = await fetch('save/script.json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(script) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      scriptDirty = false
      scriptMsg(`Saved to ${j.saved} (copy: ${j.backup})`, true)
      scriptStatus()
    } catch (e) {
      scriptMsg(`Skript nicht gespeichert (${e.message}). Run tools/serve.py.`)
    }
    showScript()
  }
  async function playLine(id) {
    const h = hashes[id]
    if (!h || missing.has(id)) return
    scriptPlayer.src = `data/script/${h}.mp3`
    scriptPlayer.play().catch(() => {})
  }
  async function renderLine(id) {
    rendering.add(id)
    showScript()
    try {
      const r = await fetch('render-line', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: findItem(id) }) })
      if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`)
      const j = await r.json()
      hashes[id] = j.hash
      missing.delete(id)
      scriptPlayer.src = `data/script/${j.hash}.mp3`
      scriptPlayer.play().catch(() => {})
      scriptMsg('')
    } catch (e) {
      scriptMsg(`Neu sprechen fehlgeschlagen: ${e.message}`)
    }
    rendering.delete(id)
    scriptStatus()
  }

  // ids to show: filtered by scene, by role (the role's lines plus their neighbours) and by missing audio
  function visibleIds(scene) {
    const role = $('scriptRole').value,
      only = $('scriptMissing').checked
    const it = scene.items
    const near = new Set()
    it.forEach((x, i) => {
      if (x.role === role) for (const k of [i - 1, i, i + 1]) if (it[k]) near.add(it[k].id)
    })
    return new Set(it.filter((x) => (!role || near.has(x.id)) && (!only || (x.type === 'line' && missing.has(x.id)))).map((x) => x.id))
  }
  function scriptRow(it) {
    const row = el('div', { className: `srow ${it.type}${it.id === scriptSel ? ' picked' : ''}` })
    row.onclick = () => {
      if (scriptSel === it.id) return
      scriptSel = it.id
      cursor = cursorEnd = 0
      showScript()
    }
    const idTag = el('span', { className: 'sid', textContent: it.id })
    if (it.type === 'song') {
      const c = songs().find((s) => s.id === it.songId)
      row.append(
        el('span', { className: 'chip song', textContent: '♪' }),
        el('b', { textContent: c ? `Lied ${c.number} · ${c.title}` : `Lied ${it.songId}` }),
        idTag,
      )
      return row
    }
    const text = el('textarea', { rows: it.type === 'line' ? 2 : 1, value: it.text, ariaLabel: it.type === 'line' ? 'Text' : 'Regieanweisung' })
    const track = () => {
      if (scriptSel !== it.id) {
        scriptSel = it.id // no re-render: it would take the focus
        for (const r of document.querySelectorAll('.srow.picked')) r.classList.remove('picked')
        row.classList.add('picked')
        showActions()
      }
      cursor = text.selectionStart
      cursorEnd = text.selectionEnd
    }
    // grows with its text, so long lines show in full
    const fit = () => {
      text.style.height = 'auto'
      text.style.height = `${text.scrollHeight}px`
    }
    requestAnimationFrame(fit) // after the row is in the page
    text.addEventListener('input', fit)
    for (const ev of ['keyup', 'mouseup', 'input', 'focus']) text.addEventListener(ev, track)
    text.onchange = () => text.value !== it.text && scriptEdit((s) => ops.setText(s, it.id, text.value))
    if (it.type === 'direction') {
      row.append(el('span', { className: 'regie', textContent: 'Regie' }), text, idTag)
      return row
    }
    const chip = el('select', { className: 'chip', ariaLabel: 'Rolle' })
    const roles = speakers().map((r) => [r.id, r.name])
    if (!roles.some(([id]) => id === it.role)) roles.push([it.role, it.role])
    chip.append(...roles.map(([id, name]) => new Option(name, id)))
    chip.value = it.role
    chip.style.background = scriptColor(it.role)
    chip.onchange = () => scriptEdit((s) => ops.setRole(s, it.id, chip.value))
    // with inline directions [..] the placeholder shows what is spoken
    const spoken = it.text
      .replace(/\[[^\]]*\]/g, ' ')
      .split(/\s+/)
      .join(' ')
      .trim()
    const say = el('input', { value: it.say || '', placeholder: spoken === it.text ? 'wie Text' : `spricht: ${spoken}`, ariaLabel: 'Aussprache (say)' })
    say.onchange = () => scriptEdit((s) => ops.setSay(s, it.id, say.value.trim()))
    const play = el('button', { textContent: '▶', ariaLabel: 'Abspielen', disabled: missing.has(it.id) || !hashes[it.id] })
    play.onclick = (e) => {
      e.stopPropagation()
      playLine(it.id)
    }
    const busy = rendering.has(it.id)
    const render = el('button', { className: 'render', textContent: busy ? 'lädt …' : 'Neu sprechen', disabled: busy })
    render.onclick = (e) => {
      e.stopPropagation()
      renderLine(it.id)
    }
    const stat = el('span', { className: `sstat${missing.has(it.id) ? ' miss' : ''}`, textContent: missing.has(it.id) ? 'ohne Ton' : 'Ton ok' })
    const side = el('div', { className: 'sbtns' })
    side.append(el('div', {}), stat)
    side.firstChild.append(play, render)
    const who = el('div', { className: 'swho' })
    who.append(chip, idTag)
    row.append(who, text, say, side)
    return row
  }
  function showScript() {
    if (!scriptMode || !script) return
    const sceneSel = $('scriptScene'),
      roleSel = $('scriptRole')
    if (!sceneSel.options.length) {
      sceneSel.append(
        new Option('Alle Szenen', ''),
        ...script.scenes.map((sc) => new Option(`Szene ${sc.id.replace(/^s/, '')}${sc.title ? ` · ${sc.title}` : ''}`, sc.id)),
      )
      roleSel.append(new Option('Alle Rollen', ''), ...speakers().map((r) => new Option(r.name, r.id)))
    }
    const n = scriptItems().length
    const gone = scriptItems().filter((x) => x.type === 'line' && missing.has(x.id)).length
    $('scriptInfo').replaceChildren(
      `${script.scenes.length} Szenen · ${n} Einträge · ${speakers().length} Sprechrollen`,
      ...(gone ? [' · ', el('strong', { textContent: `${gone} ohne Ton` })] : []),
    )
    $('scriptDirty').textContent = scriptDirty ? 'Ungespeichert' : ''
    const scenes = script.scenes.filter((sc) => !sceneSel.value || sc.id === sceneSel.value)
    const parts = scenes.flatMap((sc) => {
      const show = visibleIds(sc)
      const h = el('h2', { textContent: `Szene ${sc.id.replace(/^s/, '')}${sc.title ? ` · ${sc.title}` : ''}` })
      return [h, ...sc.items.filter((x) => show.has(x.id)).map(scriptRow)]
    })
    $('scriptList').replaceChildren(...parts)
    showActions()
  }
  function showActions() {
    const sel = scriptSel && findItem(scriptSel)
    $('scriptActions').hidden = !sel
    if (sel) {
      $('scriptSelLbl').textContent = `Eintrag „${sel.id}“:`
      $('scriptType').textContent = sel.type === 'direction' ? 'Zur Zeile machen' : 'Zur Regie machen'
    }
  }
  function openScript() {
    scriptMode = true
    document.body.classList.add('script-mode')
    $('scriptView').hidden = false
    scriptMsg('')
    showScript()
    scriptStatus()
  }
  function closeScript() {
    if (scriptDirty && !confirm('Ungespeicherte Skript-Änderungen gehen verloren. Weiter?')) return false
    scriptPlayer.pause()
    scriptMode = false
    scriptDirty = false
    document.body.classList.remove('script-mode')
    $('scriptView').hidden = true
    return true
  }
  // the script exists when the production has one (static web/data/script.json)
  async function loadScript() {
    try {
      const r = await fetch('data/script.json', { cache: 'no-store' })
      if (!r.ok) return false
      script = await r.json()
      return true
    } catch (_e) {
      return false // no script
    }
  }

  $('scriptSave').onclick = saveScript
  for (const id of ['scriptRole', 'scriptScene', 'scriptMissing']) $(id).onchange = showScript
  const act = (id, fn) => {
    $(id).onclick = () => scriptSel && fn(scriptSel, findItem(scriptSel))
  }
  act('scriptSplit', (id) => {
    scriptEdit(
      (s) => ops.split(s, id, cursor),
      () => id,
    )
  })
  act('scriptMerge', (id) => scriptEdit((s) => ops.merge(s, id)))
  act('scriptInline', (id, it) => {
    const [a, b] = [Math.min(cursor, cursorEnd), Math.max(cursor, cursorEnd)]
    const part = it.text.slice(a, b).trim()
    if (it.type !== 'line' || !part) return scriptMsg('Erst im Text einer Zeile die Regie markieren.')
    scriptEdit((s) => ops.setText(s, id, `${it.text.slice(0, a)}[${part}]${it.text.slice(b)}`))
  })
  act('scriptType', (id, it) => {
    const role = $('scriptRole').value || speakers()[0]?.id
    scriptEdit((s) => (it.type === 'direction' ? ops.setType(s, id, 'line', role) : ops.setType(s, id, 'direction')))
  })
  act('scriptAdd', (id, it) => {
    const item = it.type === 'line' ? { type: 'line', role: it.role, text: 'Neue Zeile' } : { type: 'direction', text: 'Neue Regieanweisung' }
    const before = new Set(scriptItems().map((x) => x.id))
    scriptEdit(
      (s) => ops.insertAfter(s, id, item),
      (s) => s.scenes.flatMap((sc) => sc.items).find((x) => !before.has(x.id)).id,
    )
  })
  act('scriptDel', (id) => {
    if (!confirm(`Eintrag „${id}“ löschen?`)) return
    scriptSel = null
    scriptEdit((s) => ops.remove(s, id))
  })
  window.addEventListener('beforeunload', (e) => {
    if (scriptDirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  })

  return { load: loadScript, open: openScript, close: closeScript }
}
