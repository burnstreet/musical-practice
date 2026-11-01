---
name: History
description: On-device result history per song and role set. Last 20 sessions, best and last pass, badge value for the song list. Day sums for the trend over weeks.
targets:
  - ../src/core/history.ts
---

# History

IndexedDB store `history`. Key = `songId + '|' + sorted role ids joined by ','`.

```ts { .api }
export interface SessionSummary { at: string; passes: number; bestHitPct: number; lastHitPct: number }
/** Sums of one day; averages are sums divided by counts. */
export interface DaySummary {
  day: string                                     // local date YYYY-MM-DD
  passes: number; notes: number; hits: number     // scoredNotes and hits summed
  centsSum: number; centsPasses: number           // meanCents summed over passes that have one
  entries: number; cleanEntries: number
  sections: Record<string, { notes: number; hits: number }>   // by section name
}

export interface History {
  record(songId: string, roles: RoleId[], passes: PassResult[]): Promise<void>   // no-op when passes empty
  list(songId: string, roles: RoleId[]): Promise<SessionSummary[]>               // newest first, max 20
  badge(songId: string, roles: RoleId[]): Promise<number | null>                 // lastHitPct of newest session
  recordPass(songId: string, roles: RoleId[], pass: PassResult): Promise<void>   // adds the pass to today
  days(songId: string, roles: RoleId[]): Promise<DaySummary[]>                    // newest first, max 400
  wipe(): Promise<void>                                                           // registered with vault.onWipe
}

/** One bar of the Verlauf: a day, or a week (Monday first) for span 'all'. Values null when nothing counted. */
export interface DayBar { day: string; hitPct: number | null; cents: number | null; cleanPct: number | null; sections: Record<string, number> }
export function dayBars(days: DaySummary[], span: 'week' | 'month' | 'all', today: string): DayBar[]
export function localDay(): string                                                // today, YYYY-MM-DD local
```

- `record` appends one summary, drops the oldest beyond 20.
- Role order does not matter for the key.
- `recordPass` runs per pass (practice screen), not per session: closing the app without leaving keeps the day. Adds the pass to today's entry, or starts one. Same section name twice in a song: one sum. Days stored under their own key next to the sessions, same store.
  `[@test] ../tests/steps/history.steps.ts`

```gherkin
Feature: Days
  Scenario: passes of one day add up
    Given today is "2026-11-01"
    When I record a pass with 10 notes, 4 hits, meanCents 20, 2 of 3 entries clean
    And I record a pass with 10 notes, 7 hits, meanCents 10, 3 of 3 entries clean
    Then days has one entry "2026-11-01" with passes 2, notes 20, hits 11, centsSum 30, centsPasses 2, entries 6, cleanEntries 5

  Scenario: next day, next entry
    Given today is "2026-10-31"
    And I record a pass with 10 notes, 4 hits, meanCents 20, 2 of 3 entries clean
    When today is "2026-11-01"
    And I record a pass with 10 notes, 7 hits, meanCents 10, 3 of 3 entries clean
    Then days lists "2026-11-01", "2026-10-31"

  Scenario: sections add up by name
    Given today is "2026-11-01"
    When I record two passes with section "Refrain" twice, each 2 notes and 1 hit
    Then the day has section "Refrain" with notes 8 and hits 4

  Scenario: days per role set, gone after wipe
    Given today is "2026-11-01"
    And I record a pass with 10 notes, 4 hits, meanCents 20, 2 of 3 entries clean
    Then days for [chor] is empty
    When wipe runs
    Then days for [maria] is empty
```

- `dayBars`: span `week` = 7 days, `month` = 28 days, both ending today, one bar per day. Span `all` = one bar per week, from the week of the oldest day to the week of today. Bar sums its days, then divides: `hitPct` = round(100 · hits / notes), `cents` = centsSum / centsPasses, `cleanPct` = round(100 · cleanEntries / entries), each section round(100 · hits / notes). Day without practice: all null, no sections.
  `[@test] ../tests/steps/history.steps.ts`

```gherkin
Feature: Day bars
  Scenario: last 7 days
    Given day "2026-11-01" with 10 notes, 8 hits and day "2026-10-30" with 10 notes, 6 hits
    When I make the "week" bars up to "2026-11-01"
    Then the bars start "2026-10-26" and their hits are -, -, -, -, 60, -, 80

  Scenario: 28 days
    Given day "2026-11-01" with 10 notes, 8 hits
    When I make the "month" bars up to "2026-11-01"
    Then the bars start "2026-10-05" and there are 28

  Scenario: weeks for all
    Given day "2026-11-01" with 10 notes, 8 hits and day "2026-10-27" with 10 notes, 6 hits and day "2026-10-26" with 10 notes, 4 hits and day "2026-10-14" with 10 notes, 2 hits
    When I make the "all" bars up to "2026-11-01"
    Then the bars start "2026-10-12" and their hits are 20, -, 60

  Scenario: a week sums before it divides
    Given day "2026-10-27" with centsSum -40 over 1 pass, 2 of 2 entries clean, section "Refrain" 3 of 4 hits
    And day "2026-10-26" with centsSum 20 over 1 pass, 1 of 2 entries clean, section "Refrain" 2 of 4 hits
    When I make the "all" bars up to "2026-11-01"
    Then the last bar has cents -10, cleanPct 75 and section "Refrain" 63
```

Sessions:
  `[@test] ../tests/steps/history.steps.ts`

```gherkin
Feature: History
  Scenario: record and badge
    Given passes with hitPct 40 and 70 for song "08" roles [maria, chor]
    When I record them
    Then badge("08", [chor, maria]) is 70 and list has one entry with bestHitPct 70 and passes 2

  Scenario: cap at 20
    Given 21 recorded sessions for the same key
    Then list returns 20, newest first

  Scenario: empty session not recorded
    When I record an empty pass list
    Then list is unchanged and badge stays null

  Scenario: different roles, different history
    Given a session recorded for [maria]
    Then badge("08", [chor]) is null

  Scenario: wipe
    Given recorded sessions
    When wipe runs
    Then every badge is null
```
