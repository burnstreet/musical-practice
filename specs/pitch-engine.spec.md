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
  start(songTime: () => number, playbackLatency?: () => number, deviceId?: string): Promise<StartResult>   // requests mic; latency in s, default 0; deviceId '' = auto
  setDevice(deviceId: string): Promise<StartResult>       // restarts with the same clocks when running
  clocks(): [songTime: () => number, playbackLatency: () => number]  // of the last start, to restore after calibration
  devices(): Promise<{ deviceId: string; label: string }[]> // audio inputs, labels only after permission
  stop(): void
  setDelayMs(ms: number | null): void                     // settings.delayMs: total scoring delay, null = reported latencies
  on(ev: 'frame', fn: (f: PitchFrame) => void): void
  level(): number                                         // last rms 0..1, for mic test
  inputLatency(): number                                  // mic context baseLatency in s, 0 when unknown or stopped
}
```

Constants (one file `pitch-constants.ts`): window 1024, hop 256, clarity threshold 0.9, fmin 80 Hz, fmax 1100 Hz. Sample rate = AudioContext rate. At 48 kHz: frame every 5.3 ms, detection delay (window centre) 10.7 ms. 1024 samples still resolve E2 (82 Hz) with harmonics; fmin stays 80 Hz (lowest packed score note G3, a male singer folds to G2).

- Detector: McLeod pitch method (pitchy). Frame every hop. `midi = 69 + 12·log2(hz/440)` as float. `midi = null` when clarity below threshold or hz outside range.
- Detection delay `d = WINDOW / 2 / ctx.sampleRate`: the window's centre is what the frame measures.
- Live stamp (drawing, readout): `at = songTime() − d`, read when the frame arrives. The newest point sits at the playhead whatever latency the device reports.
- Scoring stamp: song position the singer reacted to. `t = songTime() − d − delay`, read when the frame arrives. `delay` = `delayMs/1000` when set (measured by the calibration or set on the slider), else `playbackLatency() + micCtx.baseLatency` as reported. `playbackLatency` = `engine.latency()` (the playback context, see audio engine). The mic context's `outputLatency` is not on the path (the mic is not played out). Missing values count as 0. A set delay replaces the reported values because some browsers report far more than the real latency (Android Chrome: 393 ms reported, 156 ms measured).
- Both AudioContexts (mic here, playback in the audio engine) are created with `latencyHint: 'interactive'`.
- `start` returns `denied` on permission error, `unsupported` when AudioWorklet or getUserMedia missing. Mic constraints: `echoCancellation false, noiseSuppression false, autoGainControl false`.
- `stop` releases the track.
- Input device: output goes to the headphones, input should be the phone's own mic (a Bluetooth headset mic adds latency and forces call quality). `deviceId` set: request `deviceId: { exact }`; if that fails for any reason but denied permission (device gone), fall back to the default device. `deviceId` '' (auto): open the default device (permission), then `enumerateDevices` and `pickMic`: the first audio input whose label (case-insensitive) contains `built-in`, `eingebaut`, `iphone`, `ipad`, `speakerphone`, `phone microphone` or `internal` and none of `bluetooth`, `headset`, `airpods`, `buds`, `hands-free`. When it is another device than the open one, reopen on it (keep the default if that fails). No match: the default device.
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
    Given songTime returns 10.000, playback latency 0.300, mic baseLatency 0.010, mic outputLatency 0.030 and delay auto
    When a frame arrives
    Then its at is 9.989 and its t is 9.679
    And inputLatency() is 0.010
    And clocks() gives back song time 10.000 and playback latency 0.300

  Scenario: a set delay replaces the reported latencies
    Given songTime returns 10.000, playback latency 0.300, mic baseLatency 0.010, mic outputLatency 0.030 and delay 150 ms
    When a frame arrives
    Then its at is 9.989 and its t is 9.839

  Scenario: no playback latency given
    Given songTime returns 10.000, mic baseLatency 0.010, mic outputLatency 0.030 and delay auto
    When a frame arrives
    Then its at is 9.989 and its t is 9.979

Feature: Input device
  Scenario: auto picks the built-in mic, not the headset
    Given audio inputs "AirPods Pro", "iPhone Mikrofon"
    Then pickMic chooses "iPhone Mikrofon"
    Given audio inputs "Headset (Bluetooth)", "Internal Microphone"
    Then pickMic chooses "Internal Microphone"
    Given audio inputs "Galaxy Buds phone microphone", "USB Mic"
    Then pickMic chooses the default device

  Scenario: auto reopens on the built-in mic after permission
    Given the default device is "AirPods Pro" and inputs "AirPods Pro", "Eingebautes Mikrofon"
    When I start with device auto
    Then the mic is "Eingebautes Mikrofon" and the AirPods track is stopped

  Scenario: chosen device gone falls back to the default
    Given the chosen device "gone" is not available
    When I start with device "gone"
    Then the result is "ok" on the default device

Feature: Permission
  Scenario: mic denied
    Given getUserMedia rejects with NotAllowedError
    When I start
    Then the result is "denied" and no frames arrive
```
