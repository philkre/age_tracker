import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Member:
    name: str
    profile_id: int


MEMBERS = (
    Member("Cribbeltz", 252396),
    Member("Maverick", 1308804),
    Member("Sundown", 2645968),
    Member("johannesnagel", 249543),
)
MEMBER_IDS = frozenset(m.profile_id for m in MEMBERS)

# Only ranked team random map games count as training.
LEADERBOARDS = frozenset({"rm_team"})
# A game counts if at least this many of us were on the same team.
MIN_MEMBERS_PER_GAME = 2


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("TRACKER_DATA_DIR", "data")))
    database_url: str = os.environ.get("TRACKER_DATABASE_URL", "")
    # New session when the gap between two games exceeds this.
    session_gap_hours: float = float(os.environ.get("TRACKER_SESSION_GAP_HOURS", "3"))
    sync_enabled: bool = os.environ.get("TRACKER_SYNC_ENABLED", "1") == "1"
    sync_interval_minutes: float = float(os.environ.get("TRACKER_SYNC_INTERVAL_MINUTES", "15"))
    # How many history pages (100 games each) to scan per member on a sync.
    max_pages: int = int(os.environ.get("TRACKER_MAX_PAGES", "1"))
    # Required for mutating endpoints (POST /api/sync); unset disables them.
    admin_token: str = os.environ.get("TRACKER_ADMIN_TOKEN", "")
    # Built frontend (frontend/dist) to serve at /; unset = API only.
    static_dir: str = os.environ.get("TRACKER_STATIC_DIR", "")
    cors_origins: tuple[str, ...] = tuple(
        o for o in os.environ.get("TRACKER_CORS_ORIGINS", "http://localhost:5173").split(",") if o
    )

    @property
    def db_url(self) -> str:
        return self.database_url or f"sqlite:///{self.data_dir / 'tracker.db'}"

    @property
    def replay_dir(self) -> Path:
        return self.data_dir / "replays"


settings = Settings()
