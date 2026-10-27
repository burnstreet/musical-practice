---
name: Scorer
description: Pure scoring. Octave folding, per-note hit, pass results, phrase stats, coaching sentence, session with passes and trend.
targets:
  - ../src/core/scorer.ts
  - ../src/core/session.ts
---

# Scorer

Pure functions plus one small stateful `Session`. No audio, no DOM.

```ts { .api }
export type Tolerance = 75 | 50 | 30
export type Tendency = 'high' | 'low' | 'ok'

export interface NoteResult { note: Note; sung: boolean; cents: number | null; hit: boolean; maxAbsCents: number | null }
export interface PhraseResult { index: number; label: string; notes: number; sung: number; hits: number; meanCents: number | null }
export interface PassResult {
  notes: NoteResult[]; phrases: PhraseResult[]
  scoredNotes: number; hits: number; hitPct: number
  meanCents: number | null; tendency: Tendency
  rangeMidi: [number, number] | null
  worstPhrase: number | null; tip: string
}

export function foldCents(sungMidi: number, targetMidi: number): number        // (-600, 600]
export function scoreNote(note: Note, frames: PitchFrame[], tol: Tolerance): NoteResult
export function scorePass(song: Song, roles: RoleId[], framesByNote: Map<number, PitchFrame[]>, tol: Tolerance): PassResult

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

## Pass

- Scored notes = my notes that were entered in this pass. Others excluded from every statistic.
- `hitPct` = round(100 · hits / scoredNotes). 0 scored notes: hitPct 0, meanCents null, tendency `ok`, tip "Keine Töne gesungen."
- `meanCents` = mean of folded cents over all considered frames of scored notes. `tendency`: above 15 `high`, below −15 `low`, else `ok`.
- `rangeMidi` = [min, max] of rounded sung midi, true octave, over considered frames.
- Phrase stats over scored notes per phrase. `meanCents` of phrase = mean of note cents of sung notes, null when none sung.
- `worstPhrase`: among phrases with scored notes, the one with largest |meanCents|; ties: more misses; still tied: lower index. Phrase with all notes unsung: |meanCents| treated as 0 but misses count.
- `tip` templates, `n` = worst phrase index + 1, `syl` = syllable of first note in that phrase with |cents| > tol, else first unsung note, `max` = that phrase's max |cents| rounded:
  - worst meanCents ≤ −tol/2: `Phrase {n} ist zu tief. Ab „{syl}“ rutscht die Stimme um bis zu {max} Cent ab. Übe die Stelle langsamer.`
  - worst meanCents ≥ tol/2: `Phrase {n} ist zu hoch. Ab „{syl}“ steigt die Stimme um bis zu {max} Cent. Übe die Stelle langsamer.`
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
    And phrase 0 meanCents is 0 and phrase 1 meanCents is -50
    And worstPhrase is 1

  Scenario: tip for flat phrase
    Given the pass above where note 3 has syllable "ge" and maxAbsCents 65
    Then tip is "Phrase 2 ist zu tief. Ab „ge“ rutscht die Stimme um bis zu 65 Cent ab. Übe die Stelle langsamer."

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

- `frame` routes by `t` into the entered note whose `[start, end]` contains `t`, mine only. Frames before `enter` of that note dropped.
- `enter` on an already entered note clears its frames (loop restart, seek back). Last entry wins.
- `startPass` clears entered set and frames. `endPass` scores, appends, returns. Pass number = `passes().length`.
- `myNotes` = my notes of `visibleNotes(song.notes, roles)`. `enter` ignores the dropped unison copies, so a duet note counts once.
  `[@test] ../tests/steps/scorer.steps.ts`

```gherkin
Feature: Session
  Scenario: loop keeps the last repetition
    Given a session with note 0 [1.0,2.0] midi 67
    When I start a pass, enter note 0, feed frames at 60, enter note 0 again, feed frames at 67, end the pass
    Then note 0 is a hit

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
```
