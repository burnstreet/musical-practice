import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import align_score  # noqa: E402


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
