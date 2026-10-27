from conftest import FEATURES_DIR
from pytest_bdd import scenarios
from steps_pack import *  # noqa: F401,F403

for name in ("completeness", "stem-preparation", "packing"):
    scenarios(str(FEATURES_DIR / f"{name}.feature"))
