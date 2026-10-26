import sys
from pathlib import Path

# Vendored, patched mgz (see vendor/mgz/VENDORED.md) must win over any installed copy.
_VENDOR = str(Path(__file__).resolve().parent.parent / "vendor")
if _VENDOR not in sys.path:
    sys.path.insert(0, _VENDOR)
