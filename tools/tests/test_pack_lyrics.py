import json

from steps_pack import ctx, decrypt_file, library, make_song, notes, run  # noqa: F401


def test_note_without_lyric_packs_as_empty_syllable(ctx):
    n = notes()
    n[2]["lyric"] = None  # melisma continuation in real data
    make_song(ctx, n)
    run(ctx)
    song = json.loads(decrypt_file(ctx, library(ctx)["songs"][0]["files"]["notes"]))
    assert song["notes"][2]["syllable"] == ""


def test_spoken_note_keeps_its_flag_and_sung_notes_get_none(ctx):
    n = notes()
    n[1]["spoken"] = True  # rap: rhythm and syllable only
    make_song(ctx, n)
    run(ctx)
    song = json.loads(decrypt_file(ctx, library(ctx)["songs"][0]["files"]["notes"]))
    assert song["notes"][1]["spoken"] is True
    assert "spoken" not in song["notes"][0]
