import sys, re, io
import mgz.fast.header as H
f = open(sys.argv[1], 'rb')
hdr = H.decompress(f)
start = hdr.tell()
raw = hdr.read(); hdr.seek(start)
version, game, save, log = H.parse_version(hdr, f)
print("version", version, "game", game, "save", save, "log", log)
base = hdr.tell()
calls = []
orig = H.de_string
def traced(d):
    pos = d.tell()
    peek = d.getvalue()[pos:pos+2] if hasattr(d,'getvalue') else None
    calls.append((pos, peek))
    return orig(d)
H.de_string = traced
try:
    H.parse_de(hdr, version, save)
except AssertionError:
    pass
for c in calls[-12:]: print("de_string at", c)
buf = hdr.getvalue()
marks = [m.start() for m in re.finditer(b'\x60\x0a', buf[calls[-1][0]-200: calls[-1][0]+400])]
print("markers rel to fail pos:", [m-200 for m in marks])
for name in [b'Cribbeltz', b'Maverick', b'Sundown', b'johnnynagel']:
    print(name, [m.start() for m in re.finditer(name, buf)][:4])
fp = calls[-1][0]
print(buf[fp-120:fp+200].hex(' ', 4))
