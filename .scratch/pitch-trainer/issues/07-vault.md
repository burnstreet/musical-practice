# 07: Vault

**What to build:** Password unlock with PBKDF2 → AES-GCM key kept non-extractable in IndexedDB, verification by decrypting the library blob, persistence across restarts, offline start, password-change detection by key id, and a lock that wipes the key and runs registered wipe hooks.

**Blocked by:** 02 (content format)

**Status:** ready-for-agent

Spec: `specs/vault.spec.md`. Crypto parameters: `specs/content-format.spec.md` → Crypto. ADR 0004.

Testing: `fake-indexeddb` (dev dependency from ticket 01) and Node WebCrypto. Steps encrypt a library JSON themselves with the same parameters to produce fixtures. Note: fake-indexeddb cannot structured-clone a `CryptoKey`; if storing the key object fails under test, store it anyway in production code and let the steps register a fallback (document the choice in the step file in one line). Prefer a thin storage seam (`VaultStore` with `get/put/delete`) injected in the constructor so tests can use an in-memory store.

- [ ] All scenarios pass via `tests/specs/vault.test.ts` + `tests/steps/vault.steps.ts`.
- [ ] Iteration count for tests may be lowered through the manifest's `iterations` field (the spec puts it in the manifest for this reason); production manifests carry 600000.
- [ ] `decrypt` while locked rejects.
