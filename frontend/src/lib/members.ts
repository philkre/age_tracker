/** Fixed identity colours so each of us looks the same on every page and chart. */
export const MEMBERS = [
  { name: "Cribbeltz", profileId: 252396, color: "#5aa9e6" },
  { name: "Maverick", profileId: 1308804, color: "#e5675a" },
  { name: "Sundown", profileId: 2645968, color: "#e0a43a" },
  { name: "johannesnagel", profileId: 249543, color: "#6cc68a" },
] as const;

const byId = new Map<number, (typeof MEMBERS)[number]>(MEMBERS.map((m) => [m.profileId, m]));

export const memberColor = (profileId: number) => byId.get(profileId)?.color ?? "#8a8174";
export const memberName = (profileId: number) => byId.get(profileId)?.name;
