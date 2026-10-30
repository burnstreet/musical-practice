import { addSection, deleteSection, rebarSection, redetectSections, renameSection, sectionBars, setRole, togglePhraseStart } from './edit-ops.js'

;(() => {
  const $ = (id) => document.getElementById(id)
  const audio = $('audio'),
    canvas = $('roll'),
    ctx = canvas.getContext('2d')
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const ZOOMS = [4, 6, 8, 12, 18, 30, 45, 60, 90, 120]
  let zoomIdx = 3
  let song = null,
    entry = null,
    pitchMidi = null // pitchMidi: Float32Array (NaN = gap)
  let lo = 48,
    hi = 84
  let W = 0,
    H = 0,
    dpr = 1
  // spectrogram of the vocals stem (tools/spectrogram.py): image with one column per frame
  let spec = null // {img, frames, hopS, lo, hi}
  // editing
  let editMode = false,
    selected = new Set(),
    drag = null,
    dirty = false
  // roles (voices) -> colours, readable on the board blue (>= 4.5:1 on #17498C) and apart from the selection orange #F08C14
  const ROLE_PALETTE = ['#A9D3F7', '#C8E05A', '#FFA69E', '#7FE0B5', '#D9B8F5', '#F59BC8']
  let roleColor = {},
    configRoles = null
  // bars and sections view (staff shared with the player: web/lib/editor-view.js, built by ./at.ps1 build)
  let viewMod = null,
    bars = null, // bar start seconds from the editor server
    staffSong = null,
    phrases = [],
    page = null,
    pick = null,
    cfgSongs = [],
    gridState = '', // why the bar grid is missing, shown in the sections panel
    noteKey = '' // what the selected-note card shows now
  const staffCtx = $('staffCv').getContext('2d'),
    bandCtx = $('bandCv').getContext('2d')

  const midiName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1)
  const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`
  // the precomputed spectrogram PNG is dark ink with alpha for the level; repaint it light for the dark roll
  const lightInk = (img) => {
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const x = c.getContext('2d')
    x.drawImage(img, 0, 0)
    x.globalCompositeOperation = 'source-in'
    x.fillStyle = '#A9D3F7'
    x.fillRect(0, 0, c.width, c.height)
    return c
  }
  const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440)
  const win = () => ZOOMS[zoomIdx]
  const PLAY_FRAC = 1 / 3
  const LEFT = 40

  function curTime() {
    return audio.currentTime || 0
  }
  function seek(t) {
    audio.currentTime = Math.max(0, t)
  }
  function toggle() {
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }

  // binary search: first index with time >= t
  function lowerBound(t) {
    const p = song.pitch
    let a = 0,
      b = p.length
    while (a < b) {
      const m = (a + b) >> 1
      if (p[m][0] < t) a = m + 1
      else b = m
    }
    return a
  }

  function prepare() {
    const mids = []
    pitchMidi = new Float32Array(song.pitch.length)
    song.pitch.forEach((p, i) => {
      const v = p[1] ? hzToMidi(p[1]) : NaN
      pitchMidi[i] = v
      if (!isNaN(v)) mids.push(v)
    })
    song.notes.forEach((n) => {
      mids.push(n.midi)
    })
    if (mids.length) {
      mids.sort((a, b) => a - b)
      const k = Math.floor(mids.length * 0.005)
      lo = Math.floor(mids[k]) - 1
      hi = Math.ceil(mids[mids.length - 1 - k]) + 1
      song.notes.forEach((n) => {
        lo = Math.min(lo, n.midi - 1)
        hi = Math.max(hi, n.midi + 1)
      })
      if (hi - lo < 12) {
        const c = (hi + lo) / 2
        lo = Math.floor(c - 6)
        hi = Math.ceil(c + 6)
      }
    } else {
      lo = 48
      hi = 84
    }
  }

  // ---------- geometry ----------
  // x0..x1: the roll's plot range; pts: (time, x) of the page's bar lines when the roll runs on the staff's bar grid
  function geom() {
    const t = curTime(),
      rowH = H / (hi - lo)
    const y = { t, rowH, yOf: (m) => H - (m - lo + 0.5) * rowH, midiAt: (yy) => lo + (H - yy) / rowH - 0.5 }
    if (page) {
      // one page of the staff is the roll window; bar lines sit under the staff's, time is linear inside each bar
      const off = $('staffCv').getBoundingClientRect().left - canvas.getBoundingClientRect().left
      const pts = page.grid.map(([tt, x]) => [tt, x + off])
      const [t0, x0] = pts[0],
        [t1, x1] = pts[pts.length - 1]
      return { ...y, t0, t1, x0, x1, pts, xOf: (tt) => viewMod.playheadX(pts, tt), tAt: (x) => viewMod.timeAt(pts, x) }
    }
    const w = win(),
      t0 = t - w * PLAY_FRAC,
      plotW = W - LEFT
    return {
      ...y,
      t0,
      t1: t0 + w,
      x0: LEFT,
      x1: W,
      pts: null,
      xOf: (tt) => LEFT + ((tt - t0) / w) * plotW,
      tAt: (x) => t0 + ((x - LEFT) / plotW) * w,
    }
  }

  function resize() {
    dpr = window.devicePixelRatio || 1
    const r = canvas.getBoundingClientRect()
    W = r.width
    H = r.height
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#17498C'
    ctx.fillRect(0, 0, W, H)
    const g = geom(),
      { t, t0, t1, x0, x1, rowH, xOf, yOf } = g,
      plotW = x1 - x0

    for (let m = Math.floor(lo); m <= Math.ceil(hi); m++) {
      const pc = ((m % 12) + 12) % 12
      const black = [1, 3, 6, 8, 10].includes(pc)
      const y = yOf(m) - rowH / 2
      ctx.fillStyle = black ? '#15427F' : '#17498C'
      ctx.fillRect(LEFT, y, W - LEFT, rowH)
      if (pc === 0) {
        ctx.fillStyle = '#3F78BF'
        ctx.fillRect(LEFT, y + rowH - 1, W - LEFT, 1)
      }
    }
    const clip = () => {
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, 0, plotW, H)
      ctx.clip()
    }
    clip()

    // spectrogram (covers midi lo-0.5 .. hi+0.5), one slice per bar on the bar grid
    if (spec && $('specChk').checked) {
      const yTop = yOf(spec.hi + 0.5),
        yBot = yOf(spec.lo - 0.5)
      ctx.globalAlpha = 0.7
      ctx.imageSmoothingEnabled = plotW / ((t1 - t0) / spec.hopS) < 1
      const pts = g.pts || [
        [t0, x0],
        [t1, x1],
      ]
      for (let i = 1; i < pts.length; i++) {
        const [[ta, xa], [tb, xb]] = [pts[i - 1], pts[i]]
        ctx.drawImage(spec.img, ta / spec.hopS, 0, (tb - ta) / spec.hopS, spec.img.height, xa, yTop, xb - xa, yBot - yTop)
      }
    }
    ctx.restore()

    // time grid
    ctx.strokeStyle = '#3F78BF'
    ctx.lineWidth = 1
    ctx.fillStyle = '#CFE0F5'
    ctx.font = '10px system-ui,sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    // seconds scale: finest step that keeps >= 80 px between grid lines on average; labels never overlap
    const step = [0.25, 0.5, 1, 2, 5, 10, 30, 60].find((s) => (s / (t1 - t0)) * plotW >= 80) || 60
    let lastLabel = -Infinity
    for (let gg = Math.ceil(t0 / step) * step; gg < t1; gg += step) {
      const x = Math.round(xOf(gg)) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
      if (x - lastLabel < 40) continue
      ctx.fillText(`${Math.round(gg * 100) / 100}s`, x + 2, 2)
      lastLabel = x
    }
    // bar lines of the view's bar grid, numbered as on the staff, so roll, staff and bands share one bar grid
    if (bars) {
      ctx.strokeStyle = 'rgba(207,224,245,0.6)'
      ctx.textBaseline = 'bottom'
      bars.forEach((b, i) => {
        if (b < t0 || b >= t1) return
        const x = Math.round(xOf(b)) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
        ctx.fillText(`Takt ${i + 1}`, x + 2, H - 2)
      })
    }

    clip()

    // notes
    song.notes.forEach((n, i) => {
      if (n.end < t0 || n.start > t1) return
      const x = xOf(n.start),
        x2 = xOf(n.end),
        y = yOf(n.midi) - rowH / 2
      const bw = Math.max(2, x2 - x),
        bh = Math.max(2, rowH - 1)
      const active = t >= n.start && t <= n.end,
        sel = selected.has(i)
      const col = roleColor[n.role] || ROLE_PALETTE[0]
      ctx.fillStyle = sel ? (active ? 'rgba(240,140,20,0.6)' : 'rgba(240,140,20,0.35)') : hexA(col, active ? 0.55 : 0.28)
      ctx.strokeStyle = sel ? 'rgba(200,100,0,0.95)' : hexA(col, 0.8)
      ctx.lineWidth = sel ? 2 : 1
      ctx.fillRect(x, y, bw, bh)
      ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1)
      if (bw > 26 && bh > 9) {
        ctx.fillStyle = '#fff'
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'left'
        ctx.font = `${Math.min(12, bh - 1)}px system-ui,sans-serif`
        ctx.fillText(n.name || midiName(n.midi), x + 3, y + bh / 2)
      }
      if (n.phraseStart) {
        ctx.fillStyle = '#FF6F61'
        ctx.fillRect(x - 1, 0, 2, H)
      }
      if (n.lyric && bw > 10 && $('lyricChk').checked) {
        ctx.fillStyle = col
        ctx.textBaseline = 'top'
        ctx.textAlign = 'left'
        ctx.font = 'bold 12px system-ui,sans-serif'
        ctx.fillText(n.lyric, x + 1, y + bh + 2)
      }
    })

    // pitch curve
    const p = song.pitch
    const i0 = Math.max(0, lowerBound(t0) - 1),
      i1 = Math.min(p.length, lowerBound(t1) + 1)
    const hop = song.hop_s || 0.01
    const stride = Math.max(1, Math.floor((i1 - i0) / (plotW * 1.5)))
    let prev = -1
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    for (let i = i0; i < i1; i += stride) {
      const m = pitchMidi[i]
      if (isNaN(m)) {
        prev = -1
        continue
      }
      const x = xOf(p[i][0]),
        y = yOf(m),
        c = Math.max(0, Math.min(1, p[i][2] || 0))
      if (prev >= 0 && p[i][0] - p[prev][0] <= hop * stride * 2.5 + 1e-6 && Math.abs(m - pitchMidi[prev]) < 3) {
        ctx.strokeStyle = `rgba(255,111,97,${(0.12 + 0.88 * c).toFixed(2)})`
        ctx.beginPath()
        ctx.moveTo(xOf(p[prev][0]), yOf(pitchMidi[prev]))
        ctx.lineTo(x, y)
        ctx.stroke()
      } else {
        ctx.fillStyle = `rgba(255,111,97,${(0.12 + 0.88 * c).toFixed(2)})`
        ctx.fillRect(x - 1, y - 1, 2, 2)
      }
      prev = i
    }

    // selection box
    if (drag && drag.type === 'box') {
      const x0 = xOf(drag.ta),
        x1 = xOf(drag.tb),
        y0 = yOf(drag.ma),
        y1 = yOf(drag.mb)
      ctx.fillStyle = 'rgba(240,140,20,0.12)'
      ctx.strokeStyle = 'rgba(200,100,0,0.8)'
      ctx.lineWidth = 1
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
      ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0))
    }
    ctx.restore()

    // y labels
    ctx.fillStyle = '#17498C'
    ctx.fillRect(0, 0, LEFT, H)
    ctx.fillStyle = '#CFE0F5'
    ctx.font = '11px system-ui,sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let m = Math.ceil(lo); m <= hi; m++) if (m % 12 === 0) ctx.fillText(midiName(m), LEFT - 4, yOf(m))
    ctx.fillStyle = '#3F78BF'
    ctx.fillRect(LEFT - 1, 0, 1, H)

    // playhead
    const px = Math.round(xOf(t)) + 0.5
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, H)
    ctx.stroke()

    readout(t)
  }

  // ---------- roles ----------
  // dropdown: global config roles, else roles already in the song
  function fillRoleSel(s) {
    const opts = configRoles || [...new Set(s.notes.map((n) => n.role).filter(Boolean))].map((r) => ({ id: r, name: r }))
    const keep = $('roleSel').value
    $('roleSel').replaceChildren(...opts.map((r) => new Option(r.name, r.id)))
    if (opts.some((r) => r.id === keep)) $('roleSel').value = keep
  }
  function buildRoles(s) {
    roleColor = {}
    const names = (s.roles || []).map((r) => r.name)
    s.notes.forEach((n) => {
      if (n.role && !names.includes(n.role)) names.push(n.role)
    })
    names.forEach((r, i) => {
      roleColor[r] = ROLE_PALETTE[i % ROLE_PALETTE.length]
    })
    fillRoleSel(s)
    const box = $('legend')
    const label = Object.fromEntries((configRoles || []).map((r) => [r.id, r.name]))
    box.textContent = ''
    box.hidden = names.length < 1
    names.forEach((r) => {
      const sp = document.createElement('span')
      const sw = document.createElement('i')
      sw.style.background = roleColor[r]
      sp.appendChild(sw)
      sp.appendChild(document.createTextNode(label[r] || r))
      box.appendChild(sp)
    })
  }

  function readout(t) {
    $('rTime').textContent = t.toFixed(2)
    let ps = '–'
    const p = song.pitch
    if (p.length) {
      let i = lowerBound(t)
      if (i > 0 && (i >= p.length || t - p[i - 1][0] < p[i][0] - t)) i--
      if (i < p.length && Math.abs(p[i][0] - t) < 0.1 && p[i][1]) {
        const m = hzToMidi(p[i][1]),
          r = Math.round(m)
        const cents = Math.round((m - r) * 100)
        ps = `${p[i][1].toFixed(1)} Hz (${midiName(r)}${cents >= 0 ? '+' : ''}${cents}c)`
      }
    }
    $('rPitch').textContent = ps
    let nn = '–'
    for (const n of song.notes) {
      if (t >= n.start && t <= n.end) {
        nn = n.name || midiName(n.midi)
        break
      }
    }
    $('rNote').textContent = nn
    $('rSel').textContent = selected.size + (dirty ? ' (unsaved)' : '')
  }

  // ---------- bars and sections view ----------
  // grid for the section ops: bar starts and the song end (audio length, else one bar past the last bar)
  function grid() {
    const n = bars.length
    const len = n > 1 ? bars[n - 1] - bars[n - 2] : 2
    return { bars, end: Number.isFinite(audio.duration) ? audio.duration : bars[n - 1] + len }
  }
  async function fetchDetect() {
    const id = entry.file.replace(/\.json$/, '')
    const r = await fetch('detect-sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, notes: song.notes }),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }
  // the bar grid comes from the builder (via /detect-sections), never computed here
  async function loadGrid(s) {
    bars = null
    staffSong = null
    const scored = s.notes.length && s.notes.every((n) => n.beat != null)
    gridState = scored ? 'Taktraster wird geladen …' : 'kein Taktraster: Noten ohne Takt und Schlag'
    showSections()
    if (!scored) return showView('Notenansicht: nur für Lieder mit Takt und Schlag je Note.')
    try {
      const j = await fetchDetect()
      if (song !== s) return
      bars = j.bars
    } catch (e) {
      if (song !== s) return
      gridState = 'kein Taktraster (tools/serve.py)'
      showSections()
      return showView(`Notenansicht: kein Taktraster (${e.message}). Run tools/serve.py.`)
    }
    refreshView()
    showSections()
  }
  function refreshView() {
    if (!song || !bars) return
    if (!viewMod) return showView('Notenansicht fehlt: ./at.ps1 build')
    // key and beats per bar from sources/config.json, as the server's bar grid uses them
    const cfg = cfgSongs.find((c) => `${c.id}.json` === entry.file) || {}
    staffSong = viewMod.staffSong(song, bars, cfg.key, cfg.beats || 4)
    phrases = viewMod.phrasesOf(song.notes)
    showView('')
  }
  function showView(hint) {
    $('view').hidden = !staffSong
    $('viewHint').hidden = !hint
    $('viewHint').textContent = hint
    document.body.classList.toggle('with-view', !!staffSong)
    resize()
  }
  function drawView() {
    if (!staffSong) {
      page = null
      return
    }
    const names = Object.fromEntries((configRoles || []).map((r) => [r.id, r.name]))
    page = viewMod.drawView(staffCtx, bandCtx, {
      song: staffSong,
      phrases,
      sections: song.sections || [],
      t: curTime(),
      selected,
      pick,
      names,
      colours: roleColor,
    })
    if (!page) return
    $('pageLbl').textContent = `Takt ${page.first + 1}–${page.first + page.count}`
    $('pagePrev').disabled = page.prev === null
    $('pageNext').disabled = page.next === null
  }
  function select(indices, add) {
    if (!add) selected = new Set()
    indices.forEach((i) => {
      selected.add(i)
    })
    turnToSelection()
  }
  // a selection with no note on the shown page turns staff, bands and roll (by seeking) to its first bar
  function turnToSelection() {
    const t = page && viewMod.turnFor(staffSong, page, selected)
    if (t != null) seek(t)
  }
  function pickSection(i) {
    const s = song.sections[i]
    pick = { kind: 'section', index: i }
    select(
      song.notes.flatMap((n, k) => (n.start >= s.start && n.start < s.end ? [k] : [])),
      false,
    )
  }
  function onStaffClick(e) {
    if (!page) return
    const x = e.clientX - $('staffCv').getBoundingClientRect().left
    const hit = page.heads.reduce((a, h) => (!a || Math.abs(h.x - x) < Math.abs(a.x - x) ? h : a), null)
    // shortcut: a click picks every note at the nearest onset (all voices); pick by pitch if chords get in the way
    if (!hit || Math.abs(hit.x - x) > 14) return
    pick = null
    select(hit.notes, e.shiftKey)
  }
  function onBandClick(e) {
    if (!page) return
    const r = $('bandCv').getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top
    const inside = (it) => page.xOf(it.start) <= x && x <= page.xOf(it.end)
    if (y < viewMod.BAND.phrase[1] + 2) {
      const i = phrases.findIndex(inside)
      if (i < 0) return
      pick = { kind: 'phrase', index: i }
      select(phrases[i].notes, false)
    } else {
      const i = (song.sections || []).findIndex(inside)
      if (i >= 0) pickSection(i)
    }
  }

  function frame() {
    if (song) drawView() // first: the roll runs on the page it draws
    if (song) draw()
    if (song) showNote()
    requestAnimationFrame(frame)
  }

  // ---------- editing ----------
  function hitNote(x, y) {
    const g = geom(),
      m = g.midiAt(y)
    const EDGE = 6 // px
    for (let i = song.notes.length - 1; i >= 0; i--) {
      const n = song.notes[i],
        xs = g.xOf(n.start),
        xe = g.xOf(n.end)
      if (n.end >= g.t0 && n.start <= g.t1 && Math.abs(n.midi - m) <= 0.5 && x >= xs - EDGE && x <= xe + EDGE) {
        const part = x < xs + EDGE && xe - xs > 3 * EDGE ? 'start' : x > xe - EDGE && xe - xs > 3 * EDGE ? 'end' : 'move'
        return { i, part }
      }
    }
    return null
  }
  // section list: name, from bar, to bar (as on the staff), delete; plus an add row. Needs the bar grid.
  function el(tag, props) {
    return Object.assign(document.createElement(tag), props)
  }
  function sectEdit(op) {
    try {
      song.sections = op(song.sections || [])
      pick = null
      setDirty()
    } catch (e) {
      $('status').className = ''
      $('status').textContent = e.message
    }
    showSections()
  }
  // visible once a song is loaded, also outside edit mode; bar fields stay disabled until the bar grid has arrived
  function showSections() {
    $('sectPanel').hidden = !song
    $('noteCard').hidden = !song
    $('sectState').textContent = bars ? '' : gridState
    const box = $('sectList')
    const list = (song && song.sections) || []
    const num = (value, label) =>
      el('input', { type: 'number', min: 1, max: bars ? bars.length : '', value, ariaLabel: label, disabled: !bars, placeholder: bars ? '' : '…' })
    const rows = list.map((s, i) => {
      const { from, to } = bars ? sectionBars(s, grid()) : { from: '', to: '' }
      const name = el('input', { value: s.name, ariaLabel: `Name Abschnitt ${i + 1}` })
      const a = num(from, `Von Takt, Abschnitt ${i + 1}`),
        b = num(to, `Bis Takt, Abschnitt ${i + 1}`)
      name.onchange = () => sectEdit((l) => renameSection(l, i, name.value.trim() || s.name))
      a.onchange = b.onchange = () => sectEdit((l) => rebarSection(l, grid(), i, Number(a.value), Number(b.value)))
      // focusing a row selects the section, as a click in the band does (and turns the view to it)
      name.onfocus = a.onfocus = b.onfocus = () => pickSection(i)
      const del = el('button', { textContent: '✕', title: 'Löschen', ariaLabel: `Abschnitt ${s.name} löschen` })
      del.onclick = () => sectEdit((l) => deleteSection(l, i))
      const row = el('div', { className: 'row' })
      row.dataset.i = i
      row.append(name, a, b, del)
      return row
    })
    const name = el('input', { placeholder: 'Name', ariaLabel: 'Name neuer Abschnitt' })
    const a = num('', 'Von Takt, neuer Abschnitt'),
      b = num('', 'Bis Takt, neuer Abschnitt')
    const add = el('button', { textContent: 'Abschnitt hinzufügen', disabled: !bars })
    add.onclick = () => sectEdit((l) => addSection(l, grid(), name.value.trim() || 'Abschnitt', Number(a.value), Number(b.value)))
    const head = el('div', { className: 'row head' })
    head.append(...['Name', 'von Takt', 'bis Takt', ''].map((t) => el('span', { textContent: t })))
    const addRow = el('div', { className: 'row add' })
    addRow.append(name, a, b, add)
    box.replaceChildren(head, ...rows, addRow)
    noteKey = ''
  }
  // card "Ausgewählte Note": read-only summary of the selection; the section row of a picked section is marked.
  // Role and phrase start are set in #noteEdit (edit mode).
  function showNote() {
    const ids = [...selected].filter((i) => song.notes[i]).sort((a, b) => song.notes[a].start - song.notes[b].start)
    const notes = ids.map((i) => song.notes[i])
    const first = notes[0]
    let big = 'Keine Note',
      info = 'Klick auf Note, Phrase oder Abschnitt',
      meta = ''
    if (first) {
      const bar = (i) => (staffSong ? staffSong.notes[i].bar + 1 : null)
      const pos = []
      if (ids.length === 1) {
        const word = first.syllable || first.lyric
        if (word) pos.push(`„${word}“`)
        if (staffSong) pos.push(`Takt ${bar(ids[0])}, Schlag ${Math.floor(staffSong.notes[ids[0]].beat) + 1}`)
        const ph = phrases.find((p) => p.notes.includes(ids[0]))
        if (ph) pos.push(`Phrase ${ph.number}`)
      } else if (staffSong) pos.push(`Takt ${Math.min(...ids.map(bar))}–${Math.max(...ids.map(bar))}`)
      big = ids.length > 1 ? `${ids.length} Noten` : first.name || midiName(first.midi)
      info = pos.join(' · ')
      const names = Object.fromEntries((configRoles || []).map((r) => [r.id, r.name]))
      const roles = [...new Set(notes.map((n) => n.role).filter(Boolean))].map((r) => names[r] || r)
      const sect = (song.sections || []).find((s) => first.start >= s.start && first.start < s.end)
      meta = [sect && `Abschnitt ${sect.name}`, roles.length && `Rolle ${roles.join(', ')}`].filter(Boolean).join(' · ')
    }
    const pressed = notes.length > 0 && notes.every((n) => n.phraseStart)
    const key = [big, info, meta, pressed, pick && pick.kind === 'section' ? pick.index : ''].join('\n')
    if (key === noteKey) return
    noteKey = key
    $('noteBig').textContent = big
    $('noteInfo').textContent = info
    $('noteMeta').textContent = meta
    $('phraseBtn').setAttribute('aria-pressed', pressed)
    for (const row of $('sectList').querySelectorAll('.row[data-i]'))
      row.classList.toggle('picked', !!pick && pick.kind === 'section' && Number(row.dataset.i) === pick.index)
  }
  function setDirty() {
    dirty = true
    $('saveBtn').disabled = false
    refreshView()
  }
  function shiftSelected(dt, part) {
    selected.forEach((i) => {
      const n = song.notes[i],
        o = drag && drag.orig ? drag.orig.get(i) : { start: n.start, end: n.end }
      if (part !== 'end') n.start = Math.max(0, Math.round((o.start + dt) * 1000) / 1000)
      if (part !== 'start') n.end = Math.max(n.start + 0.02, Math.round((o.end + dt) * 1000) / 1000)
      n.edited = true
    })
    setDirty()
  }
  function onDown(e) {
    const r = canvas.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top
    if (x < LEFT) return
    if (!editMode) {
      const g = geom()
      seek(g.tAt(x))
      return
    }
    const g = geom(),
      hit = hitNote(x, y)
    canvas.setPointerCapture(e.pointerId)
    if (hit) {
      if (e.shiftKey) {
        if (selected.has(hit.i)) selected.delete(hit.i)
        else selected.add(hit.i)
      } else if (!selected.has(hit.i)) {
        selected.clear()
        selected.add(hit.i)
      }
      const orig = new Map()
      selected.forEach((i) => {
        orig.set(i, { start: song.notes[i].start, end: song.notes[i].end })
      })
      drag = { type: hit.part, t0: g.tAt(x), orig, moved: false }
      canvas.style.cursor = hit.part === 'move' ? 'grabbing' : 'ew-resize'
    } else {
      if (!e.shiftKey) selected.clear()
      drag = { type: 'box', ta: g.tAt(x), tb: g.tAt(x), ma: g.midiAt(y), mb: g.midiAt(y), keep: new Set(selected) }
    }
  }
  function onMove(e) {
    const r = canvas.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top
    if (!drag) {
      if (editMode) {
        const h = hitNote(x, y)
        canvas.style.cursor = h ? (h.part === 'move' ? 'grab' : 'ew-resize') : 'crosshair'
      }
      return
    }
    const g = geom()
    if (drag.type === 'box') {
      drag.tb = g.tAt(x)
      drag.mb = g.midiAt(y)
      return
    }
    const dt = g.tAt(x) - drag.t0
    if (Math.abs(dt) > 0.002 || drag.moved) {
      drag.moved = true
      shiftSelected(dt, drag.type)
    }
  }
  function onUp() {
    if (!drag) return
    if (drag.type === 'box') {
      const ta = Math.min(drag.ta, drag.tb),
        tb = Math.max(drag.ta, drag.tb)
      const ma = Math.min(drag.ma, drag.mb),
        mb = Math.max(drag.ma, drag.mb)
      selected = new Set(drag.keep)
      song.notes.forEach((n, i) => {
        if (n.end >= ta && n.start <= tb && n.midi + 0.5 >= ma && n.midi - 0.5 <= mb) selected.add(i)
      })
    }
    drag = null
    canvas.style.cursor = editMode ? 'crosshair' : 'pointer'
  }
  function setEditMode(on) {
    editMode = on
    $('editTools').hidden = !on
    $('noteEdit').hidden = !on
    canvas.style.cursor = on ? 'crosshair' : 'pointer'
    if (!on) {
      selected.clear()
      drag = null
    }
  }

  async function save() {
    if (!song || !entry) return
    const body = JSON.stringify(song)
    $('status').textContent = ''
    try {
      const r = await fetch(`save/${entry.file}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      dirty = false
      $('saveBtn').disabled = true
      $('status').textContent = `Saved to ${j.saved} (copy: ${j.backup})`
      $('status').className = 'ok'
    } catch (e) {
      // server has no save endpoint: offer a download instead
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
      a.download = entry.file
      a.click()
      $('status').className = ''
      $('status').textContent = `Server save failed (${e.message}); downloaded ${entry.file} instead. Run tools/serve.py for direct saving.`
    }
  }

  // ---------- stems / loading ----------
  const STEM_LABELS = { mix: 'Mix', vocals: 'Vocals', no_vocals: 'No vocals' }
  function buildStems(s) {
    const box = $('stems')
    box.textContent = ''
    const keys = s.stems && s.audio ? Object.keys(s.stems) : []
    box.hidden = keys.length < 1
    keys.forEach((k) => {
      const lab = document.createElement('label')
      const rb = document.createElement('input')
      rb.type = 'radio'
      rb.name = 'stem'
      rb.value = k
      rb.checked = s.stems[k] === s.audio
      rb.onchange = () => switchStem(s.stems[k])
      lab.appendChild(rb)
      lab.appendChild(document.createTextNode(` ${STEM_LABELS[k] || k}`))
      box.appendChild(lab)
    })
    if (keys.length && !box.querySelector('input:checked')) box.querySelector('input').checked = true
  }
  function switchStem(file) {
    const t = audio.currentTime || 0,
      wasPlaying = !audio.paused
    $('status').textContent = ''
    audio.src = `data/${file}`
    const restore = () => {
      audio.removeEventListener('loadedmetadata', restore)
      try {
        audio.currentTime = t
      } catch (e) {}
      if (wasPlaying) audio.play().catch(() => {})
    }
    audio.addEventListener('loadedmetadata', restore)
  }

  async function loadSong(en) {
    if (dirty && !confirm('Unsaved note edits will be lost. Continue?')) return
    $('status').textContent = ''
    $('status').className = ''
    try {
      const r = await fetch(`data/${en.file}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`${en.file}: HTTP ${r.status}`)
      const s = await r.json()
      s.pitch = s.pitch || []
      s.notes = s.notes || []
      audio.pause()
      song = s
      entry = en
      prepare()
      selected.clear()
      drag = null
      dirty = false
      $('saveBtn').disabled = true
      buildStems(s)
      buildRoles(s)
      pick = null
      loadGrid(s)
      if (s.audio) audio.src = `data/${s.audio}`
      else audio.removeAttribute('src')
      const startT = parseFloat(new URLSearchParams(location.search).get('t'))
      if (startT > 0) audio.addEventListener('loadedmetadata', () => seek(startT), { once: true })
      spec = null
      $('specStatus').textContent = ''
      if (s.spec) {
        // precomputed by tools/spectrogram.py
        const img = new Image()
        $('specStatus').textContent = 'loading spectrogram…'
        img.onload = () => {
          if (song === s) {
            spec = { img: lightInk(img), frames: img.width, hopS: s.spec.hop_s, lo: s.spec.midi_lo, hi: s.spec.midi_hi }
            $('specStatus').textContent = ''
          }
        }
        img.onerror = () => {
          if (song === s) $('specStatus').textContent = `spectrogram image missing: ${s.spec.file}`
        }
        img.src = `data/${s.spec.file}`
      }
    } catch (e) {
      song = null
      $('status').textContent = `Could not load song: ${e.message}`
    }
  }

  async function init() {
    $('zoomLbl').textContent = `${win()} s`
    resize()
    window.addEventListener('resize', resize)
    audio.addEventListener('error', () => {
      if (song?.audio) $('status').textContent = `Audio file could not be loaded (${audio.getAttribute('src') || ''}).`
    })
    $('zoomIn').onclick = () => {
      zoomIdx = Math.max(0, zoomIdx - 1)
      $('zoomLbl').textContent = `${win()} s`
    }
    $('zoomOut').onclick = () => {
      zoomIdx = Math.min(ZOOMS.length - 1, zoomIdx + 1)
      $('zoomLbl').textContent = `${win()} s`
    }
    $('editChk').onchange = () => setEditMode($('editChk').checked)
    $('saveBtn').onclick = save
    $('roleBtn').onclick = () => {
      if (!song || !$('roleSel').value) return
      setRole(song.notes, selected, $('roleSel').value)
      setDirty()
      buildRoles(song)
    }
    $('phraseBtn').onclick = () => {
      if (!song) return
      togglePhraseStart(song.notes, selected)
      setDirty()
    }
    $('sectBtn').onclick = async () => {
      if (!song) return
      const before = song.sections
      try {
        const next = await redetectSections(
          before,
          () => confirm('Abschnitte neu erkennen? Die aktuelle Liste wird ersetzt.'),
          async () => {
            const j = await fetchDetect()
            bars = j.bars
            return j.sections
          },
        )
        if (next === before) return
        song.sections = next
        pick = null
        setDirty()
        showSections()
      } catch (e) {
        $('status').className = ''
        $('status').textContent = `Abschnitte nicht erkannt (${e.message}). Run tools/serve.py.`
      }
    }
    $('selAll').onclick = () => song && select([...song.notes.keys()], false)
    $('selNone').onclick = () => selected.clear()
    $('reloadBtn').onclick = () => entry && loadSong(entry)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', (e) => {
      if (/^(SELECT|INPUT|BUTTON|TEXTAREA)$/.test(e.target.tagName)) return
      if (e.code === 'Space') {
        e.preventDefault()
        toggle()
        return
      }
      if (!editMode || !song) return
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
        e.preventDefault()
        select([...song.notes.keys()], false)
      } else if (e.code === 'Escape') selected.clear()
      else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && selected.size) {
        e.preventDefault()
        const dt = (e.code === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.1 : 0.01)
        shiftSelected(dt, e.altKey ? 'end' : e.ctrlKey ? 'start' : 'move')
      }
    })
    window.addEventListener('beforeunload', (e) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    })
    $('staffCv').addEventListener('click', onStaffClick)
    $('bandCv').addEventListener('click', onBandClick)
    $('pagePrev').onclick = () => page && page.prev !== null && seek(page.prev)
    $('pageNext').onclick = () => page && page.next !== null && seek(page.next)
    try {
      viewMod = await import('./lib/editor-view.js')
    } catch (e) {
      /* not built: refreshView shows the hint */
    }
    // the songs of sources/config.json, titled as in the app; each is edited in web/data/<id>.json, the file pack reads
    try {
      const cfg = await (await fetch('config.json', { cache: 'no-store' })).json()
      configRoles = cfg.roles
      cfgSongs = [...(cfg.songs || [])].sort((a, b) => a.number - b.number)
    } catch (e) {
      $('status').textContent = `Could not load config.json (sources/config.json via tools/serve.py): ${e.message}`
      return
    }
    const list = cfgSongs.map((c) => ({ file: `${c.id}.json`, title: `Lied ${c.number} · ${c.title}` }))
    const sel = $('songSel')
    list.forEach((s, i) => {
      sel.appendChild(new Option(s.title, i))
    })
    sel.onchange = () => loadSong(list[sel.value])
    // ?s=08 selects the entry whose file is 08.json
    const want = new URLSearchParams(location.search).get('s')
    const first = Math.max(
      0,
      list.findIndex((e) => e.file === `${want}.json`),
    )
    sel.value = first
    if (list.length) await loadSong(list[first])
    requestAnimationFrame(frame)
  }
  init()
})()
