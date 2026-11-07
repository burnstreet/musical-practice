---
name: Screen Practice
description: Live singing screen. Artboards Main.dc.html and MainDesktop.dc.html. Header, mode button, staff, piano roll, cents readout, repeat selector, progress bar with sections, transport, mic state, hints.
targets:
  - ../src/app/screens/practice.ts
  - ../src/app/draw/staff.ts
  - ../src/app/draw/roll.ts
---

# Screen: Singen (live)

Lit element `<gu-practice>`. Wires audio engine, pitch engine, session. Draws staff and piano roll on two canvases. Never computes scores itself.

Strings:

| id | text |
|---|---|
| back | aria `Zurück zur Auswahl` |
| title | `Lied {n} · {title}` |
| sub | `Takt {a}–{b} · {key} · {bpm} BPM` |
| modeLabel | `Voicetrack` |
| modeValues | `alle Stimmen` / `nur für andere` / `nur Playback` |
| legendMine | `Meine Stimme · {roleNames}` |
| legendOthers | `Andere` |
| target | `Ziel {note}` |
| noTarget | `–` |
| meterEnds | `tief` (left) / `hoch` (right), under the meter |
| repeatLabel | `Wiederholen` (heading of the selector row) |
| repeatValues | `Aus` / `Phrase` / `Abschnitt` / `Einsatz` / `A–B` (chips, one active) |
| abSetB | chip text `B setzen` after A is set |
| repeatStatus | `{name} · {m:ss}–{m:ss}`; A–B with A only: `A {m:ss} · B noch nicht gesetzt` |
| skipPrev | aria `Zum vorigen Einsatz` |
| skipNext | aria `Zum nächsten Einsatz` |
| introSkip | `Intro überspringen` |
| toMarker | `Zum Marker` |
| phraseStart | aria `Zurück zum Anfang der Phrase` |
| pause | aria `Pause` |
| results | aria `Auswertung` (chart icon) |
| tempo | `{t}%`, aria `Tempo {t} Prozent` |
| mic | aria `Mikrofon aktiv` / `Mikrofon aus` |
| micDenied | `Mikrofon nicht erlaubt. Du hörst das Lied, aber ohne Bewertung.` |
| noPart | `Deine Rolle singt hier nicht. Nur Zuhören.` |
| rapOnly | `Deine Rolle rappt hier: Text und Rhythmus, ohne Bewertung.` |
| rapNow | `Rap · ohne Bewertung` |

## Setup

- On enter: `library.getSong`, `engine.load(song, roles)`, `setMode(settings.mode)`, headphone sheet if due, `session = new Session`, then `pitch.start(engine.time, engine.latency)` only when the song has notes for the selected roles.
- No notes for my roles: `noPart` hint, mic indicator hidden, mode forced `all`.
- Only spoken notes for my roles (rap, see content format): `rapOnly` hint, no mic, mic indicator hidden, mode from settings (`nur für andere` mutes my rap as it mutes singing). Nothing to score, so no `results` button.
- `pitch.start` returns `denied` or `unsupported`: `micDenied` banner, mic button shows off state, playback allowed, no passes, no `results` button.
- Leaving: `engine.unload`, `pitch.stop`, `history.record` with session passes; a pass still running also goes to `history.recordPass`.

## Header

- `sub` bar range = the bars the staff shows, also partly (`Takt {a}` for one bar; before the first draw: the `barsPerPage` page), key from song, bpm from song times tempo.
- Mode button cycles all → others → backing → all. Saves to settings.
- `results` button, left of settings: only while paused and the session has a pass. Goes to `#/results/{id}`. Never automatic: singers found the jump after every pause distracting.

## Staff (canvas, scrolling)

