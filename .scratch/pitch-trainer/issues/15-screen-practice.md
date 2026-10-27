# 15: Screen: Singen (live), without the canvases

**What to build:** The live practice screen wired to audio engine, pitch engine and session: header with bar range, key and bpm, voicetrack mode cycling, cents readout with meter, transport (progress bar, loop, phrase start, tempo cycle, pause → results), mic state and banners, no-part hint, headphone sheet on first play, history recording on leave. The two canvases are mounted but drawn by ticket 16.

**Blocked by:** 06 (scorer), 08 (audio engine), 09 (pitch engine), 12 (shell)

**Status:** ready-for-agent

Spec: `specs/screen-practice.spec.md` except the Staff and Piano roll sections. Artboards `design/Main.dc.html`, `design/MainDesktop.dc.html`. Context contract from ticket 12: set `context.live` on enter.

Leave `src/app/draw/staff.ts` and `src/app/draw/roll.ts` as two exported functions with the signature `draw(ctx: CanvasRenderingContext2D | null, state)` that ticket 16 fills in; pass them the current song, roles, time, recent frames and tolerance. happy-dom returns `null` from `getContext`, so drawing must be a no-op when ctx is null.

- [ ] All scenarios pass via `tests/specs/screen-practice.test.ts` + `tests/steps/screen-practice.steps.ts` with fake engine, pitch engine and context.
- [ ] Strings byte-identical to the spec table; note names like `D5` use German-free English note names as in the spec examples.
- [ ] Session glue: engine `enter` → `session.enter`, pitch `frame` → `session.frame`; pause ends the pass and routes to results only when a result exists.
