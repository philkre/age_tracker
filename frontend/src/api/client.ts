import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { components } from "./schema";

export type SessionSummary = components["schemas"]["SessionSummary"];
export type SessionDetail = components["schemas"]["SessionDetail"];
export type SessionPage = components["schemas"]["SessionPage"];
export type MemberSummary = components["schemas"]["MemberSummary"];
export type Game = components["schemas"]["GameOut"];
export type GamePlayer = components["schemas"]["GamePlayerOut"];

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

const PAGE_SIZE = 10;

export const sessionsQuery = infiniteQueryOptions({
  queryKey: ["sessions"],
  queryFn: ({ pageParam }) => get<SessionPage>(`/sessions?limit=${PAGE_SIZE}&offset=${pageParam}`),
  initialPageParam: 0,
  getNextPageParam: (last) => {
    const next = last.offset + last.limit;
    return next < last.total ? next : undefined;
  },
  // New games land via the backend sync loop; keep the feed fresh.
  refetchInterval: 60_000,
});

export type GameMap = components["schemas"]["GameMapOut"];

export const gameMapQuery = (matchId: number) =>
  queryOptions({
    queryKey: ["game-map", matchId],
    queryFn: () => get<GameMap>(`/games/${matchId}/map`),
    staleTime: Infinity, // replay data never changes
  });

export const gameQuery = (matchId: number) =>
  queryOptions({
    queryKey: ["game", matchId],
    queryFn: () => get<Game>(`/games/${matchId}`),
  });

export const sessionQuery = (id: number) =>
  queryOptions({
    queryKey: ["session", id],
    queryFn: () => get<SessionDetail>(`/sessions/${id}`),
    refetchInterval: 60_000,
  });

export type Challenge = components["schemas"]["ChallengeOut"];
export type ChallengeCiv = components["schemas"]["ChallengeCiv"];

export const challengeQuery = queryOptions({
  queryKey: ["challenge"],
  queryFn: () => get<Challenge | null>("/challenge"),
  // Live during a challenge (backend syncs every ~90s then).
  refetchInterval: (q) => (q.state.data?.active ? 30_000 : false),
});

export type ChallengeSummary = components["schemas"]["ChallengeSummary"];
export type SessionChallenge = components["schemas"]["SessionChallenge"];

export const challengesQuery = queryOptions({
  queryKey: ["challenges"],
  queryFn: () => get<ChallengeSummary[]>("/challenges"),
});

export const challengeByIdQuery = (id: number) =>
  queryOptions({
    queryKey: ["challenge", id],
    queryFn: () => get<Challenge>(`/challenges/${id}`),
    refetchInterval: (q) => (q.state.data?.active ? 30_000 : false),
  });

/** POST JSON to the API. Throws ApiError with the server's detail message. */
export function post<T>(path: string, body?: unknown): Promise<T> {
  return send<T>("POST", path, body);
}

/** DELETE on the API (204 -> undefined). */
export function del(path: string): Promise<void> {
  return send<void>("DELETE", path);
}

async function send<T>(method: "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().then((j) => j.detail as string, () => res.statusText);
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
