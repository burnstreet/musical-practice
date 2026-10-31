# Copyrighted material is never tracked in plaintext

Recordings, lyrics, scores and everything derived from them (syllables, note lists, MusicXML, titles) are copyrighted. The repo is the deployment source, so it must hold the content, but only encrypted. We decided that `sources/`, `scores/`, `work/` and the derived files in `web/data/` stay gitignored, that only the encrypted bundle is committed, and that specs, tests, docs and design files use song ids and neutral placeholder text instead of real lyrics or titles.

## Consequences

- Test fixtures use made-up syllables. Design placeholders use public-domain text.
- Role names are character names from the script and may appear in tracked files.
- The builder config with titles lives under `sources/`, gitignored.
- Amended by ADR 0007: the plaintext now lives, versioned, in the production's private content repo; the public repos (engine, site) hold no plaintext.
