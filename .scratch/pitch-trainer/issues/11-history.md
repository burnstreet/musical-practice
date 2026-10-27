# 11: History

**What to build:** On-device history per song and role set in IndexedDB: record a session's passes as one summary (best and last hit %), list the last 20 newest first, badge value for the song list, wipe.

**Blocked by:** 06 (scorer, for the `PassResult` type)

**Status:** resolved

Spec: `specs/history.spec.md`. Test with `fake-indexeddb`.

- [ ] All scenarios pass via `tests/specs/history.test.ts` + `tests/steps/history.steps.ts`.
- [ ] Key is order-independent in roles.

## Comments

- 2026-10-27 agent: Merged 2401fbc: src/core/history.ts, db version 3.
