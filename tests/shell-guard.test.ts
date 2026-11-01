import { describe, expect, it } from 'vitest'
import type { AppContext } from '../src/app/context'
import { guard } from '../src/app/shell'

const ctx = (live: string | null, ready = true) =>
  ({ vault: { state: () => 'unlocked' }, library: { isReady: () => ready }, live: live && { songId: live } }) as unknown as AppContext

describe('shell guard, results route', () => {
  it('without a live session (reload) goes to practice of a ready song', () => {
    expect(guard(ctx(null), '#/results/08')).toBe('#/practice/08')
  })
  it('with a live session of another song goes to practice', () => {
    expect(guard(ctx('07'), '#/results/08')).toBe('#/practice/08')
  })
  it('with the live session stays', () => {
    expect(guard(ctx('08'), '#/results/08')).toBe('#/results/08')
  })
  it('of a song not ready goes to songs', () => {
    expect(guard(ctx(null, false), '#/results/08')).toBe('#/songs')
  })
})
