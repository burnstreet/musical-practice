import { describe, expect, it } from 'vitest'
import { draw as drawRoll, foldToTargetOctave, lyricXs, rollWindow, rowRange } from '../src/app/draw/roll'
import {
  barsPerPage,
  COLORS,
  draw as drawStaff,
  keyFifths,
  layoutBar,
  layoutPage,
  noteColour,
  notePos,
  noteValue,
  octaveShift,
  type PageOnset,
  pageAt,
  pageOf,
  pagePoints,
  playheadX,
  restsIn,
  splitPages,
  staffPos,
} from '../src/app/draw/staff'
import { arcTarget, type Note, type Song } from '../src/core/content'

describe('staff layout', () => {
  it('reads the key signature from song.key', () => {
    expect(keyFifths('C')).toBe(0)
    expect(keyFifths('F')).toBe(-1)
    expect(keyFifths('D')).toBe(2)
    expect(keyFifths('Bb')).toBe(-2)
    expect(keyFifths('Am')).toBe(0)
    expect(keyFifths('Ebm')).toBe(-6)
    expect(keyFifths('F#m')).toBe(3)
  })

  it('places a midi on the treble staff, steps from the bottom line E4', () => {
    expect(staffPos(64, 0).step).toBe(0) // E4
    expect(staffPos(77, 0).step).toBe(8) // F5, top line
    expect(staffPos(60, 0).step).toBe(-2) // C4, ledger line
    expect(staffPos(71, 0).step).toBe(4) // B4, middle line
  })

  it('writes a song with a low median note an octave higher, others as sounded', () => {
    const song = (midis: number[]) => ({ notes: midis.map((midi) => ({ midi })) }) as unknown as Song
    expect(octaveShift(song([55, 56, 57, 59, 62]))).toBe(12) // men's range G3-D4, median 57
    expect(octaveShift(song([43, 44, 45]))).toBe(24)
    expect(octaveShift(song([60, 62, 64, 65]))).toBe(0)
    expect(octaveShift(song([]))).toBe(0)
  })

  it('writes a spoken note on the middle line without accidental, and leaves it out of the octave shift', () => {
    const notes = [55, 56, 57, 59, 62].map((midi) => ({ midi })) as Note[]
    const song = { notes: [...notes, ...Array(9).fill({ midi: 71, spoken: true })] } as unknown as Song
    expect(octaveShift(song)).toBe(12) // the sung median 57, not the spoken 71
    expect(notePos({ midi: 61, spoken: true } as Note, song, 0)).toEqual({ step: 4, acc: '' })
    expect(notePos({ midi: 61 } as Note, song, 0)).toEqual(staffPos(73, 0))
  })

  it('needs no accidental for pitches in the key', () => {
    expect(staffPos(70, -1)).toEqual({ step: 4, acc: '' }) // Bb in F
    expect(staffPos(66, 1)).toEqual({ step: 1, acc: '' }) // F# in G
    expect(staffPos(67, 0)).toEqual({ step: 2, acc: '' }) // G in C
  })

  it('marks pitches outside the key', () => {
    expect(staffPos(66, 0)).toEqual({ step: 1, acc: '#' }) // F# in C
    expect(staffPos(63, -1)).toEqual({ step: 0, acc: 'b' }) // Eb in F
    expect(staffPos(71, -1)).toEqual({ step: 4, acc: 'n' }) // B natural in F
    expect(staffPos(65, 2)).toEqual({ step: 1, acc: 'n' }) // F natural in D
  })

  it('flips the page every 4 bars on a wide staff, every 2 on a narrow one', () => {
    const bars = [0, 2, 4, 6, 8, 10]
    expect(pageOf(bars, 0, 4)).toBe(0)
    expect(pageOf(bars, 7.9, 4)).toBe(0)
    expect(pageOf(bars, 8, 4)).toBe(1)
    expect(pageOf(bars, -1, 4)).toBe(0)
    expect(pageOf(bars, 3.9, 2)).toBe(0)
    expect(pageOf(bars, 4, 2)).toBe(1)
    expect(pageOf(bars, 8, 2)).toBe(2)
  })

  it('allows one bar per 150 css px, 2 to 4', () => {
    expect(barsPerPage(300)).toBe(2)
    expect(barsPerPage(449)).toBe(2)
    expect(barsPerPage(450)).toBe(3)
    expect(barsPerPage(600)).toBe(4)
    expect(barsPerPage(900)).toBe(4)
  })
})

