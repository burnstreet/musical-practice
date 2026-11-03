from conftest import FEATURES_DIR
from pytest_bdd import scenarios
from steps_script_parse import *  # noqa: F401,F403

scenarios(str(FEATURES_DIR / "script-parsing.feature"))
