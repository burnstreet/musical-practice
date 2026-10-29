# Pack: sections saved in the editor reach the content

Status: wontfix
Blocked by: none
Spec: ../spec.md

User story 36 ("saved sections survive a repack").

How it works today:
- tools/pack.py:220-222 reads stored sections from `<root>/web/data/<id>.json`.
- CLAUDE.md packs with `--root work/pack-root`.
- The editor saves to `web/data/` in the repo.

What the review found:
- None of the `work/pack-root/web/data/*.json` files has a `sections` key.
- Only `web/data/02.json` has saved sections (Strophe 1 … Refrain 3), and it differs from the pack-root copy.
- So packing always detects sections again. Corrections made in the editor reach the content only if someone copies the file into pack-root by hand.

Open question for the user:
- How do edited files get from `web/data/` into `work/pack-root/` today: by hand, by a script, or should the pack read `web/data/` directly?

After the answer: make the path explicit (a pack option or a copy step in `./at.ps1 pack`), and add a pytest case in which a saved section survives the pack.

## Comments

Answer (user, 2026-10-29): an agent copies edited files from `web/data/` into `work/pack-root/` before packing. That is fine as it is, so no change. Whoever packs must copy edited files (for example `02.json` with its sections) into pack-root first.
