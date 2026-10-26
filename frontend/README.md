# Frontend

Vite + React + TypeScript, TanStack Router/Query, Tailwind 4, ECharts.

```
npm install
npm run dev        # :5173, proxies /api -> backend on :8000
npm run build      # -> dist/, serve via backend with TRACKER_STATIC_DIR=../frontend/dist
npm run gen:api    # regenerate src/api/schema.d.ts after backend schema changes
```

TypeScript is pinned to 5.9: openapi-typescript needs the JS compiler API, which TS 7 dropped.
