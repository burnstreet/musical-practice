# Specs

Tessl-style: one `.spec.md` per module. Frontmatter `targets` = code the spec covers. Each requirement has a Gherkin scenario in a fenced `gherkin` block; that block is the acceptance test, executed as described in `overview.spec.md` → Testing Decisions. `[@test]` links name the step-definition file.

Read first: `overview.spec.md`, then `content-format.spec.md`.

| file | layer |
|---|---|
| overview | all |
| content-format | business |
| builder | business (Python) |
| vault | business |
| library | business |
| audio-engine | business |
| pitch-engine | business |
| scorer | business |
| history | business |
| shell | presentation |
| screen-start, screen-songs, screen-practice, screen-results | presentation |

Rules: business specs name no screen, string or DOM. Screen specs name no crypto, audio or scoring internals. Lyrics and titles never appear in specs; song ids only.