describe('note values', () => {
  it('maps dur in quarters to the written value', () => {
    expect(noteValue(4)).toEqual({ base: 4, dot: false }) // whole
    expect(noteValue(3)).toEqual({ base: 2, dot: true }) // dotted half
    expect(noteValue(2)).toEqual({ base: 2, dot: false })
    expect(noteValue(1.5)).toEqual({ base: 1, dot: true })
    expect(noteValue(1)).toEqual({ base: 1, dot: false })
    expect(noteValue(0.75)).toEqual({ base: 0.5, dot: true })
    expect(noteValue(0.5)).toEqual({ base: 0.5, dot: false })
    expect(noteValue(0.25)).toEqual({ base: 0.25, dot: false })
  })

  it('quantises odd durations to the nearest value', () => {
    expect(noteValue(0.9)).toEqual({ base: 1, dot: false })
    expect(noteValue(1.4)).toEqual({ base: 1, dot: true })
    expect(noteValue(2.2)).toEqual({ base: 2, dot: false })
    expect(noteValue(0.3)).toEqual({ base: 0.25, dot: false })
    expect(noteValue(0.1)).toEqual({ base: 0.25, dot: false })
    expect(noteValue(5)).toEqual({ base: 4, dot: false })
  })
})

describe('rests', () => {
  const n = (beat: number, len: number) => ({ beat, len })
  it('fills an empty bar with one whole-bar rest, also in 3/4', () => {
    expect(restsIn([], 4)).toEqual([n(0, 4)])
    expect(restsIn([], 3)).toEqual([n(0, 3)])
  })
  it('fills the gaps before, between and after notes on the beat grid', () => {
    // 4/4: quarter on 1, eighth on 2.5 -> quarter rest on 0, eighth rest on 2, quarter rest on 3
    expect(restsIn([n(1, 1), n(2.5, 0.5)], 4)).toEqual([n(0, 1), n(2, 0.5), n(3, 1)])
  })
  it('uses a half rest only on a half-bar boundary', () => {
    expect(restsIn([n(0, 1)], 4)).toEqual([n(1, 1), n(2, 2)])
    expect(restsIn([n(0, 2)], 4)).toEqual([n(2, 2)])
    expect(restsIn([n(3, 1)], 4)).toEqual([n(0, 2), n(2, 1)])
  })
  it('splits off-beat gaps into eighths and sixteenths', () => {
    expect(restsIn([n(0, 0.25), n(1, 1)], 4)).toEqual([n(0.25, 0.25), n(0.5, 0.5), n(2, 2)])
  })
  it('quantises gaps shorter than an eighth of a beat away', () => {
    expect(restsIn([n(0, 0.95), n(1, 3)], 4)).toEqual([])
    expect(restsIn([n(0, 1), n(1.1, 2.9)], 4)).toEqual([])
  })
  it('treats overlapping notes (other voices) as one covered span', () => {
    expect(restsIn([n(0, 2), n(1, 2)], 4)).toEqual([n(3, 1)])
  })
})

