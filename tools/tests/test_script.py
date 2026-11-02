from conftest import FEATURES_DIR
from pytest_bdd import scenarios
from steps_script import *  # noqa: F401,F403

for name in ("script-source", "line-hash"):
    scenarios(str(FEATURES_DIR / f"{name}.feature"))
