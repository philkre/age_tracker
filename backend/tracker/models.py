from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from tracker.db import Base


class ReplayStatus(StrEnum):
    PENDING = "pending"
    PARSED = "parsed"
    UNAVAILABLE = "unavailable"  # download 404 (expired or never recorded)
    FAILED = "failed"  # downloaded but parser choked; retry after mgz update


class TrainingSession(Base):
    """One training night (the Strava "activity")."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[datetime] = mapped_column(DateTime)

    games: Mapped[list["Game"]] = relationship(back_populates="session", order_by="Game.started_at")


class Game(Base):
    __tablename__ = "games"

    match_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("sessions.id", ondelete="SET NULL"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    leaderboard: Mapped[str] = mapped_column(String(32))
    map_slug: Mapped[str] = mapped_column(String(64))
    map_name: Mapped[str] = mapped_column(String(128))
    map_size: Mapped[int | None] = mapped_column(Integer)
    patch: Mapped[int | None] = mapped_column(Integer)
    server: Mapped[str | None] = mapped_column(String(32))
    speed_factor: Mapped[float | None] = mapped_column(Float)
    our_team: Mapped[int] = mapped_column(Integer)
    won: Mapped[bool | None] = mapped_column(Boolean)
    raw: Mapped[dict] = mapped_column(JSON)

    replay_status: Mapped[str] = mapped_column(String(16), default=ReplayStatus.PENDING, index=True)
    replay_path: Mapped[str | None] = mapped_column(String(512))
    replay_error: Mapped[str | None] = mapped_column(Text)
    replay_attempts: Mapped[int] = mapped_column(Integer, default=0)
    # In-game duration from the replay (game seconds, divide by speed_factor for real time).
    duration_game_s: Mapped[float | None] = mapped_column(Float)

    session: Mapped[TrainingSession | None] = relationship(back_populates="games")
    map_data: Mapped["GameMap | None"] = relationship(cascade="all, delete-orphan", uselist=False)
    players: Mapped[list["GamePlayer"]] = relationship(
        back_populates="game", cascade="all, delete-orphan", order_by="GamePlayer.slot"
    )

    @property
    def duration_real_s(self) -> float | None:
        if self.finished_at is None:
            return None
        return (self.finished_at - self.started_at).total_seconds()


class GamePlayer(Base):
    """One of the 8 players in a game (us and opponents)."""

    __tablename__ = "game_players"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("games.match_id", ondelete="CASCADE"), index=True)
    profile_id: Mapped[int] = mapped_column(BigInteger, index=True)
    is_member: Mapped[bool] = mapped_column(Boolean, default=False)
    name: Mapped[str] = mapped_column(String(128))
    civ: Mapped[str] = mapped_column(String(64))
    civ_name: Mapped[str] = mapped_column(String(64))
    team: Mapped[int] = mapped_column(Integer)
    slot: Mapped[int | None] = mapped_column(Integer)
    color: Mapped[int | None] = mapped_column(Integer)
    rating: Mapped[int | None] = mapped_column(Integer)  # before the game
    rating_diff: Mapped[int | None] = mapped_column(Integer)
    won: Mapped[bool | None] = mapped_column(Boolean)

    # Replay-derived (game time seconds). Null until parsed.
    eapm: Mapped[int | None] = mapped_column(Integer)
    feudal_s: Mapped[float | None] = mapped_column(Float)
    castle_s: Mapped[float | None] = mapped_column(Float)
    imperial_s: Mapped[float | None] = mapped_column(Float)
    resign_s: Mapped[float | None] = mapped_column(Float)
    first_military_s: Mapped[float | None] = mapped_column(Float)
    villagers_queued: Mapped[int | None] = mapped_column(Integer)
    military_queued: Mapped[int | None] = mapped_column(Integer)
    town_centers_built: Mapped[int | None] = mapped_column(Integer)
    techs_researched: Mapped[int | None] = mapped_column(Integer)
    # Full breakdowns: units/buildings/techs/timeseries/action counts.
    replay_stats: Mapped[dict | None] = mapped_column(JSON)

    game: Mapped[Game] = relationship(back_populates="players")

    @property
    def rating_after(self) -> int | None:
        if self.rating is None or self.rating_diff is None:
            return None
        return self.rating + self.rating_diff


class GameMap(Base):
    """Replay minimap + positioned commands (heatmap data). Separate table: big and only read on demand."""

    __tablename__ = "game_maps"

    match_id: Mapped[int] = mapped_column(ForeignKey("games.match_id", ondelete="CASCADE"), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)


class Challenge(Base):
    """Civ challenge: play every ranked civ once as a team. Games are matched by time, not stored here."""

    __tablename__ = "challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    started_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime)  # ended by hand
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)  # all civs played

