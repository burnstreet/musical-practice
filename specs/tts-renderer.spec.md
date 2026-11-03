---
name: TTS renderer
description: Renders every script line to MP3 with the voice of its role, at build time on the Admin's machine. Engines XTTS-v2 and OpenAI, chunking, idempotency by line hash, orphan cleanup, voice test.
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
- Engine `openai`: `{ "engine": "openai", "model": "<speech model>", "voice": "<built-in voice>", "instructions": "<how to speak>" }`. `POST https://api.openai.com/v1/audio/speech` with `model`, `voice`, `input` = spoken text, `instructions`, `response_format: "pcm"` (16-bit mono 24 kHz), key from env `OPENAI_API_KEY`. The line's `direction` (script-format), when not empty, goes after the instructions as `\nRegie zu dieser Zeile: <direction>`. HTTP error: fails with status and body. Standard library only.
- Engine `openai-realtime`: same fields, `model` a Realtime model. One WebSocket session per line (`wss://api.openai.com/v1/realtime?model=<model>`, bearer key): `session.update` (audio output only, PCM 24 kHz, `voice`, instructions with direction as above), the spoken text as one user message, `response.create`; audio from `response.output_audio.delta` up to `response.done`. A conversational model may change the text: the transcript (`response.output_audio_transcript.delta`) must have the spoken text's words (lowercase, punctuation ignored), else the line is spoken again, at most 3 sessions, then the run fails naming the line's transcript. `aiohttp` loads on first use (TTS venv).
- An engine is one function in `ENGINES`. Tests register a fake engine `sine`.
- Before rendering anything: a speaking role with lines but no `voice`, or an unknown engine, or a voice on `openai` or `openai-realtime` without `OPENAI_API_KEY`, is listed and the tool exits 1.
  `[@test] ../tools/tests/steps_script_render.py`

```gherkin
Feature: OpenAI engine
  Scenario: line with direction, in one call
    Given role josef on engine openai with model "m", voice "echo" and instructions "Sanft."
    And a line of josef with text "[fleht] Aber meine Frau." followed by 4 sentences of 100 characters
    When I render against a fake OpenAI answering 1 s of PCM
    Then OpenAI got one request with model "m", voice "echo", response format "pcm" and the spoken text
    And its instructions are "Sanft.\nRegie zu dieser Zeile: fleht"
    And the line has audio

  Scenario: no key stops the run
    Given role josef on engine openai with model "m", voice "echo" and instructions "Sanft."
    And a line of josef with text "Hallo."
    And no OPENAI_API_KEY
    When I render
    Then the exit code is 1, the output names OPENAI_API_KEY, and nothing is rendered

Feature: OpenAI Realtime engine
  Scenario: line with direction, in one session
    Given role josef on engine openai-realtime with model "m", voice "echo" and instructions "Sanft."
    And a line of josef with text "[fleht] Aber meine Frau." followed by 4 sentences of 100 characters
    When I render against a fake Realtime that reads the text
    Then Realtime got one session for model "m" with voice "echo", audio output and the spoken text as user message
    And its instructions are "Sanft.\nRegie zu dieser Zeile: fleht"
    And the line has audio

  Scenario: case and punctuation do not matter
    Given role josef on engine openai-realtime with model "m", voice "echo" and instructions "Sanft."
    And a line of josef with text "„Hallo, Wirt!“"
    When I render against a fake Realtime that says "hallo Wirt."
    Then Realtime got 1 sessions and the line has audio

  Scenario: changed words are spoken again, then fail
    Given role josef on engine openai-realtime with model "m", voice "echo" and instructions "Sanft."
    And a line of josef with text "Hallo Wirt."
    When I render against a fake Realtime that says "Hallo Welt."
    Then Realtime got 3 sessions, the run failed naming "Hallo Welt.", and the line has no audio
```

## Chunking

XTTS takes about 250 characters per call and invents sounds on very short input. Engines `openai` and `openai-realtime` take the whole line in one call (up to about 2000 tokens), so they are never chunked.

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

- Own venv `tools/.venv-tts`, created by `./mp.ps1 setup -Tts` on the Admin's machine only: Python 3.12 from mise, `coqui-tts[cuda]` with CUDA torch, nothing else. The tools venv stays light, because CI installs it for every pack and must never pull torch. The implementation updates the venv rule in CLAUDE.md.
- `./mp.ps1 tool script_render` runs in `tools/.venv-tts`. `script_format.py` uses only the standard library, so both venvs import it.
- Editor server (`serve.py`, tools venv): the first `/render-line` starts `tools/.venv-tts` with `script_render.py --worker`, which loads the model once and answers one JSON line per request on stdin/stdout (`{item, voice}` in, `{hash}` or `{error}` out). The worker ends with the server. No TTS venv: `/render-line` answers 503 with a message naming `setup -Tts`.
- The XTTS-v2 model (about 2 GB) downloads on first use into the user cache, never into a repo.
- XTTS-v2 is under the Coqui Public Model License: non-commercial use only. The production is non-commercial. The tool sets `COQUI_TOS_AGREED=1`. See ADR 0008.
- Engine `openai` sends the spoken text and directions to OpenAI and costs per call (whole play about 0.50 USD with `gpt-4o-mini-tts`). Key in env `OPENAI_API_KEY` (user environment, so the editor's worker gets it), never in a file. OpenAI shuts the speech models down on 2027-01-06. See ADR 0008.
