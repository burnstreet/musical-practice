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
export interface PitchFrame { t: number; at: number; midi: number | null; clarity: number; rms: number }  // t scored, at drawn
export type StartResult = 'ok' | 'denied' | 'unsupported'

export interface PitchEngine {
  start(songTime: () => number, playbackLatency?: () => number): Promise<StartResult>   // requests mic; latency in s, default 0
  stop(): void
  setOffsetMs(ms: number): void                           // user setting, -300..300
  on(ev: 'frame', fn: (f: PitchFrame) => void): void
  level(): number                                         // last rms 0..1, for mic test
  inputLatency(): number                                  // mic context baseLatency in s, 0 when unknown or stopped
}
```

Constants (one file `pitch-constants.ts`): window 1024, hop 256, clarity threshold 0.9, fmin 80 Hz, fmax 1100 Hz. Sample rate = AudioContext rate. At 48 kHz: frame every 5.3 ms, detection delay (window centre) 10.7 ms. 1024 samples still resolve E2 (82 Hz) with harmonics; fmin stays 80 Hz (lowest packed score note G3, a male singer folds to G2).

- Detector: McLeod pitch method (pitchy). Frame every hop. `midi = 69 + 12·log2(hz/440)` as float. `midi = null` when clarity below threshold or hz outside range.
- Detection delay `d = WINDOW / 2 / ctx.sampleRate`: the window's centre is what the frame measures.
- Live stamp (drawing, readout): `at = songTime() − d`, read when the frame arrives. The newest point sits at the playhead whatever latency the device reports.
- Scoring stamp: song position the singer reacted to. `t = songTime() − d − playbackLatency() − micCtx.baseLatency − offsetMs/1000`, read when the frame arrives. `playbackLatency` = `engine.latency()` (the playback context, see audio engine). The mic context's `outputLatency` is not on the path (the mic is not played out). Missing values count as 0.
- Both AudioContexts (mic here, playback in the audio engine) are created with `latencyHint: 'interactive'`.
- `start` returns `denied` on permission error, `unsupported` when AudioWorklet or getUserMedia missing. Mic constraints: `echoCancellation false, noiseSuppression false, autoGainControl false`.
- `stop` releases the track.
  `[@test] ../tests/steps/pitch-engine.steps.ts`

```gherkin
Feature: Detection
  Scenario: steady tone
    Given a 440 Hz sine fed as audio
    When frames arrive
    Then midi is within 0.1 of 69 and clarity is above 0.9

  Scenario: singing range with harmonics
    Given voice-like tones at 82.41, 98, 130.81, 196, 261.63, 440, 659.26, 880 Hz fed as audio
    When frames arrive
    Then each midi is within 0.1 of its tone and clarity is above 0.9

  Scenario: noise is unvoiced
    Given white noise fed as audio
    When frames arrive
    Then midi is null

  Scenario: silence is unvoiced
    Given silence fed as audio
    When frames arrive
    Then midi is null

  Scenario: out of range is unvoiced
    Given a 50 Hz sine fed as audio
    When frames arrive
    Then midi is null

Feature: Time stamps
  Scenario: latency subtracted for scoring, not for drawing
    Given songTime returns 10.000, playback latency 0.300, mic baseLatency 0.010, mic outputLatency 0.030 and offset 50 ms
    When a frame arrives
    Then its at is 9.989 and its t is 9.629
    And inputLatency() is 0.010

  Scenario: no playback latency given
    Given songTime returns 10.000, mic baseLatency 0.010, mic outputLatency 0.030 and offset 0 ms
    When a frame arrives
    Then its at is 9.989 and its t is 9.979

Feature: Permission
  Scenario: mic denied
    Given getUserMedia rejects with NotAllowedError
    When I start
    Then the result is "denied" and no frames arrive
```
