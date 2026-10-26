import { Link } from "@tanstack/react-router";
import type { SessionChallenge } from "../api/client";
import { MEMBERS } from "../lib/members";
import { Civ, MemberDot } from "./ui";

/** Small pill: this session was part of a civ challenge, and how many civs it ticked off. */
export function ChallengeBadge({ c, className = "" }: { c: SessionChallenge; className?: string }) {
  const n = c.new_civs.length;
  return (
    <Link
      to="/challenge/$challengeId"
      params={{ challengeId: String(c.id) }}
      title={n ? `New civs: ${c.new_civs.map((x) => x.name).join(", ")}` : "No new civs this session"}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-0.5 text-xs font-medium text-accent hover:bg-accent/20 ${className}`}
    >
      <span aria-hidden>⚔</span>
      <span className="truncate">{c.name}</span>
      <span className="tabular shrink-0 opacity-80">· {n ? `+${n} civ${n === 1 ? "" : "s"}` : "no new civs"}</span>
    </Link>
  );
}

/** Session page section: the civs this session ticked off, grouped by who picked them. */
export function ChallengeCivsSection({ c }: { c: SessionChallenge }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          Civ challenge <span className="font-normal text-muted">· {c.name}</span>
        </h2>
        <Link
          to="/challenge/$challengeId"
          params={{ challengeId: String(c.id) }}
          className="text-sm text-muted hover:text-ink"
        >
          Full board →
        </Link>
      </div>
      {c.new_civs.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No new civs ticked off this session.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            {c.new_civs.length} new civ{c.new_civs.length === 1 ? "" : "s"} ticked off this session.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {MEMBERS.map((m) => {
              const mine = c.new_civs.filter((x) => x.profile_id === m.profileId);
              if (!mine.length) return null;
              return (
                <div key={m.profileId} className="min-w-0">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
                    <MemberDot color={m.color} />
                    {m.name} <span className="text-faint">· {mine.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {mine.map((x) => (
                      <span key={x.civ} className="flex items-center gap-1.5 rounded-md bg-surface-2 py-1 pr-2 pl-1 text-xs">
                        <Civ civ={x.civ} name={x.name} size={20} />
                        {x.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
