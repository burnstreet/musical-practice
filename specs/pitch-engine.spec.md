---
name: Pitch engine
description: Microphone capture, McLeod pitch detection in an AudioWorklet, latency compensation, frame stream, level for mic test.
targets:
  - ../src/core/pitch-engine.ts
  - ../src/core/pitch-worklet.ts
---

# Pitch engine

Mic in, pitch frames out, stamped in song time. Tests inject a fake worklet port and a fake clock.

```ts { .api }
export interface PitchFrame { t: number; midi: number | null; clarity: number; rms: number }
export type StartResult = 'ok' | 'denied' | 'unsupported'

export interface PitchEngine {
  start(songTime: () => number, playbackLatency?: () => number): Promise<StartResult>   // requests mic; latency in s, default 0
  stop(): void
  setOffsetMs(ms: number): void                           // user setting, -300..300
  on(ev: 'frame', fn: (f: PitchFrame) => void): void
  level(): number                                         // last rms 0..1, for mic test
}
```

Constants (one file `pitch-constants.ts`): window 2048, hop 512, clarity threshold 0.9, fmin 80 Hz, fmax 1100 Hz. Sample rate = AudioContext rate.

- Detector: McLeod pitch method (pitchy). Frame every hop. `midi = 69 + 12·log2(hz/440)` as float. `midi = null` when clarity below threshold or hz outside range.
- Time stamp: song position the singer reacted to. `t = songTime() − playbackLatency() − micCtx.baseLatency − offsetMs/1000`, read when the frame arrives. `playbackLatency` = `engine.latency()` (the playback context, see audio engine). The mic context's `outputLatency` is not on the path (the mic is not played out). Missing values count as 0.
- `start` returns `denied` on permission error, `unsupported` when AudioWorklet or getUserMedia missing. Mic constraints: `echoCancellation false, noiseSuppression false, autoGainControl false`.
- `stop` releases the track.
  `[@test] ../tests/steps/pitch-engine.steps.ts`

```gherkin
Feature: Detection
  Scenario: steady tone
    Given a 440 Hz sine fed as audio
    When frames arrive
    Then midi is within 0.1 of 69 and clarity is above 0.9

  Scenario: silence is unvoiced
    Given silence fed as audio
    When frames arrive
    Then midi is null

  Scenario: out of range is unvoiced
    Given a 50 Hz sine fed as audio
    When frames arrive
    Then midi is null

Feature: Time stamps
  Scenario: latency subtracted
    Given songTime returns 10.000, playback latency 0.040, mic baseLatency 0.010, mic outputLatency 0.030 and offset 50 ms
    When a frame arrives
    Then its t is 9.900

  Scenario: no playback latency given
    Given songTime returns 10.000, mic baseLatency 0.010, mic outputLatency 0.030 and offset 0 ms
    When a frame arrives
    Then its t is 9.990

Feature: Permission
  Scenario: mic denied
    Given getUserMedia rejects with NotAllowedError
    When I start
    Then the result is "denied" and no frames arrive
```
