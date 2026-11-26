Status: ready-for-agent

# Screen stays awake; song cues shrink to a 5 s snippet

## Problem Statement

While I practice, the phone screen dims and locks, so I have to wake it again and again with sweaty hands. In Text practice (the dialog run-through) the run stops at every song cue and waits for a tap, so a long scene never flows. I want to concentrate on the text, not on tapping past songs.

## Solution

The screen stays awake while something plays, in song practice and in the Text run-through. A new setting "Lieder kürzen (5 s)" in the Text settings (off by default) turns each song cue in the run-through into a 5 s snippet from the start of verse 1, with fade-in and fade-out and the song title on the card. After the snippet the run-through moves on by itself. With the setting off, nothing changes: the song card waits for a tap.

## User Stories

1. As a singer, I want the screen to stay on while a song plays, so that I do not have to wake it during a pass.
2. As an actor, I want the screen to stay on during a Text run-through, so that I can read my lines without the lock screen.
3. As a user, I want the screen to be allowed to sleep again when I pause or stop, so that my battery is not drained.
4. As a user, I want the screen to be allowed to sleep when I leave the practice or Text screen, so that the app does not hold it forever.
5. As a user, I want the wake lock back when I return to the app while something still plays, so that the browser dropping it in the background does not matter.
6. As a user on a browser without wake lock, I want practice to work as before, so that a missing feature never breaks it.
7. As an actor, I want a setting "Lieder kürzen (5 s)", so that I choose whether songs interrupt the Text run-through.
8. As an actor, I want the setting off by default, so that existing behaviour stays until I choose.
9. As an actor, I want the setting remembered on my device, so that I set it once.
10. As an actor, I want each song cue to play 5 s from the start of verse 1, so that I recognise the song without waiting for all of it.
11. As an actor, I want the snippet to fade in and out, so that it does not start or end with a click.
12. As an actor, I want the song title on the card during the snippet, so that I know which song it is.
13. As an actor, I want the run-through to continue by itself after the snippet, so that I stay on the text.
14. As an actor, I want pause to stop the snippet and resume to start it again from the beginning, so that a half snippet never confuses me.
15. As an actor, I want "back" and "skip" to work during a snippet, so that I stay in control.
16. As an actor, I want a song that is not loaded to keep the old card, so that nothing breaks when songs are missing.
17. As an actor, I want a song without a section "Strophe 1" to start at its first sung note, so that I do not hear a long intro.
18. As an actor, I want a song with no sung note to start at its beginning, so that something always plays.
19. As an actor, I want the "Lied üben" button on the card to keep working, so that I can still jump into the song.
20. As an actor, I want the snippet to play at the settings volume of the song practice, so that it is not louder than the rest.

## Implementation Decisions

- Wake lock is a small module over the browser Screen Wake Lock, with the browser object injectable. It is asked for when playback starts, released on pause, stop or leaving the screen, and asked for again when the tab becomes visible while playback still runs. A refused or missing lock is ignored silently. It is not a setting.
- The Text settings (dialog settings) get one boolean, default off, stored with the other settings. The settings sheet of Text practice gets one switch labelled "Lieder kürzen (5 s)".
- Cue options get a snippet length in ms, set by the controller from the setting: 5000 when on, none when off. The length is fixed, not configurable by the user.
- Cue engine: entering a song cue with a snippet length emits a new effect "play snippet" with the song id and the length, and keeps state `song`. The existing event "audio ended" in state `song` moves to the next turn. Tap, skip, back and pause keep their meaning; pause emits stop and resume re-enters the cue, so the snippet restarts. With no snippet length the song state is unchanged (waits for a tap).
- Dialog controller: a new seam in its dependencies plays a snippet (song id, start s, length s) and resolves when it ended, like a line. The controller carries out the effect, guarded by the same generation counter as lines, so a stop silences an older snippet. A snippet that cannot start (song not loaded, autoplay refused, load error) leaves the card waiting, like today.
- Start time: the start of the section named "Strophe 1"; if there is none, the start of the first note with a syllable; if there is none, 0. This is a pure function of the song data.
- Audio: the snippet plays the song's backing and voices as the song practice does, with a linear fade-in and fade-out of about 0.5 s inside the 5 s. The song files are only fetched when a snippet is due. The song card shows title and number as today.
- No song data and no production names enter the engine.

## Testing Decisions

- Cue engine (main seam): Gherkin in the cue engine spec, run through the existing spec tests for the cue. Cases: snippet effect on entering a song cue when the length is set; move on when audio ended; pause then resume restarts; no length means the old waiting card.
- Dialog controller: tests like the existing controller tests with the dependencies swapped. Cases: snippet plays the start time of the section, the fallbacks, a refused snippet leaves the card, a stop silences it.
- Wake lock: unit tests with a fake browser object: asked on start, released on stop, asked again on visibility, ignored when missing or refused. Screen specs for practice and the Text run-through state that playback holds the lock.
- Settings: the new field defaults to off and survives a reload like the other dialog settings.
- Prior art: the cue engine spec and its test, the dialog controller test, the settings test for the mic.

## Out of Scope

- Wake lock in other screens (songs list, results, editor).
- A setting for the snippet length or for the wake lock.
- Showing the lyrics of the snippet.
- A snippet in song practice itself.

## Further Notes

- Update the cue engine, dialog screen and practice screen specs together with the tests.
