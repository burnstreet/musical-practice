/** One run through the song: pitch frames by heard time `t`, oldest first; it covers `from` to `to`. */
export interface Take {
  from: number
  to: number
  t: number[]
  midi: (number | null)[]
}

/** Levels at and above this are hidden: a stretch shows the newest take and three older ones. */
export const HIDDEN = 4
/** A frame this far before the take's latest (repeat wrap, seek back) or after it (seek ahead) starts a new take, s. */
const BACK = 0.05
const AHEAD = 0.5

/** The takes of a session with one song, oldest first. */
export class Takes {
  readonly list: Take[] = []
  private fresh = true

  /** The next frame starts a new take (play). Drops the takes hidden all over. */
  cut(): void {
    this.fresh = true
    const keep = this.list.filter((k, i) => this.list.slice(i + 1).filter((n) => n.from <= k.from && n.to >= k.to).length < HIDDEN)
    this.list.splice(0, this.list.length, ...keep)
  }

  add(t: number, midi: number | null): void {
    let take = this.list.at(-1)
    if (this.fresh || !take || t < take.to - BACK || t > take.to + AHEAD) {
      take = { from: t, to: t, t: [], midi: [] }
      this.list.push(take)
      this.fresh = false
    }
    take.t.push(t)
    take.midi.push(midi)
    take.to = Math.max(take.to, t)
  }
}

/** End of what lies ahead of a take: its latest time plus the length of the two bars from the bar holding it. */
function aheadEnd(take: Take, bars: number[]): number {
  const n = bars.length
  const lastLen = n > 1 ? bars[n - 1] - bars[n - 2] : 2
  const bar = (j: number) => bars[j] ?? bars[n - 1] + (j - n + 1) * lastLen // past the song end: the last bar's length
  const i = Math.max(
    0,
    bars.findLastIndex((b) => b <= take.to),
  )
  return take.to + bar(i + 2) - bar(i)
}

/** Level of take k at `time`: newer takes covering it, plus 1 when any newer take has it ahead. HIDDEN or more: not drawn. */
export function level(takes: Take[], k: number, time: number, bars: number[]): number {
  let covered = 0
  let ahead = 0
  for (let j = k + 1; j < takes.length; j++) {
    const n = takes[j]
    if (n.from <= time && time <= n.to) covered++
    else if (n.to < time && time <= aheadEnd(n, bars)) ahead = 1
  }
  return covered + ahead
}
