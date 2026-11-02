---
name: Cue engine
description: Pure state machine of a dialog run-through. Turns, playing other roles, waiting for the actor, skip, back, prompt, pause, scene loop, hard timeout. Own-line hint text.
targets:
  - ../src/core/cue.ts
---

# Cue engine

Pure. No audio, no mic, no timers: the host feeds events with a clock `now` (ms) and carries out the effects. Tests drive it with event lists.

```ts { .api }
export type CueState = 'playing' | 'direction' | 'song' | 'waiting' | 'speaking' | 'prompting' | 'paused' | 'done'
export interface CueOptions {
  roles: RoleId[]            // the actor's role set
  hardTimeoutMs: number      // default 20000
  directionMs: number        // default 2500
  showDirections: boolean    // false: directions are left out of the flow
  loopScene: boolean
}
export type CueEvent =
  | { type: 'audioEnded' } | { type: 'speechStart' } | { type: 'speechEnd' }
  | { type: 'tap' } | { type: 'skip' } | { type: 'back' } | { type: 'prompt' }
  | { type: 'pause' } | { type: 'resume' } | { type: 'tick' }
export type CueEffect =
  | { type: 'play'; itemIds: string[] }   // audio of these lines, in order, then the host sends audioEnded
  | { type: 'stop' }                      // stop playback
  | { type: 'mic'; on: boolean }
  | { type: 'missed' }                    // hard timeout passed: show a hint
export interface Cue {
  state: CueState
  sceneId: string
  turn: ScriptItem[]                      // items shown as current
  effects: CueEffect[]                    // of the last step only
  position(): { sceneId: string; itemId: string }   // first item of the turn; host stores it per role set
}
export function cueStart(script: Script, opts: CueOptions, at: { sceneId: string; itemId?: string }, now: number): Cue
export function cueStep(cue: Cue, ev: CueEvent, now: number): Cue
export function hintText(text: string, mode: 'show' | 'hide' | 'start'): string
```

## Turns

- Flow of a scene = its items in order, without directions when `showDirections` is false.
- Turn = one item. Exception: consecutive lines of roles in `roles` form one turn, the actor's turn.
- `cueStart` enters the turn holding `itemId`, else the scene's first turn.

## Per turn

- Line of another role: `playing`, effects `mic off`, `play [id]`. `audioEnded`: next turn.
- Direction: `direction`. `tick` at `directionMs` after entering: next turn.
- Song: `song`. Waits. `tap`: next turn. Jumping to the song is the screen's business; coming back, the host calls `cueStart` at the song item.
- Actor's turn: `waiting`, effect `mic on`. `speechStart`: `speaking`. `speechEnd` (voice detect already waited the silence time): next turn. `tap` in `waiting` or `speaking`: next turn. `tick` in `waiting` with `hardTimeoutMs` passed since entering: effect `missed`, next turn. While `speaking` there is no hard timeout.
- `prompt` in `waiting` or `speaking`: `prompting`, effects `mic off`, `play` the turn's item ids. `audioEnded`: back to `waiting`, `mic on`, hard timeout counts anew.
- Speech events outside `waiting` and `speaking` are ignored. The mic is on only there.

## Navigation

- `skip` in `playing`: jump to the next turn whose role differs from the current line's role (skips the rest of that speaker). Elsewhere `skip` = `tap`.
- `back`: start of the previous turn. At the first turn of a scene: last turn of the previous scene. At the very first turn: same turn again.
- Leaving a turn while audio plays adds effect `stop`.
- End of scene: `loopScene` true: first turn of the same scene. Else first turn of the next scene. After the last scene: `done`, `mic off`.
- `pause` from any state but `done`: `paused`, effects `stop`, `mic off`. `resume`: the paused turn entered again from its start.

## Hint text

- `show`: the text. `hide`: `""`. `start`: the first 3 words plus ` …`; 3 words or fewer: the text. An inline direction `[…]` counts as no word and stays where it is when it comes before the cut.

Sample script of the scenarios: scene s1 = direction d1, lines l1 and l2 of mutter, lines l3 and l4 of anna, line l5 of mutter, song g1; scene s2 = line m1 of mutter. Unless a scenario says otherwise: roles [anna], directionMs 2500, hardTimeoutMs 20000, directions shown, no loop.
  `[@test] ../tests/steps/cue.steps.ts`

```gherkin
Feature: Cue engine
  Scenario: a clean run
    Given the sample script
    When I start at s1
    Then the state is direction
    When a tick comes at 2500 ms
    Then the state is playing with play [l1] and mic off
    When audio ends
    Then the state is playing with play [l2]
    When audio ends
    Then the state is waiting with turn [l3, l4] and mic on
    When speech starts and speech ends
    Then the state is playing with play [l5] and mic off
    When audio ends
    Then the state is song
    When I tap
    Then the state is playing in scene s2

  Scenario: skip jumps past the rest of the speaker
    Given I am playing l1
    When I skip
    Then the state is waiting with turn [l3, l4] and the effects hold stop

  Scenario: hard timeout
    Given I am waiting at l3 since 0 ms
    When a tick comes at 19999 ms
    Then the state is waiting
    When a tick comes at 20000 ms
    Then the effects hold missed and the state is playing l5

  Scenario: no timeout while speaking
    Given I am waiting at l3 since 0 ms
    When speech starts at 1000 ms and a tick comes at 30000 ms
    Then the state is speaking

  Scenario: prompt plays my lines and waits again
    Given I am waiting at l3
    When I ask for a prompt
    Then the state is prompting with play [l3, l4] and mic off
    When audio ends
    Then the state is waiting with mic on

  Scenario: speech while others speak is ignored
    Given I am playing l1
    When speech starts
    Then the state is playing

  Scenario: back from the actor's turn
    Given I am waiting at l3
    When I go back
    Then the state is playing with play [l2]

  Scenario: scene loop
    Given loop is on and I am at the song g1
    When I tap
    Then the state is direction in scene s1

  Scenario: end of script
    Given I am playing m1
    When audio ends
    Then the state is done with mic off

  Scenario: pause and resume replay the turn
    Given I am playing l2
    When I pause
    Then the state is paused with stop and mic off
    When I resume
    Then the state is playing with play [l2]

  Scenario: directions hidden
    Given directions are not shown
    When I start at s1
    Then the state is playing with play [l1]

  Scenario: two roles of mine in a row form one turn
    Given roles [anna, mutter]
    When I start at s1 after the direction
    Then the state is waiting with turn [l1, l2, l3, l4, l5]

  Scenario: position for resume
    Given I am waiting at l3
    Then the position is s1, l3

Feature: Hint text
  Scenario: start of the line
    Then hintText "Ich geh jetzt mal los" with start is "Ich geh jetzt …"
    And hintText "Ich geh" with start is "Ich geh"
    And hintText "Ich geh" with hide is ""
    And hintText "[leise] Ich geh jetzt mal" with start is "[leise] Ich geh jetzt …"
```
