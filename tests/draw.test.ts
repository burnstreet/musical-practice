import { describe, expect, it } from 'vitest'
import { foldToTargetOctave, rowRange } from '../src/app/draw/roll'
import { barsPerPage, keyFifths, labelSize, layoutBar, noteValue, pageOf, staffPos } from '../src/app/draw/staff'
import type { Note } from '../src/core/content'

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

  it('shows 2 bars below 560 css px, else 4', () => {
    expect(barsPerPage(360)).toBe(2)
    expect(barsPerPage(559)).toBe(2)
    expect(barsPerPage(560)).toBe(4)
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

describe('bar spacing', () => {
  it('spaces equal values equally', () => {
    expect(layoutBar([0, 1, 2, 3], 4, 400, 0)).toEqual([0, 100, 200, 300])
  })

  it('gives longer notes more room, less than proportional', () => {
    // half + two quarters: 2^0.6 = 1.516 against 1, so the half takes 400 · 1.516 / 3.516 = 172.45
    const [a, b, c] = layoutBar([0, 2, 3], 4, 400, 0)
    expect(a).toBe(0)
    expect(b).toBeCloseTo(172.45, 1)
    expect(c - b).toBeCloseTo(113.8, 1)
  })

  it('keeps the rest before the first note', () => {
    expect(layoutBar([1, 2, 3], 4, 400, 0)).toEqual([100, 200, 300])
  })

  it('holds a minimum distance and takes it from the long notes', () => {
    // four sixteenths would get 23.7 each; they get 30 and the dotted half the rest
    expect(layoutBar([0, 0.25, 0.5, 0.75, 1], 4, 200, 30)).toEqual([0, 30, 60, 90, 120])
  })

  it('squeezes evenly when even the minimum does not fit', () => {
    expect(layoutBar([0, 0.5, 1, 1.5], 4, 60, 30)).toEqual([0, 15, 30, 45])
  })
})

describe('syllable labels', () => {
  it('keeps the size when the text fits', () => {
    expect(labelSize(20, 30, 12, 9)).toBe(12)
  })
  it('shrinks to fit, down to the minimum', () => {
    expect(labelSize(40, 30, 12, 9)).toBe(9)
    expect(labelSize(36, 33, 12, 9)).toBeCloseTo(11)
  })
  it('skips a label that does not fit at the minimum', () => {
    expect(labelSize(60, 30, 12, 9)).toBeNull()
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
