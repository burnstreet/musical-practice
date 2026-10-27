---
name: Audio engine
description: Two-stem playback with role-based muting, three voicetrack modes, tempo without pitch change, phrase loop, sync, time ticks.
targets:
  - ../src/core/audio-engine.ts
---

# Audio engine

Wraps two media elements (voices, backing) routed through Web Audio gain nodes. Tests inject a fake element factory and a fake clock.

```ts { .api }
export type Mode = 'all' | 'others' | 'backing'
export type Tempo = 100 | 90 | 80 | 70

export interface AudioEngine {
  load(song: LoadedSong, roles: RoleId[]): Promise<void>
  unload(): void                                   // revokes blob URLs
  play(): Promise<void>
  pause(): void
  seek(sec: number): void
  setMode(m: Mode): void
  setTempo(t: Tempo): void
  setLoop(phrase: Phrase | null): void
  time(): number                                   // song seconds, tempo-independent
  playing(): boolean
  on(ev: 'tick', fn: (t: number) => void): void    // every animation frame while playing
  on(ev: 'loop', fn: (phrase: Phrase) => void): void
  on(ev: 'ended', fn: () => void): void
  on(ev: 'enter', fn: (note: Note) => void): void  // playhead crossed note.start forward, or landed inside after seek
}
```

- Voices gain: `all` 1, `backing` 0, `others` 1 outside selected-role spans, 0 inside. Spans from `roleSpans(notes, roles)`. Fade out begins 150 ms before span start, 30 ms ramp. Fade in at span end, 30 ms ramp. Backing gain always 1.
- Mode change while playing applies at once with 30 ms ramp.
- Tempo: both elements `playbackRate = t / 100`, `preservesPitch = true`. `time()` reads the voices element.
- Sync: each tick compare backing to voices. Drift over 25 ms: set backing time to voices time.
- Loop: when `time()` reaches `phrase.end`, seek to `phrase.start`, emit `loop`. Null clears.
- `ended`: voices element ends and no loop. Engine pauses.
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

Feature: Loop
  Scenario: phrase repeats
    Given phrase 2 spanning [10.0,14.0] set as loop
    When time() passes 14.0
    Then time() is 10.0, a loop event names phrase 2, and playback continues

Feature: Enter events
  Scenario: forward playback
    Given notes starting at 1.0 and 1.2
    When ticks occur at 0.9 and 1.25
    Then enter fires for both notes in order

  Scenario: seek inside a note
    Given a note [5.0,6.0]
    When I seek to 5.5
    Then enter fires once for that note

Feature: End
  Scenario: song ends
    Given no loop set
    When the voices element ends
    Then ended fires and playing() is false
```
