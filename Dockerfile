# One image: built SPA served by the FastAPI backend (which also runs the sync loop).

# --- frontend build ---
FROM node:24-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- backend ---
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.18 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1

WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
RUN uv sync --frozen --no-dev

COPY --from=web /app/frontend/dist /app/frontend/dist

# Data (SQLite + replay zips) lives on a mounted volume.
ENV TRACKER_DATA_DIR=/data \
    TRACKER_STATIC_DIR=/app/frontend/dist \
    TRACKER_CORS_ORIGINS=""
EXPOSE 8080
CMD ["/app/backend/.venv/bin/uvicorn", "tracker.main:create_app", "--factory", \
     "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
