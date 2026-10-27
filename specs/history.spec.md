---
name: History
description: On-device result history per song and role set. Last 20 sessions, best and last pass, badge value for the song list.
targets:
  - ../src/core/history.ts
---

# History

IndexedDB store `history`. Key = `songId + '|' + sorted role ids joined by ','`.

```ts { .api }
export interface SessionSummary { at: string; passes: number; bestHitPct: number; lastHitPct: number }

export interface History {
  record(songId: string, roles: RoleId[], passes: PassResult[]): Promise<void>   // no-op when passes empty
  list(songId: string, roles: RoleId[]): Promise<SessionSummary[]>               // newest first, max 20
  badge(songId: string, roles: RoleId[]): Promise<number | null>                 // lastHitPct of newest session
  wipe(): Promise<void>                                                           // registered with vault.onWipe
}
```

- `record` appends one summary, drops the oldest beyond 20.
- Role order does not matter for the key.
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
