"""Website-facing behaviour: CORS, admin token, site password, SPA serving."""

import pytest
from fastapi.testclient import TestClient

from tracker.config import Settings
from tracker.db import init_db, make_engine, make_sessionmaker
from tracker.main import create_app


def make_client(tmp_path, **kw):
    # File DB: in-memory SQLite is per-connection, and the test client queries from another thread.
    engine = make_engine(f"sqlite:///{tmp_path / 'web.db'}")
    init_db(engine)
    settings = Settings(data_dir=tmp_path, sync_enabled=False, **kw)
    return TestClient(create_app(settings, make_sessionmaker(engine)))


def test_cors_allows_dev_frontend(tmp_path):
    client = make_client(tmp_path, cors_origins=("http://localhost:5173",))
    r = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    r = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_sync_disabled_without_token(tmp_path):
    client = make_client(tmp_path)
    assert client.post("/api/sync").status_code == 403


@pytest.mark.parametrize("header,status", [(None, 401), ("Bearer wrong", 401), ("Bearer s3cret", 202)])
def test_sync_requires_token(tmp_path, monkeypatch, header, status):
    monkeypatch.setattr("tracker.main.run_sync", lambda *a, **k: None)
    client = make_client(tmp_path, admin_token="s3cret")
    headers = {"Authorization": header} if header else {}
    assert client.post("/api/sync", headers=headers).status_code == status


def test_serves_spa_with_fallback(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<div id=app></div>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("nope")
    client = make_client(tmp_path, static_dir=str(dist))

    assert client.get("/").text == "<div id=app></div>"
    assert client.get("/assets/app.js").text == "console.log(1)"
    assert client.get("/sessions/12").text == "<div id=app></div>"  # client route
    assert "nope" not in client.get("/../secret.txt").text
    assert client.get("/api/health").json() == {"ok": True}
    assert client.get("/api/nope").status_code == 404  # unknown API path is not the SPA


def test_site_password_protects_everything_but_health(tmp_path):
    import base64

    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<div id=app></div>")
    client = make_client(tmp_path, site_password="hunter2", static_dir=str(dist))

    assert client.get("/api/health").status_code == 200  # Fly health checks
    for path in ("/", "/sessions/1", "/api/sessions", "/api/challenge"):
        r = client.get(path)
        assert r.status_code == 401, path
        assert r.headers["www-authenticate"].startswith("Basic")
    assert client.post("/api/challenge", json={}).status_code == 401

    def auth(user, pw):
        return {"Authorization": "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode()}

    assert client.get("/", headers=auth("anyone", "wrong")).status_code == 401
    assert client.get("/", headers=auth("anyone", "hunter2")).text == "<div id=app></div>"
    assert client.get("/api/sessions", headers=auth("maverick", "hunter2")).status_code == 200


def test_site_password_leaves_icons_open(tmp_path):
    # Safari favourites and home-screen installs fetch these without credentials.
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<div id=app></div>")
    icons = ("favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "site.webmanifest")
    for name in icons:
        (dist / name).write_bytes(b"icon")
    client = make_client(tmp_path, site_password="hunter2", static_dir=str(dist))

    for name in icons:
        assert client.get(f"/{name}").status_code == 200, name
    assert client.get("/app-icon.svg").status_code == 401


def test_no_site_password_means_open(tmp_path):
    client = make_client(tmp_path)
    assert client.get("/api/sessions").status_code == 200