- Treble clef, key signature from `song.key`, 5 lines. Accidentals only on pitches outside the key. A song whose median note lies below B3 is written an octave (or more) above its sound, with a small `8` under the clef (`octaveShift`), so low voices stay on the lines.
- Rests: in each bar every span no visible note covers (bar start to first note, a note's written end to the next note, last end to bar end) gets rests. Gap ends snap to the sixteenth grid (gaps under 1/8 beat vanish), then split into half, quarter, eighth, sixteenth rests, each starting on a multiple of its own length from the bar start; no dotted rests. Empty bar: one whole-bar rest, centred (also in 3/4). Music font glyphs U+1D13B–U+1D13F placed by measured ink (whole hangs from the fourth line, half sits on the middle line). Faint colour of the voice that just stopped (mine first), else the one about to start; muted in an empty bar. Rests are onsets of the spacing without a syllable.
- Note value from `dur` (quarters), quantised to the nearest written value: whole (hollow, no stem), half (hollow, stem), quarter (filled, stem), eighth / sixteenth (filled, stem, 1 / 2 flags); augmentation dot for dotted values (dotted sixteenth to dotted half). Spoken note (rap, `spoken`): slash head on the middle line, no accidental, stem and flags as its value; left out of `octaveShift`. Tie or slur (`tie`, `slur`): an arc from the note to the next note of its role, below the heads when the stem points up, else above; over a page turn it runs out at the page end and comes in at the next page's start.
- Beams (`beamGroups`): eighths and shorter of one role, back to back (each starts where the previous written value ends), in the same bar and beat (quarter), share a beam instead of flags; one note alone keeps its flag. Group stems all point one way, set by the head farthest from the middle line. Beam: straight from first to last stem, slope at most 1/4, moved off the heads so the shortest stem keeps its minimum length (`beamTips`). Sixteenths get a second beam between neighbouring sixteenths, a lone one a stub towards the note before it (after it when first).
- Hyphens: a syllable ending in `-` is drawn without it; a `-` sits centred in the gap to the next syllable of its role on the page, or just after the syllable when that one is on a later page. Spacing leaves room for it.
- Spacing per bar: each onset gets room ∝ (time to the next onset or bar end)^0.6, scaled to fill the bar; a rest before the first note keeps its room. Minimum distance between onsets = head (more before an accidental) and half of each neighbour's syllable + 4 px; short notes take it from long ones.
- Scrolling (`scroll`): the whole song is one row (`layoutStrip`, cached per song, canvas height and roles), lyric font at 12 px. Room ∝ time up to a quarter, so the row moves at one speed through sixteenths, eighths and quarters, over bar lines too (the room after a bar's last onset includes the next bar's lead); longer values get time^0.6, the row slows there. Per bar, px per quarter = the least that keeps every minimum distance (heads, syllables, hyphens), at least 35 px × drawing scale; a dense bar runs faster. Syllables are never left out and always on one row. The playhead stands still at 25 % of the room right of clef and key; notes, rests, syllables and bar lines move past it, so the singer sees what comes instead of a page flip at the bar end. Browsing (see Browse while paused): that spot shows the view time instead; the playhead moves with the row and is not drawn while out of view. Clef, key signature and staff lines stay; the row slides away under them. Only the bars in view are drawn.
- Pages (the editor; the player without `scroll`): the song is split once per canvas size and roles (`staffPages`, cached): each page takes up to `barsPerPage` bars (canvas width / 150 px, 2…4), fewer while its syllables do not fit on one row at 10 px, at least 1. Bar widths follow each bar's minimum width; too dense: lyric font shrinks down to 10 px. The page shown is the one holding the bar of the heard time.
- Bar lines: solid, text colour, 1.5 px, full staff height, at every bar start after the first and at the end of the last bar drawn. Bar number (muted, 10 px) over each bar's start. Role name: scrolling, over the first note of a run and none for a run begun out of view, so names never jump while bars come and go.
- Notes drawn = `visibleNotes(song.notes, roles)`: one line where I sing (same for the piano roll).
- Mine: accent colour. Others: `--other`. Syllable under each onset (mine first), mine bold at the current note. Role name above each run of same-role notes, left out where it would overprint the previous one.
- Current note highlighted with a translucent box.
- Playhead: dashed vertical line as in the piano roll (text colour, 1.5 px, dash 3/4) over the staff at the heard time. The row's position follows the heard time linearly from onset to onset (notes at their sung start, rests at their place in the bar; the song's first bar line before the first, its end after the last). Before the song start and after its end the row stops, its start or end at the playhead. Pages: the playhead itself moves that way over the page.
- Intro and other bars without visible notes show whole-bar rests (the song's `bars` include the intro, see content format).

## Piano roll (canvas)

- Vertical: semitones, labels every semitone row without octave (`C`, `C#`, `D` …); above 12 rows only the rows without sharp (`C`, `D`, `E` …). Range = all my sung notes of every phrase that has one of my notes in view (also the part outside the window, so the rows change only when a phrase comes or goes), ±2 semitones, min 10 rows. Without my notes in view: the sung notes in view. Zoom: the rows also hold every sung-line point drawn in view, of every take, with the same ±2 to spare (`zoomRange`); points more than 12 semitones from the centre of the note rows do not count (a detector slip must not squash the rows) and are cut off at the edge. Every change of the rows (zoom, a new phrase) eases from the rows drawn last (exponential, 80 ms time constant), the first draw takes them as they are.
- Bar lines: muted, half opacity, 1 px, over the rows (not the lyric strip) at each bar start in view, moving with the notes.
- Horizontal: window `rollWindow` = canvas width / 72 px per second, 5…8 s (a wider screen shows more of what comes), playhead at 30 % width. Browsing: the view time stands at 30 %, the playhead moves with the notes (`rollTimeAt` maps canvas x back to song time). Target bars = my notes, accent; filled portion = elapsed part. Other roles' notes dashed in `--other`. Spoken notes: no bar, not in the row range, syllable in the lyric strip only; the sung line folds to sung notes only.
- Heard time: staff, piano roll, page and readout show `engine.time() − pitch.delay()`, the song position the singer hears now (Android Chrome measured 760 ms on Bluetooth). Transport and seek keep the playback position.
- Sung line: the takes' pitch frames in view by their scoring stamp `t` (the sung moment in heard time, so the newest point sits at the playhead and the line lies on the note it was sung to), shifted by one octave for the whole song, not per note (the voice keeps its octave; men sing an octave under the written notes): every voiced frame inside one of my notes votes for the whole octaves that bring it nearest that note (`octaveVote`), the shift with most votes since the song was opened wins. Before the first vote each frame folds into the octave of the nearest target note at that time. Octave slips of the detector folded back first (`foldSlips`, line and zoom): a voiced stretch splits where two frames lie more than 6 semitones apart (a voice cannot leap that in 5 ms); each piece under 0.3 s moves by whole octaves to the longest piece's octave. Pitchy's own `k` stays 0.9: higher made more octave-down slips on the vocal stems. `null` breaks the line. Level 0 (see Takes): white, 4 px, dark outline. Levels 1, 2, 3: `--other`, 2 px, no outline, opacity 0.7, 0.45, 0.2; drawn under level 0. Dot at the newest frame, only while playing. Frames of a paused song all carry the same time: they join no take.
- Lyric strip: 22 px under the rows (the playhead runs through it). One syllable per onset in view (mine first), 12 px, at its note's start, pushed right only as far as needed to keep 6 px after the previous one (`lyricXs`), so none is left out or overprinted. Mine accent, others `--other`, my sounding one bold.

## Takes

The singer sees how they sang, and how they sang before, all over the song.

- Take: the frames of one run through the song, kept for the session with this song (also across results and back; gone on leaving the song; never stored). Play starts a new take; so does a frame whose `t` lies more than 0.05 s before or 0.5 s after the take's latest (repeat wrap, seek). A take covers its first to its latest frame time.
- Ahead of a take: from its latest frame time on for the length of the two bars from the bar holding it.
- Level of take k at time τ: the newer takes covering τ, plus 1 when any newer take has τ ahead of it (at most 1 for all of them). Level 4 or more: hidden there. So a repeated stretch shows the newest take on top and the older ones fading; the two bars after it drop one level, never more, so they do not go empty.
- A take hidden all over (4 newer takes each covering all of it) is dropped.

## Browse while paused

Paused, the singer looks around the song without moving the playhead (the marker), and taps to move the marker.

- View time: the song time staff and roll show at their playhead spot (staff 25 %, roll 30 %). Follows the heard time until the singer swipes; then it stays where the swipe left it.
- Swipe (pointer down, moved 8 px or more sideways): the view follows the finger 1:1, each canvas in its own scale (roll `rollTimeAt`, staff `staffTimeAt`); the other canvas follows the view time. Clamped to 0…song end.
- Release: the view coasts on at the finger's speed (last 100 ms), slowing exponentially (`coast`, time constant 325 ms), stops under 10 px/s or hard at 0 or the song end. A pointer down while coasting stops it and is no tap.
- Tap (moved under 8 px): the marker goes to the onset (note start, any role) nearest the tapped time, seek there; the view follows the heard time again. No onset in the song: the tapped time. An active repeat stays on.
- Mouse: drag as swipe. Wheel and trackpad over a canvas: `deltaX`, else `deltaY`, px as a swipe of that length (positive goes forward in the song), no coast.
- `toMarker` button, in the place of `introSkip` and instead of it: only while paused and the view does not follow the heard time. Press: the view follows the heard time again.
- Play, seek, skip, `phraseStart`, `introSkip`, repeat chips and section segments: the view follows the heard time again, coasting stops.
- Playing: swipe, tap and wheel do nothing.
- Readout, countdown, skip targets, `introSkip`, repeat chips and the progress position follow the marker, never the view.
- Progress bar, paused: a translucent box over the roll's window around the view time.
- The roll shows the takes wherever the view goes (see Takes), without a dot.

## Repeat

Selector row `repeatLabel` with chips `repeatValues`. One kind active at a time; tapping another chip switches, `Aus` clears the repeat range. Not persisted across sessions, but kept while the same session goes on: when the screen is shown again (back from results) chip, name, A and B follow the engine range. Ranges are song seconds; "now" = the heard time.

- Phrase: the phrase holding now, else the next one, else the last. Range = phrase start/end, `phrase` set, no lead-in.
- Abschnitt: the section holding now, else the next one. Range = section start/end, lead-in. Chip hidden when `song.sections` is missing or empty.
- Einsatz: the own span holding now, else the next one. Range = span start/end, lead-in. No span at or after now: chip stays off.
- A–B: one chip cycles. First tap sets A at now snapped to the nearest bar line, chip reads `abSetB`, status `A m:ss · B noch nicht gesetzt`. Second tap sets B the same way and starts the repeat (no lead-in). B before A: swapped. B on the same bar line as A: B moves to the next bar line. Third tap clears both and ends the repeat. Switching to another kind in between drops A.
- The range is fixed when the kind is switched on. Playback, passes and phrase changes never update it.
- Lead-in: restart (and the first seek on switching on) lands on `leadInStart(range.start, song.bars)` with `LEAD_IN_SEC` = 3, for Abschnitt and Einsatz only. Phrase and A–B land exactly on their start.
- A manual seek outside the range keeps the repeat on. A seek before the range plays on to the range end, then wraps. A seek past the range end plays on without wrapping (engine rule: wrap only when playback crosses the end from before it).
- Section segments are told apart by their start, not their name: two sections of the same name never light up together.
- The wrap is not a pause: the pass goes on, `session.enter` for re-entered notes replaces earlier attempts (scorer: last entry wins). The countdown to my next entry keeps working during repeat and skip.
- Dimming: while a repeat is on, staff, piano roll and progress bar draw everything outside the range at reduced opacity and mark the range start (roll: flag with the range name; A–B: flags `A` and `B`). A without B dims everything before A. Drawing only: sound, mic, scoring and the cents readout are untouched.
- Status line under the selector: `repeatStatus`, hidden when no repeat.

## Own spans and skip

- Own spans = `roleSpans` of my roles with spans merged when the gap between them is below one bar (the length of the bar that holds the gap start).
- `skipPrev`: goes to the start of the latest own span whose start lies more than `LEAD_IN_SEC` before now, else nowhere. Landing = `seekLeadIn(span.start)`. Disabled when no such span or my role set is empty.
- `skipNext`: goes to the first own span whose lead-in landing lies after now. Landing as above. Disabled when none or my role set is empty.
- Skip while Einsatz is on and the target is another span: the repeat moves to that span (range, lead-in). Skip with any other repeat: range stays, playback goes to the landing and wraps at the range end as usual.
- `introSkip`: visible only while now is before the first sung note of any role, and only when `leadInStart(first note start)` is above 0. Press: `seekLeadIn(first note start)`. Hidden otherwise, so the transport holds no button that does nothing.
- Play row: `phraseStart`, `skipPrev`, play/pause, `skipNext`, `tempo`, mic. `introSkip` sits on the `repeatLabel` line, right.

## Progress bar and sections

- Sections show as labelled segments on the bar, always (also without a repeat). No sections: plain bar.
- Tap on a segment: Abschnitt repeat for that section, seek to its lead-in landing. Tap elsewhere: seek.
- Active range highlighted, the lead-in before it marked.
- Paused: view box (see Browse while paused).

## Upright phone

- Portrait, width below 960 px (390x844, 412x915): the whole screen, play row included, fits the visible height (`100dvh`) with or without the hint, no page scroll. The chips stay on one line (32 px, scroll sideways when too narrow), the roll takes the height the other rows leave (at least 96 px). Up to 760 px height (360x740) the staff is 96 px instead of 112 px, so sections plus the hint still fit. Checked in `e2e/smoke.e2e.ts`.

## Sideways phone

- Landscape with at most 560 px height (844x390, 915x412): the whole screen, play row included, fits the visible height (`100dvh`) with or without sections and with or without the hint, no page scroll. The mode button sits in the header row on the right, staff and piano roll on the left, readout and transport in a 320 px column on the right. The staff is 80 px high, the readout and transport are denser (chips 32 px on one line, 40 px buttons, 52 px main button), the roll takes the remaining height (at least 96 px). Wider staff and roll show more bars and seconds ahead. The manifest allows any orientation. Checked in `e2e/smoke.e2e.ts` together with the upright sizes and 1280x800.

## Cents readout

- Sung = latest voiced frame whose `t` lies in the 150 ms before the heard time. Target = my note containing that `t` (onset grace ignored here). Mean = `liveDeviation.meanCents`, the last 1 s: the newest frame jumps too fast to read.
- Shows the mean's note name (no octave, as everywhere) and `target`. No cent numbers in words: the meter shows the deviation. No target or no frame: `noTarget`, and while none of my notes sounds, the countdown to my next entry in the text slot: `Einsatz in {n} Takten · {s} s` (`1 Takt`; n = bar lines up to the entry; s = seconds at the current tempo, rounded up), `Einsatz in {s} s` within the bar, nothing under 1 s. While a spoken note of mine sounds: `noTarget` and `rapNow` in the text slot.
- Paused: song time stands still, so the readout goes by wall clock. Sung = latest voiced frame of the last 150 ms, mean = the last 1 s (`heldDeviation`). Target = my sung (not spoken) note at the marker, else my next one. Big = mean's note name, `target`, meter against it. No target: big = the sung note's name, no `target`, no meter marks. No voiced frame: `noTarget` and the countdown as above.
- Meter: passive display, no control look. Thin bar with tolerance band and centre tick, `meterEnds` under it. Dot at the newest frame's cents, vertical mark at the mean, both clamped ±100 and only while a voiced frame exists.
- Mic indicator in the transport row: small status icon, no button styling.

## Transport

- Progress bar `m:ss` elapsed / total, tap seeks. See Progress bar.
- `phraseStart`: seek to current phrase start.
- `tempo`: cycles 100 → 90 → 80 → 70 → 100.
- `pause`: engine.pause, `session.endPass`, stay paused on practice. A pass result goes to `history.recordPass` right away (the day survives closing the app).
- Play again after pause: `session.startPass`, engine.play.
- The transport follows the engine: its `pause` event (settings calibration, song end) runs the same pause as the button.
- Session glue: engine `enter` → `session.enter`, pitch `frame` → `session.frame`.
- Redraw: a pitch frame only joins the buffer. While playing, the engine tick redraws every animation frame; while paused, frames schedule at most one redraw per animation frame (`requestFrame`, injectable). The newest frame is drawn on the next animation frame; only the readout's mean spans the last 1 s. Paused frames feed only the readout: no take, no octave vote.
  `[@test] ../tests/steps/screen-practice.steps.ts`

```gherkin
Feature: Practice screen
  Scenario: renders header
    Given song "08" loaded with key "F", bpm 93, title placeholder
    When the screen renders at bar 5 with the staff 600 px wide
    Then the subline reads "Takt 4–7 · F · 93 BPM"

  Scenario: a phone staff shows fewer bars
    Given song "08" loaded with key "F", bpm 93, title placeholder
    When the screen renders at bar 5 with the staff 340 px wide
    Then the subline reads "Takt 5–6 · F · 93 BPM"

  Scenario: mode cycles
    Given mode all
    When I tap the voicetrack button twice
    Then the button shows "nur Playback" and engine mode is backing

  Scenario: note of the last second, no cent text
    Given target D5 and a sung frame 14 cents above
    Then the readout shows "D" and "Ziel D"
    And the readout shows no "Cent"
    Given 1.1 s later a sung frame 80 cents below
    Then the readout shows "C#"

  Scenario: mark shows the last second, the dot the newest frame
    Given target D5 and a sung frame 0 cents above
    And 0.6 s later a sung frame 40 cents above
    Then the meter shows the dot at 40 and the mark at 20

  Scenario: countdown to my entry
    Given my next note starts at 8.0 in bars of 2 s
    Then at 3.5 the readout shows "Einsatz in 3 Takten · 5 s"
    And at 6.5 the readout shows "Einsatz in 1 Takt · 2 s"
    And at 6.5 at tempo 70 the readout shows "Einsatz in 1 Takt · 3 s"
    And at 7.5 the readout shows no countdown

  Scenario: the screen shows what the singer hears, not what is being played out
    Given a delay of 0.6 s, playback at 9.7 and a frame 14 cents above D5 scored at 9.1
    Then the readout shows "D" and "Ziel D"
    And the meter shows the mark at 14

  Scenario: pitch frames redraw once per animation frame
    Given target D5 and the screen paused
    When 5 pitch frames arrive before the next animation frame
    Then the screen has not redrawn
    When the animation frame runs
    Then the screen redrew once
    And the meter shows the mark at 3

  Scenario: readout and mic are passive indicators
    Given target D5 and no sung frame
    Then the meter is labelled "tief" and "hoch" and shows no dot and no mark
    Given a sung frame 14 cents above
    Then the meter shows a dot
    And neither the readout nor the mic indicator is a control

  Scenario: octave folded readout
    Given target D5 and a sung frame at D4 plus 5 cents
    Then the readout shows "D"
    And the meter shows the mark at 5

  Scenario: pause stays on practice
    Given a pass with at least one entered note
    When I press pause
    Then session.endPass ran and the route stays "#/practice/08"
    When I press the back button
    Then the route is "#/songs"

  Scenario: results on request after a pass
    Given a pass with at least one entered note
    Then there is no "Auswertung" button
    When I press pause
    Then the day history got one pass for "08" and [clara]
    When I press "Auswertung"
    Then the route is "#/results/08"

  Scenario: paused from elsewhere
    Given a pass with at least one entered note
    When the engine is paused from outside the screen
    Then the transport shows "Abspielen" and session.endPass ran

  Scenario: pause with nothing sung
    Given a pass with no entered note
    When I press pause
    Then the route stays and playback is paused

  Scenario: mic stamps follow what the singer hears
    Given engine latency 0.040
    When the screen opens
    Then pitch.start got the song time and a playback latency of 0.040

  Scenario: mic denied
    Given pitch.start returns denied
    Then the banner "Mikrofon nicht erlaubt. Du hörst das Lied, aber ohne Bewertung." is visible and play works

  Scenario: role without notes
    Given roles [esel] selected for song "08"
    Then the hint "Deine Rolle singt hier nicht. Nur Zuhören." is visible, no mic button, mode is all

  Scenario: role that only raps
    Given roles [chor] selected for song "08", whose chor notes are all spoken
    Then the hint "Deine Rolle rappt hier: Text und Rhythmus, ohne Bewertung." is visible, no mic button, mode is others
    When I press play and then pause
    Then the route stays "#/practice/08"
    And there is no "Auswertung" button

  Scenario: rap shows no target
    Given my spoken note sounds at 12.0
    Then at 12.5 the readout shows "–" and "Rap · ohne Bewertung"

  Scenario: tempo cycles
    When I tap tempo three times
    Then the button shows "70%" and engine tempo is 70

  Scenario: leaving records history
    Given two completed passes
    When I navigate back
    Then history.record was called with two passes and engine.unload ran

Feature: Repeat selector
  Scenario: Phrase repeat takes the current phrase
    Given the heard time is inside phrase 2 spanning [10.0,14.0]
    When I tap the chip "Phrase"
    Then the repeat range is the range [10.0,14.0] with phrase 2 and no lead-in
    And the status line reads "Phrase 3 · 0:10–0:14"

  Scenario: Abschnitt repeat takes the section holding the playhead
    Given sections "Strophe 1" [8.0,24.0] and "Refrain" [24.0,40.0] and the heard time 30.0
    When I tap the chip "Abschnitt"
    Then the repeat range is the range [24.0,40.0] with lead-in
    And the status line reads "Refrain · 0:24–0:40"

  Scenario: Einsatz repeat takes my own span, or the next one
    Given my own spans [10.0,20.0] and [40.0,50.0] and the heard time 30.0
    When I tap the chip "Einsatz"
    Then the repeat range is the range [40.0,50.0] with lead-in

  Scenario: Einsatz without any span ahead stays off
    Given my own spans [10.0,20.0] and the heard time 30.0
    When I tap the chip "Einsatz"
    Then no repeat range is set

  Scenario: one kind at a time
    Given the "Phrase" repeat is on
    When I tap the chip "Einsatz"
    Then only the chip "Einsatz" is active and the repeat range is that span's range
    When I tap the chip "Aus"
    Then no repeat range is set and no status line is shown

  Scenario: range is fixed when switched on
    Given the "Phrase" repeat is on for phrase 2
    When playback runs on into phrase 3
    Then the repeat range is still the range of phrase 2

  Scenario: seek outside the range keeps the repeat
    Given the "Phrase" repeat is on for phrase 2
    When I tap the progress bar at a time inside phrase 5
    Then the chip "Phrase" is still active and the repeat range is unchanged

  Scenario: no sections hides the Abschnitt chip
    Given a song without sections
    Then the chips are "Aus", "Phrase", "Einsatz" and "A–B"

  Scenario: wrap keeps the pass going
    Given the "Phrase" repeat is on and a pass is running
    When the repeat wraps
    Then session.endPass did not run and re-entered notes replace earlier attempts

  Scenario: countdown keeps working during repeat
    Given the "Einsatz" repeat is on for a span starting at 40.0 in bars of 2 s
    When the heard time is 34.0
    Then the readout shows "Einsatz in 3 Takten · 6 s"

  Scenario: the repeat survives showing the screen again
    Given the "Abschnitt" repeat is on for [24.0,40.0]
    When the practice screen is shown again
    Then only the chip "Abschnitt" is active and the status line reads "Refrain · 0:24–0:40"

  Scenario: a pending A survives showing the screen again
    Given A is set at 6.0 and bars every 2 s
    When the practice screen is shown again
    Then the chip reads "B setzen" and the status line reads "A 0:06 · B noch nicht gesetzt"
    When I set B at 14.0
    Then the range is [6.0,14.0]

Feature: Dimming and sections
  Scenario: everything outside the range is dimmed
    Given the "Abschnitt" repeat is on for [24.0,40.0]
    Then staff, roll and progress bar are drawn with a dim range [24.0,40.0] and a flag "Refrain" at 24.0
    And the heard audio, the mic and the scorer are untouched

  Scenario: A and B flags
    Given an A–B repeat [6.0,14.0]
    Then the roll draws flags "A" at 6.0 and "B" at 14.0

  Scenario: no repeat no dimming
    Given no repeat
    Then staff, roll and progress bar are drawn without a dim range

  Scenario: sections are segments on the bar
    Given sections "Strophe 1" and "Refrain"
    Then the progress bar shows two labelled segments, also without a repeat

  Scenario: tap a section starts its repeat
    Given sections "Strophe 1" [8.0,24.0] and "Refrain" [24.0,40.0]
    When I tap the segment "Refrain"
    Then the chip "Abschnitt" is active, the repeat range is [24.0,40.0] with lead-in and time() is 20.0

  Scenario: sections of the same name are told apart
    Given two sections both named "Refrain", [8.0,24.0] and [24.0,40.0]
    When I tap the second segment
    Then only the second segment is active
Feature: A-B dimming
  Scenario: A without B dims everything before A
    Given A is set at 6.0
    Then the staff, the roll and the progress bar are drawn with a dim range from 6.0 to the song end

Feature: A–B repeat
  Scenario: A, B and clear on one button
    Given bars every 2 s and the heard time 5.1
    When I tap the chip "A–B"
    Then the chip reads "B setzen" and the status line reads "A 0:06 · B noch nicht gesetzt"
    When the heard time is 13.7 and I tap the chip again
    Then the repeat range is the range [6.0,14.0] without phrase and without lead-in
    And the status line reads "A–B · 0:06–0:14"
    When I tap the chip a third time
    Then no repeat range is set and the chip reads "A–B"

  Scenario: B before A swaps
    Given A is set at 14.0
    When I set B at 6.0
    Then the range is [6.0,14.0]

  Scenario: B on the same bar line moves on
    Given A is set at 6.0 and bars every 2 s
    When I set B at 6.4
    Then the range is [6.0,8.0]

Feature: Skip
  Scenario: next own entry lands a lead-in before
    Given my own spans [10.0,20.0] and [40.0,50.0], bars every 2 s and the heard time 25.0
    When I tap "Zum nächsten Einsatz"
    Then time() is 36.0

  Scenario: previous goes to the current span start when far enough in
    Given my own spans [10.0,20.0] and [40.0,50.0] and the heard time 44.0
    When I tap "Zum vorigen Einsatz"
    Then time() is 36.0

  Scenario: previous goes one further back when just after the start
    Given my own spans [10.0,20.0] and [40.0,50.0] and the heard time 41.0
    When I tap "Zum vorigen Einsatz"
    Then time() is 6.0

  Scenario: spans less than one bar apart merge
    Given bars of 2 s and my role spans [10.0,14.0] and [15.0,20.0]
    Then the own spans are [10.0,20.0]
    And "Zum nächsten Einsatz" from 12.0 has no target

  Scenario: skip buttons disabled without a target
    Given my own spans [10.0,20.0] and the heard time 11.0
    Then "Zum vorigen Einsatz" is disabled
    Given the heard time 15.0 and no later span
    Then "Zum nächsten Einsatz" is disabled
    Given an empty role set
    Then both skip buttons are disabled

  Scenario: skip moves an active Einsatz repeat
    Given the "Einsatz" repeat is on for [10.0,20.0] and my next own span is [40.0,50.0]
    When I tap "Zum nächsten Einsatz"
    Then the repeat range is the range [40.0,50.0] with lead-in and time() is 36.0

  Scenario: skip keeps any other repeat
    Given the "Phrase" repeat is on for phrase 2
    When I tap "Zum nächsten Einsatz"
    Then the repeat range is unchanged and time() is the lead-in landing

Feature: Intro skip
  Scenario: shown before the first sung note
    Given the first sung note of any role starts at 12.0 and bars every 2 s
    And the heard time 1.0
    Then the button "Intro überspringen" is visible
    When I press it
    Then time() is 8.0

  Scenario: hidden once the first note has started
    Given the first sung note of any role starts at 12.0
    And the heard time 12.5
    Then the button "Intro überspringen" is not shown

  Scenario: hidden when the lead-in would land at 0
    Given the first sung note of any role starts at 2.0
    Then the button "Intro überspringen" is not shown

Feature: Browse while paused
  # roll 600 px wide: 8 s window, 75 px per second, playhead spot at 180 px
  Scenario: swipe moves the view, not the marker
    Given the screen paused at 2.0
    When I swipe the roll 150 px to the left
    Then the roll shows 4.0 at its playhead spot
    And time() is 2
    And the button "Zum Marker" is visible
    When I press "Zum Marker"
    Then the roll shows 2.0 at its playhead spot
    And the button "Zum Marker" is not shown

  Scenario: the view stops at the song start
    Given the screen paused at 2.0
    When I swipe the roll 600 px to the right
    Then the roll shows 0.0 at its playhead spot

  Scenario: tap moves the marker to the nearest onset
    Given the screen paused at 2.0
    When I swipe the roll 150 px to the left
    And I tap the roll at 6.2 s
    Then time() is 8
    And the roll shows 8.0 at its playhead spot

  Scenario: play brings the view back to the marker
    Given the screen paused at 2.0
    When I swipe the roll 150 px to the left
    And I press play
    Then the roll shows 2.0 at its playhead spot

  Scenario: playing ignores swipe and tap
    Given the screen playing at 2.0
    When I swipe the roll 150 px to the left
    Then the roll shows 2.0 at its playhead spot
    When I tap the roll at 6.2 s
    Then time() is 2

  Scenario: the wheel swipes too
    Given the screen paused at 2.0
    When I turn the wheel by 75 px over the roll
    Then the roll shows 3.0 at its playhead spot

  Scenario: coasting slows down and stops
    Then coasting at 1000 px/s for 325 ms moves 205 px and leaves 368 px/s
    And coasting at 10.3 px/s for 16 ms stops

  Scenario: the view box on the progress bar
    Given the screen paused at 2.0
    Then the progress bar shows a view box over [0.0,7.6]
    When I press play
    Then the progress bar shows no view box

  Scenario: paused, the roll shows what was sung, without a dot
    Given I sang D5 from 8.2 to 8.6 and paused
    When a sung frame arrives at 76
    Then the roll draws the sung line up to the marker and no dot

  Scenario: paused, the readout names what I sing against my next note
    Given the screen paused at 3.0
    When a sung frame arrives at 74.2
    Then the readout shows "D" and "Ziel D"
    And the meter shows the mark at 20

  Scenario: paused after my last note, the readout names only what I sing
    Given the screen paused at 12.0
    When a sung frame arrives at 69
    Then the big note is "A" and there is no target

Feature: Takes
  # bars every 2 s
  Scenario: a new take on play, on a jump back and on a jump ahead
    Given frames sung from 0.0 to 4.0
    When frames go on from 4.3 to 5.0
    Then there is 1 take
    When frames jump back to 2.0 and go on to 3.0
    Then there are 2 takes
    When frames jump ahead to 4.0 and go on to 5.0
    Then there are 3 takes
    When play starts and frames go on from 5.0 to 6.0
    Then there are 4 takes

  Scenario: a repeated stretch fades the older takes, the two bars after it one level
    Given a take over [0,20]
    And 5 takes over [6,12]
    Then at 8.0 the levels are 5, 4, 3, 2, 1, 0
    And at 13.0 the first take has level 1
    And at 15.9 the first take has level 1
    And at 16.5 the first take has level 0

  Scenario: takes hidden all over are dropped
    Given a take over [0,20]
    And 5 takes over [6,12]
    And 4 takes over [0,20]
    When play starts
    Then there are 4 takes
```
