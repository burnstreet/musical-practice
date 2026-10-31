import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import align_score  # noqa: E402
import numpy as np  # noqa: E402


def note(section, pass_, start, lyrics):
    return {"section": section, "pass": pass_, "start": start, "lyric": lyrics[0], "lyrics": lyrics}


def test_nth_occurrence_sings_verse_n_and_last_verse_repeats():
    notes = [
        note("S", 1, 30.0, ["a", "b"]),  # found second by DTW, sung first
        note("S", 0, 50.0, ["a", "b"]),
        note("R", 0, 40.0, ["x", "y"]),
        note("R", 1, 60.0, ["x", "y"]),
        note("R", 2, 70.0, ["x", "y"]),
    ]
    align_score.apply_verses(notes)
    assert [(n["section"], n["start"], n["lyric"]) for n in notes] == [
        ("S", 30.0, "a"),
        ("S", 50.0, "b"),
        ("R", 40.0, "x"),
        ("R", 60.0, "y"),
        ("R", 70.0, "y"),
    ]
    assert not any("lyrics" in n for n in notes)


def test_form_gives_each_sung_block_its_role_in_time_order():
    form = align_score.parse_form("Refrain:anna, Strophe:anna, Refrain:chor, Strophe 3, Refrain:chor")
    assert form == [("Refrain", "anna"), ("Strophe", "anna"), ("Refrain", "chor"), ("Strophe 3", None), ("Refrain", "chor")]
    notes = [
        {"section": "Refrain", "pass": 2, "start": 50.0, "role": "x"},
        {"section": "Refrain", "pass": 0, "start": 10.0, "role": "x"},
        {"section": "Refrain", "pass": 0, "start": 11.0, "role": "x"},
        {"section": "Strophe", "pass": 0, "start": 20.0, "role": "x"},
        {"section": "Strophe 3", "pass": 0, "start": 40.0, "role": "x"},
        {"section": "Refrain", "pass": 1, "start": 30.0, "role": "x"},
    ]
    align_score.apply_form(notes, form)
    assert [(n["start"], n["role"]) for n in notes] == [
        (50.0, "chor"),
        (10.0, "anna"),
        (11.0, "anna"),
        (20.0, "anna"),
        (40.0, "x"),
        (30.0, "chor"),
    ]


def test_form_rejects_blocks_found_in_another_order():
    form = align_score.parse_form("Refrain,Strophe,Refrain")
    notes = [
        {"section": "Strophe", "pass": 0, "start": 10.0},
        {"section": "Refrain", "pass": 0, "start": 20.0},
        {"section": "Refrain", "pass": 1, "start": 30.0},
    ]
    try:
        align_score.apply_form(notes, form)
    except SystemExit as e:
        assert "Strophe, Refrain, Refrain" in str(e)
    else:
        raise AssertionError("order mismatch not reported")


def test_grid_lays_a_pass_on_the_score_tempo_at_its_median_offset():
    # 120 bpm: a beat is 0.5 s; DTW put the first note 0.4 s late
    notes = [
        {"bar": 3, "beat": 0.0, "dur": 1.0, "start": 10.4, "end": 10.5},
        {"bar": 3, "beat": 1.0, "dur": 1.0, "start": 10.5, "end": 11.0},
        {"bar": 4, "beat": 0.0, "dur": 2.0, "start": 12.0, "end": 13.1},
    ]
    align_score.grid(notes, bpm=120, beats_per_bar=4)
    assert [(n["start"], n["end"]) for n in notes] == [(10.0, 10.5), (10.5, 11.0), (12.0, 13.0)]


def test_spoken_frames_cost_the_same_against_any_audio():
    seq = [{"midi": 64, "dur": 1.0}, {"midi": 71, "dur": 1.0, "spoken": True}, {"midi": None, "dur": 1.0}]
    score, _ = align_score.score_frames(seq, bpm=600)  # 10 frames per note
    audio = np.array([64.0, 70.0, np.nan, 52.3])
    C = align_score.cost_matrix(score, audio)
    assert C[0, 0] == 0 and C[0, 2] == 1  # sung: pitch counts, a gap is worst
    assert len(set(C[10].tolist())) == 1  # spoken: no pitch, no preference
    assert C[20, 2] == 0  # rest against a gap


def test_spoken_note_keeps_its_flag_and_is_never_snapped():
    seq = [{"midi": 71, "name": "B4", "bar": 1, "beat": 0.0, "dur": 1.0, "spoken": True}]
    wp = np.array([(f, f) for f in range(10)])
    t_audio = np.arange(20) * 0.01
    sung = np.full(20, 60.0)  # spoken syllables do have a pitch, far from the slash's B4
    (n,) = align_score.notes_from_path(seq, [(0, 10)], wp, t_audio, sung, snap=True)
    assert n["spoken"] is True and n["midi"] == 71 and "snapped" not in n


def test_grid_anchors_on_sung_notes_when_a_pass_has_spoken_ones():
    # 120 bpm; DTW cannot place rap (no pitch), so the spoken notes' times are off and must not move the anchor
    notes = [
        {"bar": 1, "beat": 0.0, "dur": 1.0, "start": 3.0, "end": 3.2, "spoken": True},
        {"bar": 1, "beat": 1.0, "dur": 1.0, "start": 3.1, "end": 3.3, "spoken": True},
        {"bar": 1, "beat": 2.0, "dur": 1.0, "start": 3.2, "end": 3.4, "spoken": True},
        {"bar": 2, "beat": 0.0, "dur": 1.0, "start": 2.0, "end": 2.5},
        {"bar": 2, "beat": 1.0, "dur": 1.0, "start": 2.5, "end": 3.0},
    ]
    align_score.grid(notes, bpm=120, beats_per_bar=4)
    assert [n["start"] for n in notes] == [0.0, 0.5, 1.0, 2.0, 2.5]
