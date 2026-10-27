import json

from steps_pack import ctx, decrypt_file, library, make_song, notes, run  # noqa: F401


def test_note_without_lyric_packs_as_empty_syllable(ctx):
    n = notes()
    n[2]["lyric"] = None  # melisma continuation in real data
    make_song(ctx, n)
    run(ctx)
    song = json.loads(decrypt_file(ctx, library(ctx)["songs"][0]["files"]["notes"]))
    assert song["notes"][2]["syllable"] == ""
