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

export const sessionQuery = (id: number) =>
  queryOptions({
    queryKey: ["session", id],
    queryFn: () => get<SessionDetail>(`/sessions/${id}`),
    refetchInterval: 60_000,
  });
