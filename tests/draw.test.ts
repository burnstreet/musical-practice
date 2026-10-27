import { describe, expect, it } from 'vitest'
import type { Note } from '../src/core/content'
import { foldToTargetOctave, rowRange } from '../src/app/draw/roll'
import { keyFifths, pageOf, staffPos } from '../src/app/draw/staff'

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

  it('flips the page every 4 bars', () => {
    const bars = [0, 2, 4, 6, 8, 10]
    expect(pageOf(bars, 0)).toBe(0)
    expect(pageOf(bars, 7.9)).toBe(0)
    expect(pageOf(bars, 8)).toBe(1)
    expect(pageOf(bars, -1)).toBe(0)
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