describe('bar spacing', () => {
  it('spaces equal values equally', () => {
    expect(layoutBar([0, 1, 2, 3], 4, 400, [0, 0, 0, 0, 0])).toEqual([0, 100, 200, 300])
  })

  it('gives longer notes more room, less than proportional', () => {
    // half + two quarters: 2^0.6 = 1.516 against 1, so the half takes 400 · 1.516 / 3.516 = 172.45
    const [a, b, c] = layoutBar([0, 2, 3], 4, 400, [0, 0, 0, 0])
    expect(a).toBe(0)
    expect(b).toBeCloseTo(172.45, 1)
    expect(c - b).toBeCloseTo(113.8, 1)
  })

  it('keeps the rest before the first note', () => {
    expect(layoutBar([1, 2, 3], 4, 400, [0, 0, 0, 0])).toEqual([100, 200, 300])
  })

  it('holds a minimum distance and takes it from the long notes', () => {
    // four sixteenths would get 23.7 each; they get 30 and the dotted half the rest
    expect(layoutBar([0, 0.25, 0.5, 0.75, 1], 4, 200, [0, 30, 30, 30, 30, 0])).toEqual([0, 30, 60, 90, 120])
  })

  it('squeezes evenly when even the minimum does not fit', () => {
    expect(layoutBar([0, 0.5, 1, 1.5], 4, 60, [0, 30, 30, 30, 30])).toEqual([0, 15, 30, 45])
  })
})

