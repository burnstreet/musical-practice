# Gesangs-Übetool

Practice app for the cast of a musical. A singer rehearses a song against the original recording and learns whether the sung pitch matches the written melody of their role. This glossary names the concepts; specs in `specs/` define behaviour.

## People

**Singer**:
A cast member practising with the app. The only end user.
_Avoid_: User, player, student

**Admin**:
The person who prepares content with the local tools and publishes the bundle.
_Avoid_: Maintainer, editor (that is a tool)

## Content

**Song**:
One number of the musical, identified by its two-digit id (`01`–`10`). Has a recording, a score and a set of roles.
_Avoid_: Track, piece, title

**Recording**:
The original full mix with all sung voices. Source of the Voices stem. File names use `mix`.
_Avoid_: Demo, voicetrack (that is a playback mode)

**Playback** (source):
The instrumental recording the cast sings to on stage, supplied separately. Source of the Backing stem when it aligns with the Recording.
_Avoid_: Karaoke, minus-one

**Stem**:
One of the two audio tracks the app plays for a song: the **Voices stem** (the Recording) and the **Backing stem** (aligned Playback or separated accompaniment).
_Avoid_: Channel, layer, track

**Score**:
The transcribed melody of a song: notes with pitch, duration, syllable and role, as sung on the Recording.
_Avoid_: Sheet, notation, transcription (as a noun for the artefact)

**Alignment**:
The mapping of every score note onto a start and end second of the Recording.
_Avoid_: Sync, timing, forced alignment

**Note**:
One sung tone of the score with pitch, time span, syllable, role and phrase.
_Avoid_: Tone, event

**Syllable**:
The part of the lyrics sung on one note.
_Avoid_: Lyric, word

**Phrase**:
A run of consecutive notes forming one lyric line. The unit for looping, per-phrase results and the Tip.
_Avoid_: Line, section, bar group, verse

**Role**:
A character or group of the musical that sings, taken from the global cast list. Each note belongs to exactly one role. Only roles with notes in some song can be selected.
_Avoid_: Part, voice, character, player

**Role set**:
The roles a singer has selected for the current practice. "My notes" are the notes whose role is in the role set.
_Avoid_: Selection, profile

**Role span**:
A time range of a song in which any role of the role set sings.

**Library**:
The set of songs published in one bundle, with their roles and titles.
_Avoid_: Catalogue, playlist, index

**Bundle**:
The encrypted publication of a library: manifest, library file, note files and stems.
_Avoid_: Package, release (that is the app)

**Manifest**:
The one unencrypted file of a bundle: sizes, opaque ids and the key id. Readable before unlock.

**Complete song**:
A song that has an aligned score with roles and phrases on every note and both stems. Only complete songs are published.
_Avoid_: Valid, finished

## Playing

**Voicetrack**:
The sung voices as heard from the Voices stem. Named after the cast's word for the guide recording.

**Voicetrack mode**:
How the voices are heard while practising: *Mit Voicetrack* (all voices), *Voicetrack nur für andere* (my role spans muted), *Nur Playback* (backing only).
_Avoid_: Stem mode, mute mode, karaoke mode

**Tempo**:
Playback speed as a percentage of the original, pitch unchanged. 100, 90, 80 or 70.
_Avoid_: Speed, rate

**Loop**:
Repeating one phrase until switched off.
_Avoid_: Repeat, A-B

**Ready song**:
A song whose files are stored on the device and can be opened offline.
_Avoid_: Downloaded, cached, available

## Scoring

**Session**:
Everything that happens between opening a song and leaving it. Contains passes.
_Avoid_: Run, attempt, practice

**Pass**:
One stretch of playback from play to pause inside a session, scored as a unit. Shown as *Durchgang n*.
_Avoid_: Run, take, round, attempt

**Entered note**:
A note of the role set that the playhead has crossed during the current pass. Only entered notes are scored. Re-entering a note (loop, seek back) discards what was sung before.

**Deviation**:
Distance between sung pitch and target pitch in cents, after octave folding. Signed: positive = sharp (*zu hoch*), negative = flat (*zu tief*).
_Avoid_: Error, offset, difference

**Octave folding**:
Moving the sung pitch by whole octaves to the octave nearest the target before comparing. Makes men and women comparable against the same score.
_Avoid_: Octave-independent, octave-agnostic (as nouns)

**Tolerance**:
The deviation, in cents, still counted as a hit. Three levels: *Leicht* 75, *Normal* 50, *Streng* 30.
_Avoid_: Threshold, margin, difficulty

**Hit**:
An entered note the singer sang within tolerance for most of its length. An entered note not sung at all is a miss.
_Avoid_: Correct, success, match

**Hit percentage**:
Hits divided by entered notes of a pass. Shown as *getroffen*.
_Avoid_: Score, accuracy, points

**Tendency**:
Whether a pass was on average sharp, flat or clean. Shown as *Tendenz*.
_Avoid_: Bias, drift

**Sung range**:
Lowest and highest pitch actually sung in a pass, in the singer's real octave. Shown as *Tonumfang*.
_Avoid_: Vocal range, tessitura

**Worst phrase**:
The phrase of a pass with the largest average deviation. Target of the Tip and of the drill action.

**Tip**:
The one coaching sentence after a pass, built from a fixed template around the worst phrase.
_Avoid_: Feedback, advice, hint (that is a UI note)

**Trend**:
Hit percentage of each pass of the current session, in order. Shown as *Verlauf*.
_Avoid_: Progress, history (that spans sessions)

**History**:
Stored summaries of past sessions per song and role set on this device.
_Avoid_: Log, stats, record

**Badge**:
The hit percentage of the latest session for a song and role set, shown in the song list.

## Access

**Unlock**:
Entering the shared password on a device once, which makes the library readable there.
_Avoid_: Login, sign in, authenticate

**Lock**:
Removing the key, all songs and the history from a device.
_Avoid_: Logout, reset, sign out

**Key id**:
A short identifier of the current password in the manifest. A changed key id tells a device that the password changed.
