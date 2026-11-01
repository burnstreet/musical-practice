---
name: Scorer
description: Pure scoring. Octave folding, per-note hit, entries after rests, pass results, phrase and section stats, coaching sentence, session with passes and trend.
targets:
  - ../src/core/scorer.ts
  - ../src/core/session.ts
---

# Scorer

Pure functions plus one small stateful `Session`. No audio, no DOM.

```ts { .api }
export type Tolerance = 75 | 50 | 30
export type Tendency = 'high' | 'low' | 'ok'

export interface Entry {
  ms: number | null; cents: number | null
  timing: 'early' | 'ok' | 'late' | null; approach: 'below' | 'ok' | 'above' | null; clean: boolean
  curve: [number, number][]                       // [ms from note start, folded cents]
}
export interface NoteResult { note: Note; sung: boolean; cents: number | null; hit: boolean; maxAbsCents: number | null; entry: Entry | null }
export interface PhraseResult { index: number; label: string; notes: number; sung: number; hits: number; meanCents: number | null }
export interface PassResult {
  notes: NoteResult[]; phrases: PhraseResult[]; sections: PhraseResult[]
  scoredNotes: number; hits: number; hitPct: number; low: number; high: number
  meanCents: number | null; tendency: Tendency
  rangeMidi: [number, number] | null
  worstPhrase: number | null; tip: string
}

export function foldCents(sungMidi: number, targetMidi: number): number        // (-600, 600]
export function scoreNote(note: Note, frames: PitchFrame[], tol: Tolerance): NoteResult
export function scorePass(song: Song, roles: RoleId[], framesByNote: Map<number, PitchFrame[]>, tol: Tolerance): PassResult
export function liveDeviation(song: Song, roles: RoleId[], t: number, frames: PitchFrame[], tol: Tolerance): LiveDeviation | null

export class Session {
  constructor(song: Song, roles: RoleId[], tol: Tolerance)
  myNotes(): Note[]
  enter(noteIndex: number): void                 // from audio engine 'enter': resets that note's frames
  frame(f: PitchFrame): void                      // assigns to the note whose span contains f.t, if mine
  startPass(): void
  endPass(): PassResult | null                    // null when no note was entered
  passes(): PassResult[]
  trend(): number[]                               // hitPct per pass
}
```

## Folding

- `foldCents` = cents difference after shifting sung by whole octaves to the nearest target. Result in (−600, 600].
  `[@test] ../tests/steps/scorer.steps.ts`

```gherkin
Feature: Octave folding
  Scenario: octave below counts as hit
    Given target midi 67 and sung midi 55.1
    When I fold
    Then cents is 10

  Scenario: fifth stays a fifth
    Given target midi 60 and sung midi 67
    When I fold
    Then cents is 700 folded to -500
```

## Note

- Frames considered: `t` in `[note.start + 0.1, note.end]`, `midi` not null.
- `cents` = median of folded cents. `maxAbsCents` = max |folded|. `sung` = at least one frame considered.
- `hit` = sung and at least half the considered frames within ±tol.
  `[@test] ../tests/steps/scorer.steps.ts`

```gherkin
Feature: Note scoring
  Scenario: clean note
    Given note [1.0,2.0] midi 67 and 10 voiced frames at 67.1 between 1.1 and 2.0
    When I score the note with tolerance 50
    Then sung is true, hit is true, cents is 10

  Scenario: onset grace ignored
    Given note [1.0,2.0] midi 67, 3 frames at midi 60 before 1.1, and 10 frames at 67 after
    When I score the note with tolerance 50
    Then hit is true

  Scenario: mostly off
    Given note [1.0,2.0] midi 67 and 10 frames, 6 at 68 and 4 at 67
    When I score the note with tolerance 50
    Then hit is false and cents is 100

  Scenario: silence is a miss
    Given note [1.0,2.0] midi 67 and frames with midi null only
    When I score the note with tolerance 50
    Then sung is false and hit is false and cents is null

  Scenario: tolerance level
    Given note [1.0,2.0] midi 67 and 10 frames at 67.6
    When I score the note with tolerance 50
    Then hit is false
    When I score the note with tolerance 75
    Then hit is true
```

## Entry (Einsatz)

