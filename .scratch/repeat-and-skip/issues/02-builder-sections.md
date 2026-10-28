# Builder: section detection

Status: resolved
Blocked by: 01
Spec: ../spec.md

Spec Implementation Decisions 'Section data' and 'Detection' plus user stories 29, 30, 36. Python builder (	ools/): detect sections, name them, snap to bars, keep stored sections on repack, exclude intro/outro; write sections into the note file; expose a re-detect entry the editor server can call. Do NOT run the pack step (needs PITCH_PASSWORD) and do not repack content. Tests: pytest, prior art 	ools/tests/test_phrases.py, steps_phrases.py.

