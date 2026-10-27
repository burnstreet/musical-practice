# Media elements for stem playback instead of Web Audio buffers

Slowing a song without changing pitch is only available on HTML media elements (`preservesPitch`); Web Audio buffer sources change pitch with rate, and time-stretch libraries in a worklet cost quality and effort. We decided (2026-10-27) to play each stem in its own media element, routed through Web Audio gain nodes for muting, and to keep the two elements in sync by periodic drift correction.

## Consequences

- Sync between two elements is not sample-exact; drift above 25 ms is corrected on each tick.
- Decrypted audio reaches the elements as in-memory blob URLs, never as files.
- Pre-rendering stretched stems in the builder was rejected: it would multiply the bundle size per tempo step.