- Entry = scored note after a rest: no earlier note of my roles (spoken too) reaches past `start − quarter`, quarter = `(end − start) / dur` s. Also entry: first note of my roles, and first note of a new phrase after a gap over 0.05 s. Other notes: `entry` null.
- Window: voiced frames of the note with `t` in `[start − 0.3, start + 0.5]`. Session hands frames from 0.3 s before start (see Session).
- `ms` = round(1000 · (first window frame `t` − start)). No window frame: `ms`, `cents`, `timing`, `approach` null, `clean` false.
- `timing`: ms < −80 `early`, ms > 80 `late`, else `ok`.
- `cents` = median folded cents of frames in `[onset, onset + 0.1]`. `approach`: below −tol `below`, above tol `above`, else `ok`.
- `clean` = timing `ok` and approach `ok`.
- `curve` = voiced frames in `[start − 0.3, start + 0.6]` as [round ms, round cents]. For the picture only.
  `[@test] ../tests/steps/scorer.steps.ts`

```gherkin
Feature: Entries
  Scenario: entry only after a rest
    Given maria notes [1.0,2.0], [2.0,3.0] and [4.0,5.0], one quarter each, all entered
    When I score the pass
    Then notes 0 and 2 are entries and note 1 is not

  Scenario: new phrase after a short breath is an entry
    Given maria notes [1.0,2.0] in phrase 0 and [2.2,3.0] in phrase 1, one quarter each, all entered
    When I score the pass
    Then notes 0 and 1 are entries

  Scenario: clean entry
    Given entry note [4.0,5.0] midi 67 with frames at 67 from 4.02
    When I score the pass with tolerance 50
    Then the entry has ms 20, timing ok, approach ok, clean true

  Scenario: late from below
    Given entry note [4.0,5.0] midi 67 with frames at 66.2 from 4.15 to 4.25, then at 67
    When I score the pass with tolerance 50
    Then the entry has ms 150, timing late, approach below, clean false

  Scenario: early from above
    Given entry note [4.0,5.0] midi 67 with frames at 67.8 from 3.85 to 3.95, then at 67
    When I score the pass with tolerance 50
    Then the entry has ms -150, timing early, approach above, clean false

  Scenario: entry not sung
    Given entry note [4.0,5.0] midi 67 with silent frames only
    When I score the pass with tolerance 50
    Then the entry has ms null, timing null, approach null, clean false
```

## Pass

- Scored notes = my notes that were entered in this pass. Others excluded from every statistic.
- `hitPct` = round(100 · hits / scoredNotes). 0 scored notes: hitPct 0, meanCents null, tendency `ok`, tip "Keine Töne gesungen."
- `low` / `high` = sung notes not hit with note cents < 0 / ≥ 0. So hits + low + high + unsung = scoredNotes.
- `sections` = stats like phrases, one per `song.sections` entry holding scored notes (`start ≤ note.start < end`). `index` into `song.sections`, `label` = name. Empty without sections.
- `meanCents` = mean of folded cents over all considered frames of scored notes. `tendency`: above 15 `high`, below −15 `low`, else `ok`.
- `rangeMidi` = [min, max] of rounded sung midi, true octave, over considered frames.
- Phrase stats over scored notes per phrase. `meanCents` of phrase = mean of note cents of sung notes, null when none sung.
- `worstPhrase`: among phrases with scored notes, the one with largest |meanCents|; ties: more misses; still tied: lower index. Phrase with all notes unsung: |meanCents| treated as 0 but misses count.
- `tip` templates, `n` = worst phrase index + 1, `syl` = syllable of first note in that phrase with |cents| > tol, else first unsung note. No cent numbers: singers do not know cents.
  - worst meanCents ≤ −tol/2: `Phrase {n} ist zu tief. Ab „{syl}“ rutscht die Stimme ab. Übe die Stelle langsamer.`
  - worst meanCents ≥ tol/2: `Phrase {n} ist zu hoch. Ab „{syl}“ steigt die Stimme. Übe die Stelle langsamer.`
  - else, misses in worst phrase: `In Phrase {n} fehlen {k} Töne, ab „{syl}“. Sing die Stelle erst mit Voicetrack.`
  - else: `Alles getroffen. Versuch das Lied einmal ohne Voicetrack.`
  `[@test] ../tests/steps/scorer.steps.ts`

