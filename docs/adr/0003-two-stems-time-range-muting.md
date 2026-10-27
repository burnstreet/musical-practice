# Two stems per song, muting by time range

To mute the singer's own role while keeping the others, per-role vocal stems would be ideal, but the source material is only a full mix and an instrumental playback. We decided (2026-10-27) to ship exactly two stems per song, voices and backing, and to switch to the backing stem for every time range in which any selected role sings.

## Consequences

- Where another role sings at the same time as the singer's role, that role is muted too. Accepted and documented.
- Songs whose playback does not align with the mix (02, 05) get their backing stem from source separation (Demucs) instead; the client cannot tell the difference.
- An "Auto" mode that mutes only while the singer is actually singing stays possible later with the same two stems.
