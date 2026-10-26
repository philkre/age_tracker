import { createRootRoute, createRoute, createRouter, Link, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Spinner } from "./components/ui";
import { Feed } from "./pages/Feed";

// Session page pulls in ECharts; keep it out of the feed bundle.
const SessionPage = lazy(() => import("./pages/Session").then((m) => ({ default: m.SessionPage })));

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="font-display text-lg font-bold tracking-wide">
              TopGun <span className="text-gold">Training</span>
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  ),
  notFoundComponent: () => <p className="py-16 text-center text-muted">Page not found.</p>,
});

const feedRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Feed });

const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sessions/$sessionId",
  component: function SessionRoute() {
    const { sessionId } = sessionRoute.useParams();
    return (
      <Suspense fallback={<Spinner />}>
        <SessionPage sessionId={Number(sessionId)} />
      </Suspense>
    );
  },
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([feedRoute, sessionRoute]),
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