describe('lyric-aware page layout', () => {
  // px at scale 1: head 16 (+12 before an accidental), bar pad 18, tail 10, 4 px between labels, empty bar 40
  const opts = { barQ: 4, leftRoom: 40, head: 16, acc: 12, pad: 18, tail: 10, sep: 4, empty: 40, minScale: 10 / 12 }
  const on = (bar: number, beat: number, label: number, acc = false): PageOnset => ({ bar, beat, label, acc })
  /** Every label drawn, none overlapping another in its row, none past the page edges. */
  const check = (onsets: PageOnset[], width: number, r: ReturnType<typeof layoutPage>) => {
    expect(r.xs).toHaveLength(onsets.length)
    const half = (k: number) => (onsets[k].label * r.scale) / 2
    onsets.forEach((_, k) => {
      expect(r.xs[k] - half(k), `left edge of ${k}`).toBeGreaterThanOrEqual(-opts.leftRoom - 1e-6)
      expect(r.xs[k] + half(k), `right edge of ${k}`).toBeLessThanOrEqual(width + 1e-6)
      const next = k + 1
      if (next < onsets.length) expect(r.xs[next] - r.xs[k], `labels ${k} and ${next}`).toBeGreaterThanOrEqual(half(k) + half(next) + opts.sep - 1e-6)
    })
  }

  it('keeps the normal size when the labels fit', () => {
    const onsets = [on(0, 0, 20), on(0, 2, 30), on(1, 0, 25), on(1, 1, 40)]
    const r = layoutPage([0, 1], onsets, { ...opts, width: 400 })
    expect(r).toMatchObject({ scale: 1, fits: true })
    check(onsets, 400, r)
  })

  it('gives a bar with long syllables more width than a sparse one', () => {
    const onsets = [on(0, 0, 10), on(1, 0, 60), on(1, 1, 60), on(1, 2, 60), on(1, 3, 60)]
    const r = layoutPage([0, 1], onsets, { ...opts, width: 400 })
    expect(r.barW[1]).toBeGreaterThan(r.barW[0] * 2)
    expect(r.barW[0] + r.barW[1]).toBeCloseTo(400)
    check(onsets, 400, r)
  })

  it('keeps labels apart across a bar line', () => {
    const onsets = [on(0, 0, 10), on(0, 3.5, 50), on(1, 0, 50)]
    const r = layoutPage([0, 1], onsets, { ...opts, width: 300 })
    check(onsets, 300, r)
  })

  it('shrinks the lyric font when the labels do not fit', () => {
    // 8 eighths of 40 px labels: 8 · 44 = 352 needed at normal size
    const onsets = Array.from({ length: 8 }, (_, i) => on(Math.floor(i / 4), (i % 4) * 0.5, 40))
    const r = layoutPage([0, 1], onsets, { ...opts, width: 330 })
    expect(r.fits).toBe(true)
    expect(r.scale).toBeLessThan(1)
    expect(r.scale).toBeGreaterThanOrEqual(opts.minScale)
    check(onsets, 330, r)
  })

  it('says when even the small font does not fit', () => {
    const onsets = Array.from({ length: 16 }, (_, i) => on(Math.floor(i / 8), (i % 8) * 0.5, 40, i % 3 === 0))
    expect(layoutPage([0, 1], onsets, { ...opts, width: 500 }).fits).toBe(false)
  })

  it('puts each bar right after the previous one, its notes inside it', () => {
    const onsets = [on(0, 0, 20), on(0, 2, 30), on(1, 1, 60), on(2, 0, 10), on(2, 3, 25)]
    const r = layoutPage([0, 1, 2], onsets, { ...opts, width: 600 })
    expect(r.barX[0]).toBe(0)
    expect(r.barX[1]).toBeCloseTo(r.barW[0])
    expect(r.barX[2]).toBeCloseTo(r.barW[0] + r.barW[1])
    expect(r.barX[2] + r.barW[2]).toBeCloseTo(600)
    onsets.forEach((p, k) => {
      expect(r.xs[k]).toBeGreaterThanOrEqual(r.barX[p.bar] + opts.pad - 1e-6) // room for an accidental after the bar line
      expect(r.xs[k]).toBeLessThanOrEqual(r.barX[p.bar] + r.barW[p.bar] - opts.tail + 1e-6)
    })
  })

  it('gives a rest its own place between notes, without a label', () => {
    const onsets = [on(0, 0, 30), on(0, 1, 0), on(0, 2, 30)] // quarter, quarter rest, half
    const r = layoutPage([0], onsets, { ...opts, width: 300 })
    expect(r.xs[1] - r.xs[0]).toBeGreaterThanOrEqual(opts.head)
    expect(r.xs[2] - r.xs[1]).toBeGreaterThanOrEqual(opts.head)
    check(onsets, 300, r)
  })

  it('leaves an empty bar its minimum width', () => {
    const onsets = [on(0, 0, 30), on(0, 1, 30)]
    const r = layoutPage([0, 1], onsets, { ...opts, width: 400 })
    expect(r.barW[1]).toBeGreaterThan(0)
    check(onsets, 400, r)
  })
})
describe('staff pages', () => {
  it('fill up to the most bars, fewer where the syllables do not fit on one row', () => {
    // bars 2 and 3 are dense: together with a neighbour they do not fit
    const dense = (b: number) => b === 2 || b === 3
    const fits = (first: number, count: number) => count === 1 || !Array.from({ length: count }, (_, i) => first + i).some(dense)
    expect(splitPages(7, 2, fits)).toEqual([
      [0, 2],
      [2, 1],
      [3, 1],
      [4, 2],
      [6, 1],
    ])
  })
  it('find the page of a song time', () => {
    const pages: [number, number][] = [
      [0, 2],
      [2, 1],
      [3, 2],
    ]
    const bars = [0, 2, 4, 6, 8]
    expect(pageAt(pages, bars, -5)).toEqual([0, 2])
    expect(pageAt(pages, bars, 3.9)).toEqual([0, 2])
    expect(pageAt(pages, bars, 4)).toEqual([2, 1])
    // a seek to a bar start lands a hair before it (audio time rounding): still that bar's page
    expect(pageAt(pages, bars, 3.999999)).toEqual([2, 1])
    expect(pageAt(pages, bars, 9)).toEqual([3, 2])
  })
})

describe('note colour', () => {
  it('takes the role colour when given, else accent for mine and other for the rest', () => {
    expect(noteColour('anna', false, { anna: '#123456' })).toBe('#123456')
    expect(noteColour('anna', true, { anna: '#123456' })).toBe('#123456')
    expect(noteColour('anna', true, { mutter: '#123456' })).toBe(COLORS.accent)
    expect(noteColour('anna', false)).toBe(COLORS.other)
  })
})

