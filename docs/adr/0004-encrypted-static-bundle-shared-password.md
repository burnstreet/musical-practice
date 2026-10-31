# Encrypted static bundle with one shared password

The material is copyrighted and private to the cast, but the app must be static (GitHub Pages) with no server, accounts or sync. We decided (2026-10-27) to publish an AES-GCM-encrypted bundle whose key is derived from one shared password, with a public manifest exposing only sizes, opaque ids and a key id. The derived key is kept non-extractable on the device so the password is entered once.

## Consequences

- Protection is against outsiders only. Anyone with the password can extract content. Accepted.
- A password change means a new salt, a new key id and a full re-download on every device.
- The manifest must stay free of titles and lyrics; those live in the encrypted library file.
- The same vault serves the planned dialog trainer.
- ADR 0007: the bundle is built and deployed by the production's private content repo into a public site repo; the engine repo holds no bundle.
