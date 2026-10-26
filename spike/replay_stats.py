import sys, collections
from mgz.model import parse_match
m = parse_match(open(sys.argv[1], 'rb'))
print("pov/timestamp", m.timestamp, "dur", m.duration)
up = collections.defaultdict(dict)
for u in m.uptimes: up[u.player][u.age] = str(u.timestamp)[:7]
for p in m.players:
    acts = [a for a in m.actions if a.player is p]
    q = collections.Counter(); r=[]; b=collections.Counter()
    for a in acts:
        t=a.type.name; pl=a.payload
        if t=='DE_QUEUE': q[pl.get('unit')]+=pl.get('amount',1)
        elif t=='RESEARCH': r.append(pl.get('technology'))
        elif t=='BUILD': b[pl.get('building')]+=1
    ts = p.timeseries
    print(f"\n{p.name} [{p.civilization}] win={p.winner} eapm={p.eapm} up={up.get(p.number)} ts_points={len(ts)} last_ts={ts[-1] if ts else None}")
    print("  queued:", q.most_common(6)); print("  built:", b.most_common(6)); print("  research:", r[:10])
print("\nresign:", [(str(a.timestamp)[:7], a.player.name) for a in m.actions if a.type.name=='RESIGN'])
print("chat:", [(str(c.timestamp)[:7], c.player.name if c.player else None, c.message[:40]) for c in m.chat][:5])
