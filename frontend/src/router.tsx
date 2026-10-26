import { createRootRoute, createRoute, createRouter, Link, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Spinner } from "./components/ui";
import { Feed } from "./pages/Feed";

// Session page pulls in ECharts; keep it out of the feed bundle.
const SessionPage = lazy(() => import("./pages/Session").then((m) => ({ default: m.SessionPage })));
const GamePage = lazy(() => import("./pages/Game").then((m) => ({ default: m.GamePage })));
const ChallengePage = lazy(() => import("./pages/Challenge").then((m) => ({ default: m.ChallengePage })));
const ChallengeDetailPage = lazy(() =>
  import("./pages/Challenge").then((m) => ({ default: m.ChallengeDetailPage })),
);
const ChallengeHistoryPage = lazy(() =>
  import("./pages/Challenge").then((m) => ({ default: m.ChallengeHistoryPage })),
);

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/75 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            <span className="text-[15px] font-semibold tracking-tight">
              TopGun <span className="font-normal text-muted">Training</span>
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
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

const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/games/$matchId",
  component: function GameRoute() {
    const { matchId } = gameRoute.useParams();
    return (
      <Suspense fallback={<Spinner />}>
        <GamePage matchId={Number(matchId)} />
      </Suspense>
    );
  },
});

const challengeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/challenge",
  component: () => (
    <Suspense fallback={<Spinner />}>
      <ChallengePage />
    </Suspense>
  ),
});

const challengeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/challenge/$challengeId",
  component: function ChallengeDetailRoute() {
    const { challengeId } = challengeDetailRoute.useParams();
    return (
      <Suspense fallback={<Spinner />}>
        <ChallengeDetailPage id={Number(challengeId)} />
      </Suspense>
    );
  },
});

const challengesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/challenges",
  component: () => (
    <Suspense fallback={<Spinner />}>
      <ChallengeHistoryPage />
    </Suspense>
  ),
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    feedRoute,
    sessionRoute,
    gameRoute,
    challengeRoute,
    challengeDetailRoute,
    challengesRoute,
  ]),
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
