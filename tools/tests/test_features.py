from conftest import FEATURES_DIR
from pytest_bdd.parser import FeatureParser


def test_pytest_bdd_parses_every_feature():
    counts = {p.stem: len(FeatureParser(str(FEATURES_DIR), p.name).parse().scenarios) for p in FEATURES_DIR.glob("*.feature")}
    assert counts == {
        "completeness": 2,
        "packing": 3,
        "phrase-derivation": 3,
        "section-detection": 7,
        "stem-preparation": 2,
        "stored-sections": 5,
    }


def test_only_py_linked_features_are_generated():
    names = sorted(p.stem for p in FEATURES_DIR.glob("*.feature"))
    assert names == ["completeness", "packing", "phrase-derivation", "section-detection", "stem-preparation", "stored-sections"]


def test_feature_file_keeps_scenarios_and_german_text():
    text = (FEATURES_DIR / "phrase-derivation.feature").read_text(encoding="utf-8")
    assert text.startswith("Feature: Phrase derivation")
    assert text.count("Scenario:") == 3
    assert '"hö-re zu"' in text
