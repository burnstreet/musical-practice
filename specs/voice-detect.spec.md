---
name: Voice detect
description: Decides from mic level frames when the actor starts and stops speaking. Pure, energy threshold with hysteresis and per-turn noise floor.
targets:
  - ../src/core/voice-detect.ts
---

# Voice detect

Pure. Input: the `rms` and `at` of the pitch engine's frames (no second mic). Output: `speechStart`, `speechEnd`. Silero VAD only if this fails on real devices.

```ts { .api }
export interface LevelFrame { at: number; rms: number }   // at in s, rms 0..1
export type VoiceEvent = 'speechStart' | 'speechEnd'
export interface VoiceDetect {
  reset(): void                               // on every new turn of the actor
  push(f: LevelFrame): VoiceEvent | null
}
export function createVoiceDetect(opts: { silenceMs: number }): VoiceDetect
```

- Floor: median `rms` of the frames in the first 250 ms after `reset`, capped at 0.02. No event in that time.
- `on` = max(3 × floor, 0.008). `off` = 0.6 × `on`.
- `speechStart`: `rms ≥ on` without break for 120 ms. Once per speech.
- After `speechStart`: `speechEnd` when `rms < off` without break for `silenceMs`. A frame with `rms ≥ off` restarts that count. So the cue engine moves on at `speechEnd` itself.
- After `speechEnd` a new `speechStart` can follow.
- `silenceMs` from settings: default 1200, range 500 to 3000.
  `[@test] ../tests/steps/voice-detect.steps.ts`

```gherkin
Feature: Voice detect
  Scenario: speech then silence
    Given silenceMs 1200 and frames every 5 ms
    When rms is 0.002 for 300 ms, 0.1 for 1000 ms, then 0.002 for 1500 ms
    Then speechStart comes at about 420 ms and speechEnd at about 2500 ms

  Scenario: pause shorter than the silence time
    Given silenceMs 1200
    When rms is 0.002 for 300 ms, 0.1 for 500 ms, 0.002 for 800 ms, 0.1 for 500 ms, then 0.002 for 1500 ms
    Then there is one speechStart and one speechEnd

  Scenario: click is no speech
    Given silenceMs 1200
    When rms is 0.002 for 300 ms, 0.2 for 50 ms, then 0.002 for 2000 ms
    Then no event comes

  Scenario: noisy room raises the threshold
    Given silenceMs 1200
    When rms is 0.01 for 300 ms, then 0.02 for 1000 ms
    Then no event comes

  Scenario: nothing during the floor time
    Given silenceMs 1200
    When rms is 0.1 from the start for 200 ms, then 0.002 for 2000 ms
    Then no event comes
```
