---
name: Vault
description: Password unlock, key derivation, key persistence, decrypt, lock, password-change detection.
targets:
  - ../src/core/vault.ts
---

# Vault

Owns the key. Nothing else touches crypto. Reusable by the dialog trainer.

```ts { .api }
export type VaultState = 'locked' | 'unlocked' | 'password-changed'
export type UnlockResult = 'ok' | 'wrong-password' | 'no-manifest'

export interface Vault {
  init(manifest: Manifest | null): Promise<VaultState>   // on app start, manifest null when offline
  unlock(password: string, manifest: Manifest, libraryCipher: ArrayBuffer): Promise<UnlockResult>
  state(): VaultState
  decrypt(cipher: ArrayBuffer): Promise<ArrayBuffer>      // throws when locked
  lock(): Promise<void>                                   // wipes key, then calls onWipe hooks
  onWipe(fn: () => Promise<void>): void
}
```

- Derive per content-format. Key imported non-extractable. Stored in IndexedDB store `vault` as `{ key: CryptoKey, keyId }`.
- Unlock verifies by decrypting the library blob. GCM tag failure = `wrong-password`. No partial content leaves the function.
- `init` with stored key and manifest `keyId` equal to stored: `unlocked`. Different: `password-changed`, stored key deleted. No stored key: `locked`. Manifest null and stored key: `unlocked` (offline).
- `lock` deletes the key record, then runs wipe hooks (library and history register theirs).
  `[@test] ../tests/steps/vault.steps.ts`

```gherkin
Feature: Unlock
  Scenario: correct password
    Given a manifest and a library blob encrypted with password "cast2026"
    When I unlock with "cast2026"
    Then the result is "ok" and the state is "unlocked"
    And decrypt of the library blob yields valid library JSON

  Scenario: wrong password
    Given a manifest and a library blob encrypted with password "cast2026"
    When I unlock with "wrong"
    Then the result is "wrong-password" and the state is "locked"
    And decrypt throws

  Scenario: key survives restart
    Given I unlocked with "cast2026"
    When the vault is re-created and init runs with the same manifest
    Then the state is "unlocked" without entering a password

  Scenario: offline start with stored key
    Given I unlocked with "cast2026"
    When the vault is re-created and init runs with manifest null
    Then the state is "unlocked"

Feature: Password change
  Scenario: new key id on the server
    Given I unlocked with "cast2026" against a manifest with keyId "aaaa"
    When the vault is re-created and init runs with a manifest with keyId "bbbb"
    Then the state is "password-changed"
    And no key is stored

Feature: Lock
  Scenario: lock wipes and notifies
    Given I unlocked with "cast2026" and a wipe hook is registered
    When I lock
    Then the state is "locked", decrypt throws, and the wipe hook ran once
```
