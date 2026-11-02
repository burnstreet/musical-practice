---
name: TTS renderer
description: Renders every script line to MP3 with the voice of its role, at build time on the Admin's machine. XTTS-v2 engine, chunking, idempotency by line hash, orphan cleanup, voice test.
targets:
  - ../tools/script_render.py
---

# TTS renderer

Local only. Never in CI: the rendered MP3s are committed in the production repo. Paths relative to the content root.

```
python tools/script_render.py            # render every line without audio, delete orphans
python tools/script_render.py --test     # voice test, see below
```

```python { .api }
def render_line(line: dict, voice: dict, out_dir: Path) -> Path   # used by the CLI and the editor server
ENGINES: dict[str, Callable[[str, dict], tuple[np.ndarray, int]]]  # name -> synth(text, voice) -> (mono float audio, sample rate)
```

## Voices

- `voice` per role in `sources/config.json` (see script-format). Engine `xtts`: `{ "engine": "xtts", "speaker": "<built-in XTTS-v2 speaker>", "speed": 1.0 }`, `speed` optional.
- `xtts`: XTTS-v2 through `coqui-tts`, language `de`, built-in speaker, `split_sentences=False` (its own splitting makes it babble between sentences, listening test 2026-11-02). CUDA when available, else CPU with a warning. Model loaded once per process.
- An engine is one function in `ENGINES`. Tests register a fake engine `sine`.
- Before rendering anything: a speaking role with lines but no `voice`, or an unknown engine, is listed and the tool exits 1.

## Chunking

XTTS takes about 250 characters per call and invents sounds on very short input.

- Spoken text = `say` or `text`. Split into sentences after `.`, `!`, `?`, `…` (with closing quotes) followed by a space.
- Pack sentences greedily into chunks of at most 250 characters. A sentence over 250 splits after `,`, `;`, `:` or `–`, last resort between words.
- A chunk under 40 characters joins its shorter neighbour when the result stays within 250.
- Each chunk is one engine call. Chunks join with 250 ms silence.
  `[@test] ../tools/tests/steps_script_render.py`

```gherkin
Feature: Chunking
  Scenario: short line is one chunk
    When I chunk "Hallo Anna. Wusste ich nicht."
    Then I get one chunk

  Scenario: long text splits at sentences, no chunk too short
    Given a text of 12 sentences of 50 characters each
    When I chunk it
    Then every chunk has at most 250 characters and at least 40
    And joining the chunks with spaces gives the text

  Scenario: short exclamation joins a neighbour
    Given a text "Wunderbar." followed by 4 sentences of 55 characters
    When I chunk it
    Then no chunk is "Wunderbar."

  Scenario: overlong sentence splits at a comma
    Given one sentence of 400 characters with a comma at 200
    When I chunk it
    Then I get two chunks split after the comma
```

## Rendering

- For every line: hash per script-format. `web/data/script/<hash>.mp3` exists: skipped. Else render, post-process, write to a temp name, rename.
- Post-processing (ffmpeg): trim silence below −45 dB to at most 100 ms at both ends, loudness `loudnorm I=-18 TP=-1.5`, MP3 mono 64 kbps 44.1 kHz.
- After a full run: MP3s in `web/data/script/` whose name is no current line hash are deleted.
- Report: rendered, skipped, deleted, total seconds.
  `[@test] ../tools/tests/steps_script_render.py`

```gherkin
Feature: Rendering
  Scenario: missing lines rendered, existing skipped
    Given a script with lines a and b, voices on engine sine, and audio for a present
    When I render
    Then only b is rendered and both have audio

  Scenario: edited text renders anew and drops the old file
    Given a fully rendered script
    When line a's text changes and I render
    Then a is rendered under its new hash and its old file is gone

  Scenario: say is spoken
    Given a line with text "Jo" and say "Joh"
    When I render
    Then the engine received "Joh"

  Scenario: role without voice stops the run
    Given a line of role anna and no voice for anna
    When I render
    Then the exit code is 1, the output names anna, and nothing is rendered

  Scenario: output format
    Given a line rendered by engine sine with 1 s of silence before and after
    Then its file is mono MP3 at 44.1 kHz, 64 kbps, with at most 0.1 s silence at each end
```

## Voice test (`--test`)

- For every speaking role with a voice and lines: the first two sentences of its lines in play order (from `say` or `text`), rendered as one file `work/voice-test/<role>.mp3`. Overwritten each run. Script audio untouched.
- Roles without lines are listed.
  `[@test] ../tools/tests/steps_script_render.py`

```gherkin
Feature: Voice test
  Scenario: two sentences per role
    Given role anna with lines "Eins. Zwei. Drei." and "Vier."
    When I run the voice test
    Then work/voice-test/anna.mp3 exists and the engine received "Eins. Zwei."
```

## Setup and license

- `coqui-tts` with CUDA torch is installed by `./mp.ps1 setup` (see overview, open point). The XTTS-v2 model (about 2 GB) downloads on first use into the user cache, never into a repo.
- XTTS-v2 is under the Coqui Public Model License: non-commercial use only. The production is non-commercial. The tool sets `COQUI_TOS_AGREED=1`. See ADR 0008.
