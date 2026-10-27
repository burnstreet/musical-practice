# Musical Pitch Trainer

## Problem Statement
A cast member practicing musical songs has no way to tell whether they hit the notes. Existing tools (e.g. OnKey) are Mac-only and tied to streaming services. The practice material is private: audio tracks with and without guide vocals, plus lyrics as PDF/Word. It needs to work on phone and desktop.

## Solution
A password-protected PWA. The user unlocks the song library once, songs are cached on-device, and then they practice offline. The app plays the backing track, shows the lyrics line by line, listens through the microphone, and scores how well the sung pitch matches the original vocal melody.

## User Stories
1. As a singer, I want to unlock the app with a shared password, so that only the cast can access the material.
2. As a singer, I want songs downloaded to my device once, so that I can practice offline.
3. As a singer, I want the backing track to play while I sing, so that I practice in context.
4. As a singer, I want the current lyric line displayed in time with the song, so that I know what to sing.
5. As a singer, I want to see the reference pitch next to my live pitch, so that I see sharp/flat immediately.
6. As a singer, I want a score per line and per song, so that I can track weak passages.
7. As a singer with any voice range, I want octave-independent scoring, so that I am not penalized for singing an octave lower or higher.
8. As an admin, I want to supply full-mix and backing tracks and lyric files, so that the build derives the reference melody automatically.
9. As an admin, I want to tap along per lyric line to set timestamps, so that lyrics sync to the song.
10. As an admin, I want a debug plot of the extracted pitch per song, so that I can verify extraction quality before publishing.
11. As a singer, I want a headphone reminder, so that the backing track does not bleed into the mic.
12. As a singer, I want a wrong password to fail clearly without exposing any content.

UI will be german, to be designed with claude design.

## Implementation thoughts
- **Platform:** .Net / Blazor PWA
- **Content builder:**
  - Text import: PDF/DOCX to lyric lines.
  - Vocal extractor: align the full mix and the backing track by cross-correlation, fit a gain by least squares, compute `vocal ≈ full − gain × backing`, then run YIN/pYIN pitch tracking with voicing detection, smoothing and median filtering. Output: pitch-track JSON (about 100 frames/s, `null` when unvoiced).
  - Fallback when subtraction fails (mismatched mastering, lossy-codec drift): vocal-focused neural detector on the full mix (e.g. CREPE via ONNX), plus a per-song manual override.
  - Packer: AES-GCM encryption of audio, pitch tracks, lyrics and timings. The key is derived from the password via PBKDF2. Plus a manifest.
  - Debug view: plot of extracted pitch per song.
- **Vault (client):** `unlock(password)`, `getSong(id)`. Fetches encrypted blobs, stores them in IndexedDB, decrypts in memory.
- **Pitch engine (client):** mic through an AudioWorklet and a McLeod/YIN detector. Emits a live pitch stream.
- **Scorer (pure functions):** reference track + live pitch in, per-frame hit/miss out. Deviation is measured in cents, octave-folded, with a hit at about ±50 cents (tunable). Aggregates per line and per song.
- **Practice UI:** backing playback, lyric line display, reference vs. live pitch lane, score summary, headphone notice.
- **Line-timing tool:** tap per line during playback, saves timestamps into song data.
- **Hosting/security model:** static hosting; the encrypted bundle protects against outsiders only. Anyone with the password can share the decrypted content. Accepted.

## Testing Thoughts
- Scorer: unit tests with synthetic pitch tracks (exact, off-pitch, octave-shifted, unvoiced gaps, late/early entry).
- Vocal extractor: tests with synthesized "backing + sine vocal" mixes, asserting the recovered pitch within tolerance; plus a mismatched-mix case that triggers the fallback.
- Packer/Vault: encrypt → decrypt round trip, wrong-password failure, tampered-blob failure.
- Pitch engine: feed synthetic tones through the detector and check accuracy and latency.
- Manual: real-device check on iOS Safari and Android Chrome (mic permission, offline, installed PWA).

## Out of Scope
- Streaming-service integration (Spotify etc.).
- Per-user accounts, server-side sync, upload UI.
- Automatic lyric alignment (forced alignment).
- Recording or playback of the user's own voice.
- Protection against password sharing or content extraction.


## Further Notes
- Prior art: OnKey (Show HN, singonkey.app); lenient, beginner-tuned scoring is a reasonable default.