describe('staff playhead', () => {
  // bar line at 0 s / 40 px, onsets at 0 s / 60 px and 1 s / 200 px, page end 2 s / 300 px
  const points: [number, number][] = [
    [0, 40],
    [0, 60],
    [1, 200],
    [2, 300],
  ]
  it('sits on an onset at its time and moves linearly to the next', () => {
    expect(playheadX(points, 0)).toBe(60)
    expect(playheadX(points, 0.5)).toBe(130)
    expect(playheadX(points, 1)).toBe(200)
    expect(playheadX(points, 1.5)).toBe(250)
  })
  it('stays inside the page', () => {
    expect(playheadX(points, -1)).toBe(40)
    expect(playheadX(points, 5)).toBe(300)
  })
  it('puts a sung note at its own start, not where the bar grid would put its beat', () => {
    // bars 0 s and 2 s; an upbeat on beat 3.5 sung late at 1.9 s (the grid says 1.75 s), a rest on beat 2
    const note = (start: number, bar: number, beat: number) =>
      ({ start, end: start + 0.1, midi: 60, syllable: 'x', role: 'chor', phrase: 0, bar, beat, dur: 0.5 }) as Note
    const song = { timeSig: [4, 4], bars: [0, 2, 4], notes: [] } as unknown as Song
    const [a, b] = [note(0.1, 0, 0), note(1.9, 0, 3.5)]
    const content = {
      bars: [0],
      notes: [a, b],
      onsets: [
        { bar: 0, beat: 0, here: [a] },
        { bar: 0, beat: 2, here: [] },
        { bar: 0, beat: 3.5, here: [b] },
      ],
      lyric: [],
    }
    const L = { startX: 0, xs: [10, 50, 90], barX: [0], barW: [100] } as unknown as Parameters<typeof pagePoints>[2]
    expect(pagePoints(song, content, L).map(([t]) => t)).toEqual([0, 0.1, 1, 1.9, 2])
  })
})

