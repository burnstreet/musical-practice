from conftest import FEATURES_DIR
from pytest_bdd.parser import FeatureParser

COUNTS = {
    "chunking": 4,
    "completeness": 2,
    "line-hash": 4,
    "openai-engine": 2,
    "openai-realtime-engine": 3,
    "packing": 4,
    "phrase-derivation": 3,
    "rendering": 5,
    "script-packing": 3,
    "script-parsing": 7,
    "script-source": 3,
    "section-detection": 7,
    "stem-preparation": 2,
    "stored-sections": 5,
    "voice-test": 1,
}


def test_pytest_bdd_parses_every_feature():
    counts = {p.stem: len(FeatureParser(str(FEATURES_DIR), p.name).parse().scenarios) for p in FEATURES_DIR.glob("*.feature")}
    assert counts == COUNTS


def test_only_py_linked_features_are_generated():
    assert sorted(p.stem for p in FEATURES_DIR.glob("*.feature")) == sorted(COUNTS)


def test_feature_file_keeps_scenarios_and_german_text():
    text = (FEATURES_DIR / "phrase-derivation.feature").read_text(encoding="utf-8")
    assert text.startswith("Feature: Phrase derivation")
    assert text.count("Scenario:") == 3
    assert '"hö-re zu"' in text
