"""Print the OpenAPI schema: `uv run python -m tracker.openapi > ../frontend/src/api/openapi.json`."""

import json
import tempfile
from pathlib import Path

from tracker.config import Settings
from tracker.db import init_db, make_engine, make_sessionmaker
from tracker.main import create_app

if __name__ == "__main__":
    engine = make_engine("sqlite://")
    init_db(engine)
    app = create_app(Settings(data_dir=Path(tempfile.gettempdir()), sync_enabled=False), make_sessionmaker(engine))
    print(json.dumps(app.openapi(), indent=2))