/** A 2D context that records every method call; enough for the draw functions, which only call and set. */
const recorder = () => {
  const calls: [string, unknown[]][] = []
  const canvas = { clientWidth: 400, clientHeight: 200, width: 0, height: 0 }
  const ctx = new Proxy({ canvas } as Record<string | symbol, unknown>, {
    get: (o, k) =>
      k in o
        ? o[k]
        : (...a: unknown[]) => {
            calls.push([String(k), a])
            return k === 'measureText' ? { width: 10 } : undefined
          },
    set: (o, k, v) => {
      o[k] = v
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('piano roll', () => {
  it('draws no bar for a spoken note and sizes the rows by the sung notes, but shows its syllable', () => {
    const n = (start: number, midi: number, syllable: string, spoken?: boolean) =>
      ({ start, end: start + 1, midi, syllable, role: 'maria', phrase: 0, bar: 0, beat: start, dur: 1, spoken }) as Note
    const song = { notes: [n(1, 60, 'la'), n(2, 71, 'rap', true)], bars: [0], timeSig: [4, 4] } as unknown as Song
    const { ctx, calls } = recorder()
    drawRoll(ctx, { song, roles: ['maria'], names: {}, t: 0.5, frames: [], tolerance: 50 }) // before both: no elapsed fill
    expect(calls.filter(([k]) => k === 'roundRect')).toHaveLength(1)
    const texts = calls.filter(([k]) => k === 'fillText').map(([, a]) => a[0])
    expect(texts).toContain('rap')
    expect(texts.length - 2).toBe(10) // row labels: 60 ± 2 padded to 10 rows; with the spoken 71 it would be 16
  })
})

describe('staff arcs', () => {
  const n = (beat: number, flags: Partial<Note> = {}, bar = 0) =>
    ({ start: bar * 4 + beat, end: bar * 4 + beat + 1, midi: 67, syllable: 'la', role: 'chor', phrase: 0, bar, beat, dur: 1, ...flags }) as Note
  /** Arcs drawn on the page at `t`, one bar per page. */
  const arcs = (notes: Note[], t = 0) => {
    const song = { id: 'x', key: 'C', timeSig: [4, 4], bars: [0, 4, 8], notes, phrases: [], sections: [] } as unknown as Song
    const { ctx, calls } = recorder()
    drawStaff(ctx, { song, roles: ['chor'], names: {}, t, frames: [], tolerance: 50, bars: 1 })
    return calls.filter(([k]) => k === 'bezierCurveTo').length // quarters: no flags, so every curve is an arc
  }
  it('draws one arc from a slur or tie note to the next note of its role', () => {
    expect(arcs([n(0, { slur: true }), n(1), n(2)])).toBe(1)
    expect(arcs([n(0, { tie: true }), n(1), n(2)])).toBe(1)
    expect(arcs([n(0), n(1), n(2)])).toBe(0)
  })
  it('leads an arc to the note starting at its end, not to an overlapping note that starts earlier', () => {
    const [tie, early, cont] = [n(0, { tie: true }), n(0.5), n(1)]
    expect(arcTarget([tie, early, cont], 0)).toBe(2)
    expect(arcTarget([tie], 0)).toBe(-1)
  })
  it('runs a tie over a page turn out at the page end and in at the next page start', () => {
    const notes = [n(3, { tie: true }), n(0, {}, 1), n(1, {}, 1)]
    expect(arcs(notes, 0)).toBe(1)
    expect(arcs(notes, 4.5)).toBe(1)
  })
})

describe('roll window and lyric strip', () => {
  it('shows 5 s on a phone, more on a wider canvas, at most 8 s', () => {
    expect(rollWindow(320)).toBe(5)
    expect(rollWindow(504)).toBe(7)
    expect(rollWindow(1200)).toBe(8)
  })
  it('keeps every syllable at its note, pushed right only where it would touch the previous one', () => {
    expect(lyricXs([0, 50, 60, 200], [30, 30, 30, 10], 6)).toEqual([0, 50, 86, 200])
  })
})

describe('roll layout', () => {
  it('spans my notes in view ±2 semitones', () => {
    expect(rowRange([60, 72])).toEqual([58, 74])
  })

  it('keeps at least 10 rows, centred', () => {
    expect(rowRange([67])).toEqual([62, 71])
    expect(rowRange([67, 69])).toEqual([63, 72])
    expect(rowRange([])).toHaveLength(2)
  })

  const n = (start: number, end: number, midi: number) => ({ start, end, midi }) as Note
  const mine = [n(1, 2, 62), n(3, 4, 70)]

  it('folds a sung pitch into the octave of the target at that time', () => {
    expect(foldToTargetOctave(50.3, 1.5, mine)).toBeCloseTo(62.3)
    expect(foldToTargetOctave(74, 1.5, mine)).toBe(62)
    expect(foldToTargetOctave(68, 1.5, mine)).toBe(68) // 6 above stays rather than jumping down
    expect(foldToTargetOctave(55.5, 1.5, mine)).toBeCloseTo(67.5)
    expect(foldToTargetOctave(58, 3.5, mine)).toBe(70)
  })

  it('folds between notes to the nearest one in time', () => {
    expect(foldToTargetOctave(58, 2.4, mine)).toBe(58) // nearer the 62, and 58 is already in its octave
    expect(foldToTargetOctave(46, 2.8, mine)).toBe(70)
    expect(foldToTargetOctave(46, 0, mine)).toBe(58)
  })

  it('leaves the pitch alone without any note', () => {
    expect(foldToTargetOctave(46, 0, [])).toBe(46)
  })
})
