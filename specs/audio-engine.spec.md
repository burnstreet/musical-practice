---
name: Audio engine
description: Two-stem playback with role-based muting, three voicetrack modes, tempo without pitch change, repeat over a time range, lead-in seek, sync, time ticks.
targets:
  - ../src/core/audio-engine.ts
---

# Audio engine

Wraps two media elements (voices, backing) routed through Web Audio gain nodes. Tests inject a fake element factory and a fake clock.

```ts { .api }
export type Mode = 'all' | 'others' | 'backing'
export type Tempo = 100 | 90 | 80 | 70
export const LEAD_IN_SEC = 3                         // single named value, tunable

/** Repeat range in song seconds. `phrase` set only for the Phrase repeat. `leadIn` true: wrap lands on leadInStart(start). */
export interface Range { start: number; end: number; phrase?: Phrase; leadIn?: boolean }

export function leadInStart(sec: number, bars: number[]): number   // sec − LEAD_IN_SEC, snapped back to the previous bar line, never below 0

export interface AudioEngine {
  load(song: LoadedSong, roles: RoleId[]): Promise<void>
  unload(): void                                   // revokes blob URLs
  play(): Promise<void>
  pause(): void
  seek(sec: number): void
  setMode(m: Mode): void
  setTempo(t: Tempo): void
  setLoop(range: Range | null): void               // the Repeat; "loop" stays the engine name
  seekLeadIn(sec: number): void                    // seek(leadInStart(sec))
  time(): number                                   // song seconds, tempo-independent
  playing(): boolean
  ctxTime(): number                                // playback context clock in s (creates the context if needed)
  click(at: number): () => void                    // 1 kHz 20 ms click at context time at, for calibration; returns stop
  latency(): number                                // s from song time to the speaker: context baseLatency + outputLatency, 0 when missing or not loaded
  on(ev: 'tick', fn: (t: number) => void): void    // every animation frame while playing
  on(ev: 'loop', fn: (phrase: Phrase) => void): void
  on(ev: 'ended', fn: () => void): void
  on(ev: 'pause', fn: () => void): void           // every pause(), whoever called it (settings calibration, end, unload)
  on(ev: 'enter', fn: (note: Note) => void): void  // playhead crossed note.start forward, or landed inside after seek
}
```

- Voices gain: `all` 1, `backing` 0, `others` 1 outside selected-role spans, 0 inside. Spans from `roleSpans(notes, roles)`. Fade out begins 150 ms before span start, 30 ms ramp. Fade in at span end, 30 ms ramp. Backing gain always 1.
- Mode change while playing applies at once with 30 ms ramp.
- Tempo: both elements `playbackRate = t / 100`, `preservesPitch = true`. `time()` reads the voices element.
- Sync: each tick compare backing to voices. Drift over 25 ms: set backing time to voices time.
- Repeat: when `time()` reaches `range.end`, seek to `range.start` (to `leadInStart(range.start, song.bars)` when `range.leadIn`). Emit `loop` with `range.phrase` only when the range has one. Null clears. The range is only what the caller set: the engine never moves it.
- A seek outside the range keeps the range: playback goes on to `range.end`, then wraps.
- `leadInStart(sec, bars)`: `sec − 3`, then the largest bar start at or below that, never below 0. Skips use it through `seekLeadIn`.
- `ended`: voices element ends and no loop. Engine pauses.
- `click(at)`: oscillator 1 kHz, 20 ms, through its own gain with 2 ms fades straight to the destination (voices gain and mode do not touch it). Resumes the context. Stop cancels a click not yet played.
- `latency()`: what the singer hears lags `time()` by this. The pitch engine subtracts it from frame stamps.
- `enter` fires for every note whose `start` lies in (previous tick time, current time], and for notes containing the target after a seek.
  `[@test] ../tests/steps/audio-engine.steps.ts`

```gherkin
Feature: Muting by role
  Scenario: others mode mutes my spans
    Given a song with maria notes at [1.0,2.0] and josef notes at [3.0,4.0], roles [maria], mode others
    When playback runs from 0 to 5
    Then voices gain is 1 at 0.5, 0 at 1.5, 1 at 3.5
    And the ramp to 0 starts at 0.85 and ends by 0.88

  Scenario: all mode never mutes
    Given the same song, roles [maria], mode all
    When playback runs from 0 to 5
    Then voices gain is 1 throughout

  Scenario: backing mode mutes everything
    Given the same song, mode backing
    When playback runs from 0 to 5
    Then voices gain is 0 throughout and backing gain is 1

Feature: Tempo
  Scenario: tempo 80 keeps pitch and song time
    Given a loaded song
    When I set tempo 80 and play for 1 real second
    Then both elements report playbackRate 0.8 and preservesPitch true
    And time() is about 0.8

Feature: Sync
  Scenario: drift corrected
    Given playing at 100 and the backing element reports 0.03 s behind voices
    When a tick runs
    Then backing time is set equal to voices time

  Scenario: small drift tolerated
    Given the backing element reports 0.02 s behind voices
    When a tick runs
    Then backing time is untouched

Feature: Enter events
  Scenario: forward playback
    Given notes starting at 1.0 and 1.2
    When ticks occur at 0.9 and 1.25
    Then enter fires for both notes in order

  Scenario: seek inside a note
    Given a note [5.0,6.0]
    When I seek to 5.5
    Then enter fires once for that note

Feature: Calibration click
  Scenario: click on the playback context
    Given an engine without a song
    When I schedule a click at context time 2.0
    Then a 1000 Hz tone starts at 2.0 and stops at 2.02 into the destination
    And calling its stop cancels it

Feature: Latency
  Scenario: playback latency from the context
    Given a loaded song on a context with baseLatency 0.010 and outputLatency 0.030
    Then latency() is 0.040

  Scenario: latency unknown
    Given a loaded song
    Then latency() is 0.000

Feature: Pause event
  Scenario: pause is announced
    Given no loop set
    When I pause the engine
    Then a pause event fires and playing() is false

Feature: End
  Scenario: song ends
    Given no loop set
    When the voices element ends
    Then ended fires and playing() is false

Feature: Repeat
  Scenario: phrase repeats
    Given phrase 2 spanning [10.0,14.0] set as loop range with phrase 2
    When time() passes 14.0
    Then time() is 10.0, a loop event names phrase 2, and playback continues

  Scenario: plain range wraps without a loop event
    Given a range [20.0,30.0] without phrase
    When time() passes 30.0
    Then time() is 20.0, no loop event fires, and playback continues

  Scenario: range with lead-in wraps before its start
    Given bars at 0, 2, 4, … 2 s apart and a range [21.0,30.0] with leadIn true
    When time() passes 30.0
    Then time() is 18.0

  Scenario: no range
    Given the loop range was set and then cleared with null
    When time() passes the former range end
    Then playback continues past it

  Scenario: manual seek outside the range keeps it
    Given a range [20.0,30.0] and playback at 21.0
    When I seek to 5.0 and playback reaches 30.0
    Then time() is 20.0 after the wrap

Feature: Lead-in
  Scenario: snapped to the bar before
    Given bars 2 s apart
    Then leadInStart(21.0) is 18.0
    And leadInStart(20.0) is 16.0

  Scenario: never before zero
    Given bars 2 s apart
    Then leadInStart(1.0) is 0.0

  Scenario: seekLeadIn seeks there
    Given bars 2 s apart
    When I call seekLeadIn(21.0)
    Then time() is 18.0
```
