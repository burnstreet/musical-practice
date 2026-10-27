"""Extracts the Python-targeted gherkin blocks of the specs into .feature files for pytest-bdd.

A block is taken when its nearest preceding `[@test]` link points at a .py file;
.ts-linked blocks run under Vitest. One file per Feature, named by the title slug.
Test modules bind them with: `from conftest import FEATURES_DIR` and
`scenarios(str(FEATURES_DIR / 'completeness.feature'))`.
"""

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPECS = [ROOT / "specs" / "builder.spec.md", ROOT / "specs" / "content-format.spec.md"]
FEATURES_DIR = Path(__file__).resolve().parent / ".features"

BLOCK = re.compile(r"\[@test\]\s+([^`\s]+)|^```gherkin\n(.*?)^```", re.M | re.S)


def slug(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def extract(spec_paths=SPECS) -> dict[str, str]:
    """slug -> feature text, for every .py-linked block."""
    features: dict[str, list[str]] = {}
    for spec in spec_paths:
        link = ""
        for m in BLOCK.finditer(spec.read_text(encoding="utf-8").replace("\r\n", "\n")):
            if m[1]:
                link = m[1]
            elif link.endswith(".py"):
                current = None
                for line in m[2].splitlines():
                    title = re.match(r"\s*Feature:\s*(.*)", line)
                    if title:
                        current = slug(title[1])
                        if current in features:
                            continue  # same Feature in a later block: append its scenarios
                        features[current] = []
                    if current:
                        features[current].append(line)
    return {k: "\n".join(v) + "\n" for k, v in features.items()}


def write_features(target: Path = FEATURES_DIR) -> None:
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True)
    for name, text in extract().items():
        (target / f"{name}.feature").write_text(text, encoding="utf-8")


# At import time, so test modules can call scenarios() during collection.
write_features()
