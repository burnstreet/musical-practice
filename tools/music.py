"""Pitch helpers shared by the tools: note names, Hz to MIDI."""

import numpy as np

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]


def midi_name(m, flats=False):
    names = NOTE_NAMES_FLAT if flats else NOTE_NAMES
    return f"{names[m % 12]}{m // 12 - 1}"


def hz_to_midi(hz):
    return 69 + 12 * np.log2(hz / 440.0)
