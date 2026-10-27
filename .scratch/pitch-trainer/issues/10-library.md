# 10: Library

**What to build:** Manifest fetch with cached fallback, size info before unlock, full download after unlock with per-file progress and ready-song tracking, per-file IndexedDB storage keyed by content id, change detection and orphan cleanup, retry on failure, song access returning parsed notes plus `audio/mpeg` Blobs, offline start, wipe.

**Blocked by:** 02 (content format), 07 (vault)

**Status:** resolved

Spec: `specs/library.spec.md`. Parsers from `src/core/content.ts`. Decrypt through the `Vault` interface only.

Testing: inject `fetch` and a vault (a fake vault whose `decrypt` is the inverse of the step file's encrypt helper is fine; or reuse the real vault with lowered iterations). Use `fake-indexeddb`. Retry pause must be injectable (or zero in tests) so the network-failure scenario runs fast.

- [ ] All scenarios pass via `tests/specs/library.test.ts` + `tests/steps/library.steps.ts`.
- [ ] Sync order and skip-unchanged behaviour as in the spec; progress event after every file.
- [ ] No decrypted bytes written to IndexedDB.

## Comments

- 2026-10-27 agent: Merged 5a3249e: src/core/library.ts, db.ts (shared IndexedDB open); fetchLibraryCipher added in the review fix pass.
