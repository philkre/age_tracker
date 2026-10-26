"""The ranked civ pool (slug -> display name), from aocref's DE dataset."""

import json
from functools import cache
from pathlib import Path

# Chronicles civs exist in the dataset but can't be picked in ranked random map.
NOT_IN_RANKED = frozenset({"Achaemenids", "Athenians", "Spartans", "Macedonians", "Thracians", "Puru"})
# aoe2companion slugs that aren't just the lowercased dataset name.
SLUG_OVERRIDES = {"Maya": "mayans"}


@cache
def ranked_civs() -> dict[str, str]:
    import aocref

    path = Path(aocref.__file__).parent / "data" / "datasets" / "100.json"
    civs = json.loads(path.read_text())["civilizations"].values()
    names = sorted(c["name"] for c in civs if c["name"] not in NOT_IN_RANKED)
    return {SLUG_OVERRIDES.get(n, n.lower()): n for n in names}
