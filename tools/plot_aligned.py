"""Plot aligned score notes over the audio pitch track for a time range.

Usage: python tools/plot_aligned.py <aligned.json> <out.png> <t0> <t1> [<t0b> <t1b>]
"""

import json
import sys

import matplotlib
import numpy as np
from music import hz_to_midi, midi_name

matplotlib.use("Agg")
import matplotlib.pyplot as plt

d = json.load(open(sys.argv[1], encoding="utf-8"))
out = sys.argv[2]
ranges = [(float(sys.argv[i]), float(sys.argv[i + 1])) for i in range(3, len(sys.argv), 2)]
p = np.array([[t, hz_to_midi(f) if f else np.nan] for t, f, c in d["pitch"]])
fig, axes = plt.subplots(len(ranges), 1, figsize=(40, 4.5 * len(ranges)), squeeze=False)
for ax, (t0, t1) in zip(axes[:, 0], ranges):
    sel = (p[:, 0] >= t0) & (p[:, 0] <= t1)
    ax.scatter(p[sel, 0], p[sel, 1], s=3, c="orange")
    for n in d["notes"]:
        if n["end"] < t0 or n["start"] > t1:
            continue
        col = "red" if n.get("snapped") else "blue"
        ax.hlines(n["midi"], n["start"], n["end"], colors=col, linewidth=3)
        ax.text(n["start"], n["midi"] + 0.3, f"{n.get('section', '')[:1] if n.get('section') else ''}{n['bar']}", fontsize=6)
    ys = [n["midi"] for n in d["notes"] if n["end"] >= t0 and n["start"] <= t1] or [60]
    lo, hi = min(ys) - 3, max(ys) + 3
    ax.set_xlim(t0, t1)
    ax.set_ylim(lo, hi)
    ticks = [m for m in range(lo, hi + 1) if m % 12 in (0, 5, 7)]
    ax.set_yticks(ticks)
    ax.set_yticklabels([midi_name(m) for m in ticks])
    ax.grid(alpha=0.3)
fig.suptitle(f"{d['title']}: score notes (blue; red = pitch snapped to the sung pitch) over sung pitch (orange)")
fig.tight_layout()
fig.savefig(out, dpi=60)
