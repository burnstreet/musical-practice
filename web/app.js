import { setRole, togglePhraseStart } from './edit-ops.js';
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const audio = $('audio'), canvas = $('roll'), ctx = canvas.getContext('2d');
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const ZOOMS = [4, 6, 8, 12, 18, 30, 45, 60, 90, 120];
  let zoomIdx = 3;
  let song = null, entry = null, pitchMidi = null; // pitchMidi: Float32Array (NaN = gap)
  let lo = 48, hi = 84;
  let noAudio = false, timerPlaying = false, timerT = 0, timerStart = 0;
  let W = 0, H = 0, dpr = 1;
  // spectrogram of the vocals stem: image with one column per frame, SUB rows per semitone
  let spec = null; // {img, frames, hopS, lo, hi}
  const SUB = 3;
  // editing
  let editMode = false, selected = new Set(), drag = null, dirty = false;
  // roles (voices) -> colours
  const ROLE_PALETTE = ['#2f6fed', '#d6453a', '#2a9d5c', '#b8860b', '#8e44ad', '#0e8a9b'];
  let roleColor = {}, configRoles = null;
  // sheet music (OpenSheetMusicDisplay)
  let osmd = null, cursorPos = null;

  const midiName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  const hexA = (hex, a) => 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + a + ')';
  const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
  const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const win = () => ZOOMS[zoomIdx];
  const PLAY_FRAC = 1 / 3;
  const LEFT = 40;

  function curTime() {
    if (noAudio) return timerPlaying ? timerT + (performance.now() - timerStart) / 1000 : timerT;
    return audio.currentTime || 0;
  }
  function seek(t) {
    t = Math.max(0, t);
    if (noAudio) { timerT = t; timerStart = performance.now(); }
    else audio.currentTime = t;
  }
  function toggle() {
    if (noAudio) {
      if (timerPlaying) { timerT = curTime(); timerPlaying = false; }
      else { timerStart = performance.now(); timerPlaying = true; }
      $('timerBtn').textContent = timerPlaying ? 'Pause (timer)' : 'Play (timer)';
    } else if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  // binary search: first index with time >= t
  function lowerBound(t) {
    const p = song.pitch; let a = 0, b = p.length;
    while (a < b) { const m = (a + b) >> 1; if (p[m][0] < t) a = m + 1; else b = m; }
    return a;
  }

  function prepare() {
    const mids = [];
    pitchMidi = new Float32Array(song.pitch.length);
    song.pitch.forEach((p, i) => {
      const v = p[1] ? hzToMidi(p[1]) : NaN;
      pitchMidi[i] = v;
      if (!isNaN(v)) mids.push(v);
    });
    song.notes.forEach((n) => mids.push(n.midi));
    if (mids.length) {
      mids.sort((a, b) => a - b);
      const k = Math.floor(mids.length * 0.005);
      lo = Math.floor(mids[k]) - 1; hi = Math.ceil(mids[mids.length - 1 - k]) + 1;
      song.notes.forEach((n) => { lo = Math.min(lo, n.midi - 1); hi = Math.max(hi, n.midi + 1); });
      if (hi - lo < 12) { const c = (hi + lo) / 2; lo = Math.floor(c - 6); hi = Math.ceil(c + 6); }
    } else { lo = 48; hi = 84; }
  }

  // ---------- spectrogram ----------
  function fft(re, im) { // in-place radix-2
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  async function buildSpectrogram(file, mySong) {
    spec = null;
    $('specStatus').textContent = 'computing spectrogram…';
    try {
      const tStart = performance.now();
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const raw = await (await fetch('data/' + file)).arrayBuffer();
      console.log('spec: fetched', file, raw.byteLength, 'bytes', Math.round(performance.now() - tStart), 'ms');
      const ab = await ac.decodeAudioData(raw);
      console.log('spec: decoded', ab.duration.toFixed(1), 's', Math.round(performance.now() - tStart), 'ms');
      ac.close && ac.close();
      if (song !== mySong) return;
      const ch = ab.getChannelData(0), dec = Math.max(1, Math.floor(ab.sampleRate / 11025)), sr = ab.sampleRate / dec;
      const n = Math.floor(ch.length / dec), y = new Float32Array(n);
      for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < dec; k++) s += ch[i * dec + k]; y[i] = s / dec; }
      const N = 2048, hop = Math.round(sr * 0.02), hopS = hop / sr, binHz = sr / N;
      const frames = Math.max(1, Math.floor((n - N) / hop));
      const rows = (hi - lo + 1) * SUB;
      // bin range per sub-row (row 0 = top = highest pitch)
      const bins = [];
      for (let r = 0; r < rows; r++) {
        const m = hi + 0.5 - (r + 0.5) / SUB;
        const f0 = midiToHz(m - 0.5 / SUB), f1 = midiToHz(m + 0.5 / SUB);
        bins.push([Math.max(1, Math.floor(f0 / binHz)), Math.min(N / 2, Math.ceil(f1 / binHz))]);
      }
      const win_ = new Float32Array(N);
      for (let i = 0; i < N; i++) win_[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
      const re = new Float32Array(N), im = new Float32Array(N), mag = new Float32Array(N / 2 + 1);
      const db = new Float32Array(frames * rows);
      let gmax = -1e9;
      for (let f = 0; f < frames; f++) {
        const o = f * hop;
        for (let i = 0; i < N; i++) { re[i] = y[o + i] * win_[i]; im[i] = 0; }
        fft(re, im);
        for (let k = 0; k <= N / 2; k++) mag[k] = re[k] * re[k] + im[k] * im[k];
        for (let r = 0; r < rows; r++) {
          let mx = 0;
          for (let k = bins[r][0]; k <= bins[r][1]; k++) if (mag[k] > mx) mx = mag[k];
          const v = 10 * Math.log10(mx + 1e-12);
          db[f * rows + r] = v; if (v > gmax) gmax = v;
        }
        if (f % 400 === 0) { await new Promise((res) => setTimeout(res, 0)); if (song !== mySong) return; }
      }
      const img = document.createElement('canvas');
      img.width = frames; img.height = rows;
      const ictx = img.getContext('2d'), id = ictx.createImageData(frames, rows);
      const RANGE = 55;
      for (let f = 0; f < frames; f++) for (let r = 0; r < rows; r++) {
        const v = Math.max(0, Math.min(1, (db[f * rows + r] - gmax + RANGE) / RANGE));
        const o = (r * frames + f) * 4;
        id.data[o] = 20; id.data[o + 1] = 40; id.data[o + 2] = 90; id.data[o + 3] = Math.round(v * v * 230);
      }
      ictx.putImageData(id, 0, 0);
      spec = { img, frames, hopS, lo, hi };
      console.log('spec: done', frames, 'frames x', rows, 'rows', Math.round(performance.now() - tStart), 'ms');
      $('specStatus').textContent = '';
    } catch (e) {
      $('specStatus').textContent = 'no spectrogram: ' + e.message;
    }
  }

  // ---------- geometry ----------
  function geom() {
    const w = win(), t = curTime(), plotW = W - LEFT;
    const t0 = t - w * PLAY_FRAC, rows = hi - lo, rowH = H / rows;
    return {
      t, w, t0, t1: t0 + w, plotW, rowH,
      xOf: (tt) => LEFT + (tt - t0) / w * plotW,
      tAt: (x) => t0 + (x - LEFT) / plotW * w,
      yOf: (m) => H - (m - lo + 0.5) * rowH,
      midiAt: (y) => lo + (H - y) / rowH - 0.5,
    };
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const g = geom(), { t, w, t0, t1, plotW, rowH, xOf, yOf } = g;

    for (let m = Math.floor(lo); m <= Math.ceil(hi); m++) {
      const pc = ((m % 12) + 12) % 12;
      const black = [1, 3, 6, 8, 10].includes(pc);
      const y = yOf(m) - rowH / 2;
      ctx.fillStyle = black ? '#eef0f4' : '#fafbfc';
      ctx.fillRect(LEFT, y, plotW, rowH);
      if (pc === 0) { ctx.fillStyle = '#c9cfdb'; ctx.fillRect(LEFT, y + rowH - 1, plotW, 1); }
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(LEFT, 0, plotW, H); ctx.clip();

    // spectrogram (covers midi lo-0.5 .. hi+0.5)
    if (spec && $('specChk').checked) {
      const f0 = t0 / spec.hopS, f1 = t1 / spec.hopS;
      const yTop = yOf(spec.hi + 0.5), yBot = yOf(spec.lo - 0.5);
      ctx.imageSmoothingEnabled = plotW / (f1 - f0) < 1;
      ctx.drawImage(spec.img, f0, 0, f1 - f0, spec.img.height, LEFT, yTop, plotW, yBot - yTop);
    }
    ctx.restore();

    // time grid
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.fillStyle = '#8a91a3';
    ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    // finest step that keeps >= 80 px between grid lines
    const step = [0.25, 0.5, 1, 2, 5, 10, 30, 60].find((s) => s / w * plotW >= 80) || 60;
    for (let gg = Math.ceil(t0 / step) * step; gg < t1; gg += step) {
      const x = Math.round(xOf(gg)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.fillText((Math.round(gg * 100) / 100) + 's', x + 2, 2);
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(LEFT, 0, plotW, H); ctx.clip();

    // notes
    song.notes.forEach((n, i) => {
      if (n.end < t0 || n.start > t1) return;
      const x = xOf(n.start), x2 = xOf(n.end), y = yOf(n.midi) - rowH / 2;
      const bw = Math.max(2, x2 - x), bh = Math.max(2, rowH - 1);
      const active = t >= n.start && t <= n.end, sel = selected.has(i);
      const col = roleColor[n.role] || ROLE_PALETTE[0];
      ctx.fillStyle = sel ? (active ? 'rgba(240,140,20,0.6)' : 'rgba(240,140,20,0.35)') : hexA(col, active ? 0.55 : 0.28);
      ctx.strokeStyle = sel ? 'rgba(200,100,0,0.95)' : hexA(col, 0.8);
      ctx.lineWidth = sel ? 2 : 1;
      ctx.fillRect(x, y, bw, bh); ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
      if (bw > 26 && bh > 9) {
        ctx.fillStyle = '#1d2330'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.font = Math.min(12, bh - 1) + 'px system-ui,sans-serif';
        ctx.fillText(n.name || midiName(n.midi), x + 3, y + bh / 2);
      }
      if (n.phraseStart) { ctx.fillStyle = '#c0392b'; ctx.fillRect(x - 1, 0, 2, H); }
      if (n.lyric && bw > 10 && $('lyricChk').checked) {
        ctx.fillStyle = col; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        ctx.font = 'bold 12px system-ui,sans-serif';
        ctx.fillText(n.lyric, x + 1, y + bh + 2);
      }
    });

    // pitch curve
    const p = song.pitch;
    const i0 = Math.max(0, lowerBound(t0) - 1), i1 = Math.min(p.length, lowerBound(t1) + 1);
    const hop = song.hop_s || 0.01;
    const stride = Math.max(1, Math.floor((i1 - i0) / (plotW * 1.5)));
    let prev = -1;
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = i0; i < i1; i += stride) {
      const m = pitchMidi[i];
      if (isNaN(m)) { prev = -1; continue; }
      const x = xOf(p[i][0]), y = yOf(m), c = Math.max(0, Math.min(1, p[i][2] || 0));
      if (prev >= 0 && p[i][0] - p[prev][0] <= hop * stride * 2.5 + 1e-6 && Math.abs(m - pitchMidi[prev]) < 3) {
        ctx.strokeStyle = 'rgba(214,69,40,' + (0.12 + 0.88 * c).toFixed(2) + ')';
        ctx.beginPath(); ctx.moveTo(xOf(p[prev][0]), yOf(pitchMidi[prev])); ctx.lineTo(x, y); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(214,69,40,' + (0.12 + 0.88 * c).toFixed(2) + ')';
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      prev = i;
    }

    // selection box
    if (drag && drag.type === 'box') {
      const x0 = xOf(drag.ta), x1 = xOf(drag.tb), y0 = yOf(drag.ma), y1 = yOf(drag.mb);
      ctx.fillStyle = 'rgba(240,140,20,0.12)'; ctx.strokeStyle = 'rgba(200,100,0,0.8)'; ctx.lineWidth = 1;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
    ctx.restore();

    // y labels
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, LEFT, H);
    ctx.fillStyle = '#4a5166'; ctx.font = '11px system-ui,sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let m = Math.ceil(lo); m <= hi; m++) if (m % 12 === 0) ctx.fillText(midiName(m), LEFT - 4, yOf(m));
    ctx.fillStyle = '#c9cfdb'; ctx.fillRect(LEFT - 1, 0, 1, H);

    // playhead
    const px = Math.round(xOf(t)) + 0.5;
    ctx.strokeStyle = '#1d2330'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();

    readout(t);
    followSheet(t);
  }

  // ---------- roles / sheet ----------
  // dropdown: global config roles, else roles already in the song
  function fillRoleSel(s) {
    const opts = configRoles || [...new Set(s.notes.map((n) => n.role).filter(Boolean))].map((r) => ({ id: r, name: r }));
    const keep = $('roleSel').value;
    $('roleSel').replaceChildren(...opts.map((r) => new Option(r.name, r.id)));
    $('roleSel').value = keep;
  }
  function buildRoles(s) {
    roleColor = {};
    const names = (s.roles || []).map((r) => r.name);
    s.notes.forEach((n) => { if (n.role && !names.includes(n.role)) names.push(n.role); });
    names.forEach((r, i) => { roleColor[r] = ROLE_PALETTE[i % ROLE_PALETTE.length]; });
    fillRoleSel(s);
    const box = $('legend');
    box.textContent = '';
    box.hidden = names.length < 1;
    names.forEach((r) => {
      const sp = document.createElement('span');
      const sw = document.createElement('i'); sw.style.background = roleColor[r];
      sp.appendChild(sw); sp.appendChild(document.createTextNode(r));
      box.appendChild(sp);
    });
  }

  async function loadSheet(s) {
    const box = $('sheet');
    box.textContent = ''; osmd = null; cursorPos = null;
    box.hidden = !s.sheet || !$('sheetChk').checked;
    document.body.classList.toggle('with-sheet', !box.hidden);
    resize();
    if (box.hidden || !window.opensheetmusicdisplay) return;
    try {
      const o = new opensheetmusicdisplay.OpenSheetMusicDisplay(box, {
        autoResize: true, drawTitle: false, drawPartNames: false, followCursor: false, drawingParameters: 'compact',
      });
      await o.load('data/' + s.sheet);
      if (song !== s) return;
      o.render();
      o.cursor.show();
      osmd = o;
    } catch (e) {
      box.textContent = 'Noten konnten nicht geladen werden: ' + e.message;
    }
  }
  // move the sheet cursor to the bar/beat of the note sounding at t
  function followSheet(t) {
    if (!osmd || !song) return;
    let cur = null;
    for (const n of song.notes) { if (t >= n.start && t <= n.end) { cur = n; break; } }
    if (!cur) return;
    const key = cur.bar + ':' + cur.beat;
    if (key === cursorPos) return;
    cursorPos = key;
    const c = osmd.cursor;
    c.reset();
    for (let guard = 0; guard < 5000 && !c.iterator.EndReached; guard++) {
      const mi = c.iterator.CurrentMeasureIndex, beat = c.iterator.currentTimeStamp.RealValue * 4;
      if (mi > cur.bar || (mi === cur.bar && beat >= cur.beat - 1e-3)) break;
      c.next();
    }
    c.update();
    // keep the cursor visible by scrolling the sheet box only, never the page
    const box = $('sheet'), el = c.cursorElement;
    if (el) {
      const top = el.offsetTop - box.offsetTop, bottom = top + el.offsetHeight;
      if (top < box.scrollTop || bottom > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, top - 20);
    }
  }

  function readout(t) {
    $('rTime').textContent = t.toFixed(2);
    let ps = '–';
    const p = song.pitch;
    if (p.length) {
      let i = lowerBound(t);
      if (i > 0 && (i >= p.length || t - p[i - 1][0] < p[i][0] - t)) i--;
      if (i < p.length && Math.abs(p[i][0] - t) < 0.1 && p[i][1]) {
        const m = hzToMidi(p[i][1]), r = Math.round(m);
        const cents = Math.round((m - r) * 100);
        ps = p[i][1].toFixed(1) + ' Hz (' + midiName(r) + (cents >= 0 ? '+' : '') + cents + 'c)';
      }
    }
    $('rPitch').textContent = ps;
    let nn = '–';
    for (const n of song.notes) { if (t >= n.start && t <= n.end) { nn = n.name || midiName(n.midi); break; } }
    $('rNote').textContent = nn;
    $('rSel').textContent = selected.size + (dirty ? ' (unsaved)' : '');
  }

  function frame() { if (song) draw(); requestAnimationFrame(frame); }

  // ---------- editing ----------
  function hitNote(x, y) {
    const g = geom(), t = g.tAt(x), m = g.midiAt(y);
    const EDGE = 6 / g.plotW * g.w; // 6 px in seconds
    for (let i = song.notes.length - 1; i >= 0; i--) {
      const n = song.notes[i];
      if (Math.abs(n.midi - m) <= 0.5 && t >= n.start - EDGE && t <= n.end + EDGE) {
        const part = t < n.start + EDGE && n.end - n.start > 3 * EDGE ? 'start'
          : t > n.end - EDGE && n.end - n.start > 3 * EDGE ? 'end' : 'move';
        return { i, part };
      }
    }
    return null;
  }
  function setDirty() { dirty = true; $('saveBtn').disabled = false; }
  function shiftSelected(dt, part) {
    selected.forEach((i) => {
      const n = song.notes[i], o = drag && drag.orig ? drag.orig.get(i) : { start: n.start, end: n.end };
      if (part !== 'end') n.start = Math.max(0, Math.round((o.start + dt) * 1000) / 1000);
      if (part !== 'start') n.end = Math.max(n.start + 0.02, Math.round((o.end + dt) * 1000) / 1000);
      n.edited = true;
    });
    setDirty();
  }
  function onDown(e) {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < LEFT) return;
    if (!editMode) { const g = geom(); seek(g.tAt(x)); return; }
    const g = geom(), hit = hitNote(x, y);
    canvas.setPointerCapture(e.pointerId);
    if (hit) {
      if (e.shiftKey) { if (selected.has(hit.i)) selected.delete(hit.i); else selected.add(hit.i); }
      else if (!selected.has(hit.i)) { selected.clear(); selected.add(hit.i); }
      const orig = new Map();
      selected.forEach((i) => orig.set(i, { start: song.notes[i].start, end: song.notes[i].end }));
      drag = { type: hit.part, t0: g.tAt(x), orig, moved: false };
      canvas.style.cursor = hit.part === 'move' ? 'grabbing' : 'ew-resize';
    } else {
      if (!e.shiftKey) selected.clear();
      drag = { type: 'box', ta: g.tAt(x), tb: g.tAt(x), ma: g.midiAt(y), mb: g.midiAt(y), keep: new Set(selected) };
    }
  }
  function onMove(e) {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (!drag) {
      if (editMode) { const h = hitNote(x, y); canvas.style.cursor = h ? (h.part === 'move' ? 'grab' : 'ew-resize') : 'crosshair'; }
      return;
    }
    const g = geom();
    if (drag.type === 'box') { drag.tb = g.tAt(x); drag.mb = g.midiAt(y); return; }
    const dt = g.tAt(x) - drag.t0;
    if (Math.abs(dt) > 0.002 || drag.moved) { drag.moved = true; shiftSelected(dt, drag.type); }
  }
  function onUp() {
    if (!drag) return;
    if (drag.type === 'box') {
      const ta = Math.min(drag.ta, drag.tb), tb = Math.max(drag.ta, drag.tb);
      const ma = Math.min(drag.ma, drag.mb), mb = Math.max(drag.ma, drag.mb);
      selected = new Set(drag.keep);
      song.notes.forEach((n, i) => {
        if (n.end >= ta && n.start <= tb && n.midi + 0.5 >= ma && n.midi - 0.5 <= mb) selected.add(i);
      });
    }
    drag = null; canvas.style.cursor = editMode ? 'crosshair' : 'pointer';
  }
  function setEditMode(on) {
    editMode = on;
    $('editTools').hidden = !on;
    canvas.style.cursor = on ? 'crosshair' : 'pointer';
    if (!on) { selected.clear(); drag = null; }
  }

  async function save() {
    if (!song || !entry) return;
    const body = JSON.stringify(song);
    $('status').textContent = '';
    try {
      const r = await fetch('save/' + entry.file, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      dirty = false; $('saveBtn').disabled = true;
      $('status').textContent = 'Saved to ' + j.saved + ' (copy: ' + j.backup + ')';
      $('status').className = 'ok';
    } catch (e) {
      // server has no save endpoint: offer a download instead
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
      a.download = entry.file; a.click();
      $('status').className = '';
      $('status').textContent = 'Server save failed (' + e.message + '); downloaded ' + entry.file + ' instead. Run tools/serve.py for direct saving.';
    }
  }

  // ---------- stems / loading ----------
  const STEM_LABELS = { mix: 'Mix', vocals: 'Vocals', no_vocals: 'No vocals' };
  function buildStems(s) {
    const box = $('stems');
    box.textContent = '';
    const keys = s.stems && s.audio ? Object.keys(s.stems) : [];
    box.hidden = keys.length < 1;
    keys.forEach((k) => {
      const lab = document.createElement('label');
      const rb = document.createElement('input');
      rb.type = 'radio'; rb.name = 'stem'; rb.value = k;
      rb.checked = s.stems[k] === s.audio;
      rb.onchange = () => switchStem(s.stems[k]);
      lab.appendChild(rb);
      lab.appendChild(document.createTextNode(' ' + (STEM_LABELS[k] || k)));
      box.appendChild(lab);
    });
    if (keys.length && !box.querySelector('input:checked')) box.querySelector('input').checked = true;
  }
  function switchStem(file) {
    const t = audio.currentTime || 0, wasPlaying = !audio.paused;
    $('status').textContent = '';
    audio.src = 'data/' + file;
    const restore = () => {
      audio.removeEventListener('loadedmetadata', restore);
      try { audio.currentTime = t; } catch (e) {}
      if (wasPlaying) audio.play().catch(() => {});
    };
    audio.addEventListener('loadedmetadata', restore);
  }

  async function loadSong(en) {
    if (dirty && !confirm('Unsaved note edits will be lost. Continue?')) return;
    $('status').textContent = ''; $('status').className = '';
    try {
      const r = await fetch('data/' + en.file, { cache: 'no-store' });
      if (!r.ok) throw new Error(en.file + ': HTTP ' + r.status);
      const s = await r.json();
      s.pitch = s.pitch || []; s.notes = s.notes || [];
      audio.pause(); timerPlaying = false; timerT = 0;
      song = s; entry = en; prepare();
      selected.clear(); drag = null; dirty = false; $('saveBtn').disabled = true;
      noAudio = !s.audio;
      $('timerBar').hidden = !noAudio;
      audio.style.display = noAudio ? 'none' : '';
      $('timerBtn').textContent = 'Play (timer)';
      buildStems(s);
      buildRoles(s);
      loadSheet(s);
      if (!noAudio) audio.src = 'data/' + s.audio; else audio.removeAttribute('src');
      const startT = parseFloat(new URLSearchParams(location.search).get('t'));
      if (startT > 0) {
        if (noAudio) seek(startT);
        else audio.addEventListener('loadedmetadata', () => seek(startT), { once: true });
      }
      spec = null; $('specStatus').textContent = '';
      if (s.spec) {
        // precomputed by tools/spectrogram.py
        const img = new Image();
        $('specStatus').textContent = 'loading spectrogram…';
        img.onload = () => { if (song === s) { spec = { img, frames: img.width, hopS: s.spec.hop_s, lo: s.spec.midi_lo, hi: s.spec.midi_hi }; $('specStatus').textContent = ''; } };
        img.onerror = () => { if (song === s) $('specStatus').textContent = 'spectrogram image missing: ' + s.spec.file; };
        img.src = 'data/' + s.spec.file;
      } else {
        const specFile = (s.stems && s.stems.vocals) || s.audio;
        if (specFile) buildSpectrogram(specFile, s);
      }
    } catch (e) {
      song = null;
      $('status').textContent = 'Could not load song: ' + e.message;
    }
  }

  async function init() {
    $('zoomLbl').textContent = win() + ' s';
    resize();
    window.addEventListener('resize', resize);
    audio.addEventListener('error', () => {
      if (song && !noAudio) $('status').textContent = 'Audio file could not be loaded (' + (audio.getAttribute('src') || '') + ').';
    });
    $('zoomIn').onclick = () => { zoomIdx = Math.max(0, zoomIdx - 1); $('zoomLbl').textContent = win() + ' s'; };
    $('zoomOut').onclick = () => { zoomIdx = Math.min(ZOOMS.length - 1, zoomIdx + 1); $('zoomLbl').textContent = win() + ' s'; };
    $('timerBtn').onclick = toggle;
    $('editChk').onchange = () => setEditMode($('editChk').checked);
    $('sheetChk').onchange = () => { if (song) loadSheet(song); };
    $('saveBtn').onclick = save;
    $('roleBtn').onclick = () => { if (!song || !$('roleSel').value) return; setRole(song.notes, selected, $('roleSel').value); setDirty(); buildRoles(song); };
    $('phraseBtn').onclick = () => { if (!song) return; togglePhraseStart(song.notes, selected); setDirty(); };
    $('selAll').onclick = () => { song && song.notes.forEach((_, i) => selected.add(i)); };
    $('selNone').onclick = () => selected.clear();
    $('reloadBtn').onclick = () => entry && loadSong(entry);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', (e) => {
      if (/^(SELECT|INPUT|BUTTON|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); return; }
      if (!editMode || !song) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') { e.preventDefault(); song.notes.forEach((_, i) => selected.add(i)); }
      else if (e.code === 'Escape') selected.clear();
      else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && selected.size) {
        e.preventDefault();
        const dt = (e.code === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.1 : 0.01);
        shiftSelected(dt, e.altKey ? 'end' : e.ctrlKey ? 'start' : 'move');
      }
    });
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    try { configRoles = (await (await fetch('config.json', { cache: 'no-store' })).json()).roles; } catch (e) { /* no config: dropdown falls back to song roles */ }
    let list = [];
    try {
      const r = await fetch('data/index.json', { cache: 'no-store' });
      list = await r.json();
    } catch (e) { $('status').textContent = 'Could not load data/index.json: ' + e.message; return; }
    const sel = $('songSel');
    list.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = s.title; sel.appendChild(o); });
    sel.onchange = () => loadSong(list[sel.value]);
    // ?s=08 selects the entry whose file is 08.json
    const want = new URLSearchParams(location.search).get('s');
    let first = Math.max(0, list.findIndex((e) => e.file === want + '.json'));
    sel.value = first;
    if (list.length) await loadSong(list[first]);
    requestAnimationFrame(frame);
  }
  init();
})();
