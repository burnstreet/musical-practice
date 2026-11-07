---
name: Cue engine
description: Pure state machine of a dialog run-through. Turns, playing other roles, waiting for the actor, skip, back, prompt, pause, paused start, repeat of a turn range, hard timeout. Own-line hint text.
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
  repeat: CueRepeat | null
}
/** Item ids within one scene. */
export interface CueRepeat { sceneId: string; from?: string; to?: string }
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
  next: ScriptItem[]                      // turn the next forward move enters, wrap included; [] after the last scene
  effects: CueEffect[]                    // of the last step only
  position(): { sceneId: string; itemId: string }   // first item of the turn; host stores it per role set
}
export function cueStart(script: Script, opts: CueOptions, at: { sceneId: string; itemId?: string; paused?: boolean }, now: number): Cue
export function cueStep(cue: Cue, ev: CueEvent, now: number): Cue
/** First item of the range's first turn, last item of its last turn; null without a range. */
export function repeatRange(script: Script, opts: CueOptions): { from: string; to: string } | null
export function hintText(text: string, mode: 'show' | 'hide' | 'start'): string
```

## Turns

- Flow of a scene = its items in order, without directions when `showDirections` is false.
- Turn = one item. Exception: consecutive lines of roles in `roles` form one turn, the actor's turn.
- `cueStart` enters the turn holding `itemId`, else the scene's first turn. With `paused`: state `paused` at that turn, no effects.

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
- End of scene: first turn of the next scene. After the last scene: `done`, `mic off`.
- `pause` from any state but `done`: `paused`, effects `stop`, `mic off`. `resume`: the paused turn entered again from its start.

## Repeat

- Range = every turn of `repeat.sceneId` that holds an item between `from` and `to` (scene order, both included). A missing end, or an id not in the scene, means the scene's start or end. No such turn: no repeat.
- A forward move (any event that goes to a next turn, `skip` included) from a turn at or before the last turn of the range that would land after it: the first turn of the range instead.
- `back` ignores the range. A repeat of another scene than the current has no effect.

## Hint text

- `show`: the text. `hide`: `""`. `start`: the first 3 words plus ` …`; 3 words or fewer: the text. An inline direction `[…]` counts as no word and stays where it is when it comes before the cut.

Sample script of the scenarios: scene s1 = direction d1, lines l1 and l2 of vater, lines l3 and l4 of lena, line l5 of vater, song g1; scene s2 = line m1 of vater. Unless a scenario says otherwise: roles [lena], directionMs 2500, hardTimeoutMs 20000, directions shown, no repeat.
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

  @todo
  Scenario: paused start
    When I start at s1 l3 paused
    Then the state is paused with turn [l3, l4] and no effects
    When I resume
    Then the state is waiting with turn [l3, l4] and mic on

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

  @todo
  Scenario: repeat wraps after the last turn
    Given repeat in s1 from l2 to l3 and I am waiting at l3
    Then the next turn is [l2]
    When speech starts and speech ends
    Then the state is playing with play [l2]

  @todo
  Scenario: repeat ends snap to the actor's whole turn
    Given repeat in s1 from l4 to l5
    Then the repeat range is l3 to l5
    Given I am playing l5
    When audio ends
    Then the state is waiting with turn [l3, l4]

  @todo
  Scenario: repeat without an end runs to the scene end
    Given repeat in s1 from l5 and I am at the song g1
    When I tap
    Then the state is playing with play [l5]

  @todo
  Scenario: start before the range plays into it, then repeats
    Given repeat in s1 from l3 to l4 and I am playing l2
    When audio ends
    Then the state is waiting with turn [l3, l4]
    When speech starts and speech ends
    Then the state is waiting with turn [l3, l4]

  @todo
  Scenario: skip past the last turn wraps
    Given repeat in s1 from l2 to l2 and I am playing l1
    When I skip
    Then the state is playing with play [l2] and the effects hold stop

  @todo
  Scenario: start after the range plays on
    Given repeat in s1 from l1 to l2 and I am playing l5
    When audio ends and I tap
    Then the state is playing in scene s2

  @todo
  Scenario: back ignores the range
    Given repeat in s1 from l3 to l4 and I am waiting at l3
    When I go back
    Then the state is playing with play [l2]

  @todo
  Scenario: repeat start on a hidden direction
    Given directions are not shown and repeat in s1 from d1 to l2
    Then the repeat range is l1 to l2
    Given I am playing l2
    When audio ends
    Then the state is playing with play [l1]

  @todo
  Scenario: unknown id means the scene start
    Given repeat in s1 from x9 to l1 and I am playing l1
    When audio ends
    Then the state is direction

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
    Given roles [lena, vater]
    When I start at s1 after the direction
    Then the state is waiting with turn [l1, l2, l3, l4, l5]

  Scenario: position for resume
    Given I am waiting at l3
    Then the position is s1, l3

Feature: Hint text
  Scenario: start of the line
    Then hintText "Wir gehen gleich nach Hause" with start is "Wir gehen gleich …"
    And hintText "Ich geh" with start is "Ich geh"
    And hintText "Ich geh" with hide is ""
    And hintText "[leise] Wir gehen gleich nach" with start is "[leise] Wir gehen gleich …"
```