```gherkin
Feature: Pass result
  Scenario: statistics
    Given a song with 4 maria notes in phrases 0,0,1,1 and roles [maria]
    And frames giving note cents 10, -10, -60, -40 with 6 frames each
    When I score the pass with tolerance 50
    Then hitPct is 50, meanCents is -25, tendency is low
    And low is 2 and high is 0
    And phrase 0 meanCents is 0 and phrase 1 meanCents is -50
    And worstPhrase is 1

  Scenario: section statistics
    Given the song above with sections "A" [0,4] and "B" [4,9]
    And frames giving note cents 10, -10, -60, -40 with 6 frames each
    When I score the pass with tolerance 50
    Then section 0 "A" has 2 notes, 2 hits, meanCents 0
    And section 1 "B" has 2 notes, 0 hits, meanCents -50

  Scenario: tip for flat phrase
    Given the pass above where note 3 has syllable "ge" and maxAbsCents 65
    Then tip is "Phrase 2 ist zu tief. Ab „ge“ rutscht die Stimme ab. Übe die Stelle langsamer."

  Scenario: tip when all hit
    Given a pass where every scored note is a hit with |cents| under 10
    Then tip is "Alles getroffen. Versuch das Lied einmal ohne Voicetrack."

  Scenario: tip for missing notes
    Given a pass where phrase 0 has cents near 0 and 2 of 4 notes unsung, first unsung syllable "zu"
    Then tip is "In Phrase 1 fehlen 2 Töne, ab „zu“. Sing die Stelle erst mit Voicetrack."

  Scenario: other roles ignored
    Given a song with maria and josef notes and roles [maria]
    And frames inside josef notes only
    When I score the pass
    Then scoredNotes counts only entered maria notes and josef frames change nothing

  Scenario: unentered notes excluded
    Given a song with 10 maria notes and only notes 1-4 entered
    When I score the pass
    Then scoredNotes is 4

  Scenario: range in true octave
    Given target midi 67 and frames at midi 55 and 57
    When I score the pass
    Then rangeMidi is [55, 57]
```

## Session

- `frame` routes by `t` into every entered note whose `[start − 0.3, end]` contains `t`, mine only. Scoring ignores the part before `start + 0.1` anyway; the entry needs it.
- Session keeps the frames of the last 0.5 s. `enter` starts the note with those in `[start − 0.3, start)`, so singing before the engine's `enter` (early entry, latency) still counts for the entry. Kept frames after the start are stale (seek back): dropped. `startPass` empties the buffer.
- `enter` on an already entered note clears its frames (loop restart, seek back). Last entry wins.
- `startPass` clears entered set and frames. `endPass` scores, appends, returns. Pass number = `passes().length`.
- `myNotes` = my notes of `visibleNotes(song.notes, roles)`, without spoken ones. `enter` ignores the dropped unison copies, so a duet note counts once, and spoken notes, so rap is never scored.
- `liveDeviation` (cents readout) treats a spoken note like no note: null.
- A tie chain (`tie`, see content-format) is one note: its first note spans to the chain's end and takes the frames of the whole chain; `enter` ignores the notes tied into it.
  `[@test] ../tests/steps/scorer.steps.ts`

```gherkin
Feature: Session
  Scenario: loop keeps the last repetition
    Given a session with note 0 [1.0,2.0] midi 67
    When I start a pass, enter note 0, feed frames at 60, enter note 0 again, feed frames at 67, end the pass
    Then note 0 is a hit

  Scenario: singing just before the entry counts for the entry
    Given a session with note 0 [1.0,2.0] midi 67
    When I start a pass, feed frames at 67 from 0.85 to 0.95, enter note 0, feed frames at 67 from 1.0 to 2.0, end the pass
    Then the entry of note 0 has ms -150

  Scenario: trend across passes
    Given a session
    When I complete passes with hitPct 40, 60, 80
    Then trend is [40, 60, 80] and the pass number is 3

  Scenario: empty pass
    Given a session
    When I start a pass and end it without entering a note
    Then endPass returns null and passes() is empty

  Scenario: duet in unison scored once
    Given a session for roles [maria, josef] with maria and josef both on note [1.0,2.0] midi 67
    When I start a pass, enter both copies, feed frames at 67, end the pass
    Then scoredNotes is 1 and myNotes has 1 note

  Scenario: spoken notes never scored
    Given a session for roles [maria] with a sung note and a spoken note
    When I start a pass, enter both notes, feed frames inside both, end the pass
    Then scoredNotes is 1 and myNotes has 1 note

  Scenario: tied notes scored as one
    Given a session for roles [maria] with note 0 [1.0,2.0] tied to note 1 [3.0,4.0]
    When I start a pass, enter both notes, feed frames inside both, end the pass
    Then scoredNotes is 1 and myNotes has 1 note
    And the scored note spans 1 to 4

  Scenario: no live readout on a spoken note
    Given a spoken maria note [1.0,2.0] and a frame at 1.5
    When I take the live deviation at 1.5 for [maria]
    Then there is no live deviation
```
