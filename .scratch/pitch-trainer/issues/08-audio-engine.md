# 08: Audio engine

**What to build:** Two-stem playback (voices, backing) through Web Audio gain nodes with role-based muting in three voicetrack modes, tempo 100/90/80/70 with pitch preserved, phrase loop, drift sync, and `tick`/`loop`/`ended`/`enter` events.

**Blocked by:** 02 (content format)

**Status:** ready-for-agent

Spec: `specs/audio-engine.spec.md`. ADRs 0003 and 0005. Role spans from `roleSpans` in `src/core/content.ts`.

Testing: constructor takes a factory for media elements, an audio context factory (gain nodes with `gain.setValueAtTime`/`linearRampToValueAtTime`) and a clock/raf function; steps drive fakes. Gain scheduling is observable: the steps read the scheduled gain value at a time by replaying the fake gain node's recorded automation. Keep the fakes in the step file, not in `src/`.

- [ ] All scenarios pass via `tests/specs/audio-engine.test.ts` + `tests/steps/audio-engine.steps.ts`.
- [ ] `unload` revokes object URLs created in `load`.
- [ ] Mode change while playing re-schedules gains with a 30 ms ramp.
