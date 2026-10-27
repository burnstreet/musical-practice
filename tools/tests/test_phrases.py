from conftest import FEATURES_DIR
from pytest_bdd import scenarios
from steps_phrases import *  # noqa: F401,F403  (step definitions)

scenarios(str(FEATURES_DIR / "phrase-derivation.feature"))
