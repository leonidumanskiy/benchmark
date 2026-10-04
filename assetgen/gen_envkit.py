# Environment kit "Outpost": modular pieces the runtime instances onto the gameplay layout (collision unchanged).
# Every piece is authored at a canonical size (documented per piece) and scaled/tiled to obstacle footprints.
# Lamp sockets are child empties with a `lamp` custom property (red|cyan|amber) -> runtime practical lights.
#   blender -b -P assetgen/gen_envkit.py -- --spec assetgen/specs/envkit.json --out public/assets/gen/envkit.glb
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blib import *  # noqa

A = cli_args()
spec = load_spec(A['spec'])
reset_scene()
PIECES = []
ONLY = set(A['only'].split(',')) if 'only' in A else None


def piece(name):
    p = Part(name)
    PIECES.append(p)
    return p


def rnd(seed):
    return random.Random(seed)


# ------------------------------------------------------------------------------------------------ shared bits
def ibeam(h, w=0.16, d=0.14, t=0.025):
    """Vertical I-beam (along Y), flanges facing +-Z."""
    out = Part('tmp')
    out.add(box(w, h, t, 0.004, 1), 'x', (0, 0, d / 2 - t / 2))
    out.add(box(w, h, t, 0.004, 1), 'x', (0, 0, -d / 2 + t / 2))
    out.add(box(t, h, d - 2 * t, 0.003, 1), 'x', (0, 0, 0))
    return out.bm


def bolts(p, slot, pts, r=0.014, axis='z'):
    rot = (math.pi / 2, 0, 0) if axis == 'z' else (0, 0, math.pi / 2) if axis == 'x' else (0, 0, 0)
    for q in pts:
        p.add(cyl(r, r, 0.012, 6, 0.003), slot, q, rot)


def hazard_band(p, length, height, pos, rot=(0, 0, 0), stripe=0.16, depth=0.012):
    """Diagonal black/yellow stripes across a band of given length (along X) and height (Y)."""
    n = int(length / stripe) + 2
    for i in range(n):
        x0 = -length / 2 + i * stripe
        pts = [(x0, -height / 2), (x0 + stripe * 0.5, -height / 2), (x0 + stripe * 0.5 + height * 0.6, height / 2), (x0 + height * 0.6, height / 2)]
        pts = [(max(-length / 2, min(length / 2, x)), y) for x, y in pts]
        if abs(pts[1][0] - pts[0][0]) < 1e-3 and abs(pts[2][0] - pts[3][0]) < 1e-3:
            continue
        try:
            pr = prism(pts, depth, 0.0, 1)
        except Exception:
            continue
        T = M(pos, rot)
        p.add(pr, 'hazard' if i % 2 == 0 else 'hazardDark', mat=T)


def jagged_profile(r, x0, x1, base_top, amp, n=9):
    pts = []
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        y = base_top - amp * r.random() * (0.4 + 0.6 * abs(math.sin(i * 1.7)))
        pts.append((x, y))
    return pts


# ================================================================================================ walls
# wall_* : 1.0 m long (X), 0.8 m deep (Z), 2.5 m nominal height (Y); runtime scales X to tile and Y to obstacle height.
WALL_H = 2.5


def wall_module(name, top_l, top_r, seed, broken=0.0):
    p = piece(name)
    r = rnd(seed)
    # concrete plinth (chamfered top edge)
    p.add(prism([(-0.5, 0), (0.5, 0), (0.5, 0.55), (0.46, 0.62), (-0.46, 0.62), (-0.5, 0.55)], 0.8, 0.012, 2), 'concrete', (0, 0, 0))
    for zz in (-1, 1):
        for k in range(3):  # cast-in panel seams
            p.add(box(0.012, 0.5, 0.01, 0.0), 'concreteDark', (-0.5 + 0.33 * (k + 0.5), 0.3, zz * 0.401))
    # steel panel wall above the plinth with a jagged (damaged) top
    prof = [(-0.5, 0.6), (0.5, 0.6)]
    jag = jagged_profile(r, 0.5, -0.5, 0, 0, 10)
    tops = []
    for i, (x, _) in enumerate(jag):
        t = (x + 0.5)
        y = top_l + (top_r - top_l) * t
        if broken > 0 and 0 < i < len(jag) - 1:
            y -= broken * r.random() * 0.45
        tops.append((x, max(0.75, y)))
    core = prism(prof + tops, 0.42, 0.01, 1)
    p.add(core, 'metalDark', (0, 0, 0))
    # outer cladding plates on both faces, each plate stops below the local top
    for zz in (-1, 1):
        for k in range(2):
            x0, x1 = -0.5 + k * 0.5 + 0.02, -0.5 + (k + 1) * 0.5 - 0.02
            ytop = min(tops[min(10, int((k * 0.5 + 0.02) * 10))][1], tops[min(10, int((k + 1) * 0.5 * 10 - 0.2))][1]) - 0.06
            if ytop < 0.9:
                continue
            hgt = ytop - 0.66
            bent = broken > 0.7 and k == 1
            slot = 'metal' if (k + seed) % 3 else 'rust'
            p.add(box(x1 - x0, hgt, 0.04, 0.01, 2), slot, ((x0 + x1) / 2, 0.66 + hgt / 2, zz * 0.24), (0.12 * zz if bent else 0, 0, 0))
            # horizontal stiffeners and bolts
            for y in (0.78, 0.66 + hgt * 0.55):
                if y < ytop - 0.08:
                    p.add(box(x1 - x0 - 0.04, 0.035, 0.02, 0.006), 'metalDark', ((x0 + x1) / 2, y, zz * 0.272))
            bolts(p, 'trim', [(x0 + 0.04, 0.7, zz * 0.264), (x1 - 0.04, 0.7, zz * 0.264), (x0 + 0.04, ytop - 0.05, zz * 0.264), (x1 - 0.04, ytop - 0.05, zz * 0.264)])
    # vertical post at the module seam (left edge) + top cap where intact
    p.add(ibeam(min(tops[0][1], tops[-1][1]) + 0.05, 0.16, 0.56), 'trim', (-0.5, (min(tops[0][1], tops[-1][1]) + 0.05) / 2, 0))
    if broken == 0:
        p.add(box(1.02, 0.08, 0.6, 0.012), 'trim', (0, top_l + 0.04, 0))
        p.add(box(0.98, 0.03, 0.2, 0.006), 'hazardDark', (0, top_l + 0.095, 0))
    else:
        # exposed studs + rebar sticking out of the damage
        for i in range(4):
            x = -0.35 + i * 0.23
            ty = tops[min(10, int((x + 0.5) * 10))][1]
            p.add(cyl(0.01, 0.01, 0.3 + r.random() * 0.4, 5, 0), 'rebar', (x, ty + 0.12, (r.random() - 0.5) * 0.25), ((r.random() - 0.5) * 0.7, 0, (r.random() - 0.5) * 0.7))
    # rubble at the base
    for i in range(3 + int(broken * 4)):
        side = 1 if r.random() < 0.5 else -1
        rr = 0.05 + r.random() * (0.08 + broken * 0.1)
        p.add(rock(rr, seed * 31 + i, 1, 0.3), 'concrete' if r.random() < 0.6 else 'concreteDark', ((r.random() - 0.5) * 0.9, rr * 0.4, side * (0.45 + r.random() * 0.3)), (r.random(), r.random() * 6, 0))
    return p


wall_module('wall_A', WALL_H, WALL_H, 1, 0.0)
wall_module('wall_B', WALL_H * 0.95, WALL_H * 0.8, 2, 0.6)
wall_module('wall_C', WALL_H * 0.6, WALL_H * 0.45, 3, 1.0)
wall_module('wall_D', WALL_H * 0.82, WALL_H * 0.95, 4, 0.5)

# wall_post: heavy column with lamp housings on both faces (red), 2.5 m nominal
wp = piece('wall_post')
wp.add(box(0.42, 2.7, 0.95, 0.02, 2), 'metalDark', (0, 1.35, 0))
wp.add(box(0.48, 0.12, 1.02, 0.015), 'trim', (0, 2.72, 0))
wp.add(box(0.5, 0.5, 1.02, 0.02), 'concrete', (0, 0.25, 0))
for zz in (-1, 1):
    wp.add(box(0.3, 2.0, 0.03, 0.006), 'rust', (0, 1.45, zz * 0.49))
    wp.add(box(0.2, 0.12, 0.1, 0.02), 'trim', (0, 2.0, zz * 0.53))
    wp.add(box(0.15, 0.06, 0.02, 0.008), 'lampRed', (0, 2.0, zz * 0.585))
    hazard_band(wp, 0.3, 0.22, (0, 0.62, zz * 0.505))
    wp.socket('lamp_red_%d' % (zz + 1), (0, 2.0, zz * 0.75), lamp='red')
    # cable conduit
    wp.add(cyl(0.025, 0.025, 2.1, 8, 0.0), 'cable', (0.12, 1.35, zz * 0.51))

# ================================================================================================ sci-fi cover
# cover_mid: 1.0 m segment (X), 0.9 m deep (Z), 1.15 m high. cover_end: 0.2 m thick end cap.
COV_H, COV_D = 1.15, 0.9
cm = piece('cover_mid')
pd, top = COV_D / 2, COV_H - 0.08
cm.add(box(1.0, 0.1, COV_D + 0.1, 0.015), 'trim', (0, 0.05, 0))
body = prism([(-pd, 0.1), (pd, 0.1), (pd * 0.97, top * 0.55), (pd * 0.6, top), (-pd * 0.6, top), (-pd * 0.97, top * 0.55)], 0.98, 0.02, 2)
deform(body, lambda v: Vector((v.z, v.y, v.x)))
cm.add(body, 'metal')
cm.add(box(1.0, 0.06, pd * 1.15, 0.012), 'metalDark', (0, top + 0.02, 0))
cm.add(box(0.96, 0.025, 0.08, 0.006), 'trim', (0, top + 0.06, 0))
for zz in (-1, 1):
    # armour plates with inset centre and bolts
    for k, (x0, x1) in enumerate(((-0.47, -0.02), (0.02, 0.47))):
        cm.add(box(x1 - x0, top * 0.38, 0.05, 0.012, 2), 'rust' if k == 1 else 'metalDark', ((x0 + x1) / 2, top * 0.3, zz * (pd + 0.0)))
        cm.add(box(x1 - x0 - 0.1, top * 0.22, 0.02, 0.006), 'metal', ((x0 + x1) / 2, top * 0.3, zz * (pd + 0.03)))
        bolts(cm, 'trim', [(x0 + 0.04, top * 0.14, zz * (pd + 0.03)), (x1 - 0.04, top * 0.14, zz * (pd + 0.03)), (x0 + 0.04, top * 0.46, zz * (pd + 0.03)), (x1 - 0.04, top * 0.46, zz * (pd + 0.03))])
    # sloped upper face: vent louvres + light strip
    tilt = math.atan2(pd * 0.37, top * 0.45)
    yc, zc = top * 0.775, zz * pd * 0.8
    for k in range(5):
        cm.add(box(0.36, 0.022, 0.05, 0.004), 'trim', (-0.25, yc - 0.12 + k * 0.05, zc + zz * 0.012), (zz * tilt, 0, 0))
    cm.add(box(0.9, 0.022, 0.02, 0.004), 'lampCyan', (0, top * 0.6, zz * pd * 0.955), (zz * tilt, 0, 0))
    cm.add(box(0.26, 0.15, 0.04, 0.01), 'trim', (0.25, yc, zc), (zz * tilt, 0, 0))
    cm.add(box(0.2, 0.1, 0.02, 0.004), 'screen', (0.25, yc, zc + zz * 0.02), (zz * tilt, 0, 0))
    cm.socket('lamp_cyan_%d' % (zz + 1), (0, top * 0.6, zz * (pd + 0.2)), lamp='cyan')
ce = piece('cover_end')
ce.add(box(0.2, COV_H + 0.06, COV_D + 0.16, 0.025, 2), 'metalDark', (0, (COV_H + 0.06) / 2, 0))
for zz in (-1, 1):
    hazard_band(ce, COV_D * 0.9, 0.5, (0.104, 0.55, 0), (0, math.pi / 2, 0)) if zz > 0 else hazard_band(ce, COV_D * 0.9, 0.5, (-0.104, 0.55, 0), (0, -math.pi / 2, 0))
ce.add(cyl(0.05, 0.05, 0.12, 12, 0.008), 'trim', (0, COV_H + 0.1, 0))
ce.add(sphere(0.035, 10, 8), 'lampAmber', (0, COV_H + 0.17, 0))

# ================================================================================================ spawn lair barricade
# lair_mid: 1.0 m (X), 1.0 m deep, 1.4 m high, barbed; lair_end: post with red beacon.
lm = piece('lair_mid')
lm.add(box(1.0, 0.15, 1.2, 0.02), 'trim', (0, 0.075, 0))
lm.add(box(0.98, 1.2, 0.7, 0.03, 2, taper=(1.0, 0.85)), 'rust', (0, 0.75, 0))
for zz in (-1, 1):
    lm.add(ibeam(1.3, 0.14, 0.12), 'trim', (0.45, 0.72, zz * 0.38))
    hazard_band(lm, 0.98, 0.16, (0, 1.2, zz * 0.355), (zz * 0.07, 0, 0))
    for k in range(3):
        lm.add(box(0.28, 0.5, 0.03, 0.008), 'metalDark', (-0.33 + k * 0.33, 0.55, zz * 0.36), (zz * 0.07, 0, 0))
for i in range(5):
    lm.add(horn(0.32, 0.03, 0.04, 6, 5), 'rebar', (-0.4 + i * 0.2, 1.33, (i % 2 - 0.5) * 0.18), ((i % 2 - 0.5) * 0.7, 0, (i % 3 - 1) * 0.3))
lm.add(tube([(-0.5 + 0.05 * k, 1.38 + 0.04 * math.sin(k * 2.1), 0.1 * math.cos(k * 1.3)) for k in range(21)], 0.008, 4), 'rebar')
le = piece('lair_end')
le.add(box(0.3, 1.9, 0.3, 0.02, 2), 'metalDark', (0, 0.95, 0))
le.add(cyl(0.1, 0.12, 0.14, 14, 0.01), 'trim', (0, 1.97, 0))
le.add(sphere(0.09, 14, 10), 'lampRed', (0, 2.1, 0))
le.add(torus(0.1, 0.012, 16, 5), 'trim', (0, 2.1, 0))
hazard_band(le, 0.3, 0.4, (0, 0.5, 0.152))
hazard_band(le, 0.3, 0.4, (0, 0.5, -0.152), (0, math.pi, 0))
le.socket('lamp_red', (0, 2.25, 0), lamp='red')

# ================================================================================================ crates (1 m cube)
for name, seed, slot in (('crate_A', 5, 'metal'), ('crate_B', 6, 'rust')):
    c = piece(name)
    c.add(box(0.94, 0.94, 0.94, 0.02, 2), slot, (0, 0.5, 0))
    e = 0.07
    for x in (-1, 1):
        for z in (-1, 1):
            c.add(box(e, 1.0, e, 0.012), 'trim', (x * (0.5 - e / 2), 0.5, z * (0.5 - e / 2)))
    for y in (e / 2, 1 - e / 2):
        for z in (-1, 1):
            c.add(box(1.0, e, e, 0.012), 'trim', (0, y, z * (0.5 - e / 2)))
        for x in (-1, 1):
            c.add(box(e, e, 1.0, 0.012), 'trim', (x * (0.5 - e / 2), y, 0))
    for zz in (-1, 1):
        c.add(box(0.7, 0.7, 0.02, 0.008), 'metalDark', (0, 0.5, zz * 0.475))
        hazard_band(c, 0.8, 0.08, (0, 0.2, zz * 0.48), (0, 0 if zz > 0 else math.pi, 0))
        c.add(box(0.08, 0.12, 0.04, 0.01), 'trim', (0.3, 0.72, zz * 0.49))
    c.add(box(0.22, 0.07, 0.01, 0.003), 'lampAmber', (-0.2, 0.78, 0.49))
    c.add(box(0.5, 0.05, 0.5, 0.015), 'metalDark', (0, 1.0, 0))
    if seed == 6:
        c.add(text_mesh('07', 0.18, 0.003), 'decal', (0.0, 0.5, -0.487), (0, math.pi, 0))

# ================================================================================================ rocks (radius 1, height 1)
for i in range(4):
    p = piece('rock_%s' % 'ABCD'[i])
    p.add(rock(1.0, 40 + i, 4, 0.25, strata=1.0 if i % 2 else 0.4, sharp=0.75), 'rock', (0, 0.32, 0), scl=(1.0, 0.72, 1.0))
    r = rnd(70 + i)
    for k in range(3):  # satellite stones at the foot
        a = r.random() * TAU
        rr = 0.18 + r.random() * 0.2
        p.add(rock(rr, 90 + i * 7 + k, 2, 0.3), 'rockDark', (math.cos(a) * 0.95, rr * 0.35, math.sin(a) * 0.95), (r.random(), r.random() * 6, 0))
    p.add(shell(0.55, 0.12, 0.45, lat=(0, 1.2), thick=0, nu=14, nv=4, power=1.0), 'moss', (0.15, 0.58, -0.1), (0, 0, 0.18))
for i in range(3):
    p = piece('stone_%s' % 'ABC'[i])
    p.add(rock(0.5, 120 + i, 2, 0.3, strata=0.5), 'rock', (0, 0.15, 0), scl=(1, 0.6, 1))

# ================================================================================================ broken pillar (r 0.55, 3 m)
pl = piece('pillar')
r = rnd(9)
col = cyl(0.48, 0.55, 3.0, 20, 0.0, 1, cap=True)
col = subdivide(col, 0) if False else col
def flute(v):
    ang = math.atan2(v.z, v.x)
    f = 1 - 0.05 * max(0.0, math.cos(ang * 8))
    y = v.y
    if y > 1.49:
        y -= 0.15 + 0.45 * abs(math.sin(ang * 2.3 + 0.7))
    return Vector((v.x * f, y, v.z * f))
deform(col, flute)
pl.add(col, 'concrete', (0, 1.5, 0))
pl.add(box(1.3, 0.3, 1.3, 0.03, 2), 'concreteDark', (0, 0.15, 0))
pl.add(cyl(0.58, 0.58, 0.14, 24, 0.01), 'metalDark', (0, 1.05, 0))
pl.add(cyl(0.585, 0.585, 0.05, 24, 0.0), 'lampAmber', (0, 1.15, 0))
pl.add(cyl(0.58, 0.58, 0.06, 24, 0.008), 'metalDark', (0, 1.21, 0))
for k in range(6):
    pl.add(cyl(0.012, 0.012, 0.7, 5, 0), 'rebar', ((r.random() - 0.5) * 0.6, 2.9, (r.random() - 0.5) * 0.6), ((r.random() - 0.5) * 0.5, 0, (r.random() - 0.5) * 0.5))
pl.socket('lamp_amber', (0, 1.2, 0), lamp='amber')

# ================================================================================================ flora
def frond(length, width, curl, serr=0.0, n=10):
    def f(i, j):
        t = i / (n - 1)
        s = (j / 2.0) * 2 - 1  # -1..1
        w = math.sin(math.pi * min(1.0, t * 1.08)) * (1 - t * 0.35) * width
        if serr:
            w *= 1 - serr * (0.5 + 0.5 * math.sin(t * 40))
        x = s * w
        y = length * t * (1 - curl * 0.35 * t)
        z = curl * t * t * length + abs(s) * w * 0.35
        return Vector((x, y, z))
    bm = grid(f, n, 3)
    return bm


fr = piece('fern_red')
r = rnd(11)
for k in range(11):
    a = k / 11 * TAU + r.random() * 0.3
    L = 0.7 + r.random() * 0.35
    fr.add(frond(L, 0.13, 0.7, 0.55, 14), 'leafRed', (0, 0.02, 0), (0.55 + r.random() * 0.4, a, 0))
    fr.add(cyl(0.008, 0.012, L * 0.6, 4, 0), 'stalk', (0, 0.02, 0), (0.75, a, 0))
for k in range(4):
    fr.add(sphere(0.035 + 0.01 * k, 10, 8), 'bulbPink', ((k - 1.5) * 0.04, 0.1 + 0.03 * k, (k % 2) * 0.04))

bp = piece('bulb_plant')
r = rnd(12)
for k in range(6):
    a, rr, h = r.random() * TAU, r.random() * 0.18, 0.4 + r.random() * 0.55
    x, z = math.cos(a) * rr, math.sin(a) * rr
    tilt = (r.random() - 0.5) * 0.5
    bp.add(tube([(x, 0, z), (x + tilt * 0.1, h * 0.5, z), (x + tilt * 0.25, h, z + tilt * 0.1)], [0.016, 0.012, 0.008], 5), 'stalk')
    bp.add(sphere(0.045 + r.random() * 0.03, 12, 10, (1, 1.25, 1)), 'bulb', (x + tilt * 0.25, h + 0.03, z + tilt * 0.1))
for k in range(7):
    bp.add(frond(0.4, 0.1, 0.5, 0.0, 8), 'leafTeal', (0, 0.01, 0), (1.05, k * 0.9, 0))

sp = piece('spiky_dark')
r = rnd(13)
for k in range(16):
    a = r.random() * TAU
    L = 0.45 + r.random() * 0.45
    sp.add(horn(L, 0.045, 0.12, 6, 5, flat=0.35), 'leafDark', (0, 0.03, 0), (0.25 + r.random() * 0.7, a, 0))
for k in range(3):
    sp.add(sphere(0.03, 8, 6), 'bulbPink', ((r.random() - 0.5) * 0.15, 0.35 + r.random() * 0.2, (r.random() - 0.5) * 0.15))

rd = piece('reeds')
r = rnd(14)
for k in range(22):
    a, rr = r.random() * TAU, r.random() * 0.22
    L = 0.5 + r.random() * 0.6
    rd.add(horn(L, 0.012, 0.15 + r.random() * 0.2, 5, 4, flat=0.4), 'grass', (math.cos(a) * rr, 0, math.sin(a) * rr), ((r.random() - 0.5) * 0.4, r.random() * 6, (r.random() - 0.5) * 0.4))

sh = piece('shrooms')
r = rnd(15)
for k in range(6):
    a, rr = r.random() * TAU, r.random() * 0.22
    h, cr = 0.08 + r.random() * 0.22, 0.05 + r.random() * 0.08
    x, z = math.cos(a) * rr, math.sin(a) * rr
    sh.add(cyl(cr * 0.25, cr * 0.38, h, 8, 0), 'stalk', (x, h / 2, z))
    sh.add(lathe([(0, 0.0), (cr * 0.7, -0.01), (cr, -cr * 0.15), (cr * 0.85, cr * 0.25), (cr * 0.45, cr * 0.5), (0, cr * 0.55)], 16), 'shroomCap', (x, h, z))
    sh.add(lathe([(cr * 0.15, -0.012), (cr * 0.9, -0.012)], 16), 'bulb', (x, h - 0.005, z))

gt = piece('grass_tuft')
r = rnd(16)
for k in range(12):
    a = k / 12 * TAU
    gt.add(horn(0.22 + r.random() * 0.18, 0.012, 0.08, 3, 3, flat=0.3), 'grass', (math.cos(a) * 0.04, 0, math.sin(a) * 0.04), (0.35, -a + math.pi / 2, 0))

hv = piece('hive')  # flat alien growth mound with embedded glowing pustules and a few curling tendrils
r = rnd(17)
for k in range(7):
    a, rr = r.random() * TAU, r.random() * 0.8
    sz = 0.25 + r.random() * 0.3
    blob = sphere(sz, 18, 10, (1.0, 0.35, 0.8))
    displace(blob, lambda co, n: 0.04 * noise.noise(co * 7 + Vector((k, 0, 0))))
    hv.add(blob, 'hive', (math.cos(a) * rr, 0.0, math.sin(a) * rr), (0, r.random() * 6, 0))
for k in range(14):
    a, rr = r.random() * TAU, r.random() * 0.9
    hv.add(sphere(0.025 + r.random() * 0.035, 10, 8, (1, 0.7, 1)), 'hiveGlow', (math.cos(a) * rr, 0.06 + r.random() * 0.05, math.sin(a) * rr))
for k in range(4):
    a, rr = r.random() * TAU, 0.3 + r.random() * 0.5
    hv.add(horn(0.35 + r.random() * 0.3, 0.035, 0.2, 10, 6), 'hive', (math.cos(a) * rr, 0.05, math.sin(a) * rr), (0.45, r.random() * 6, 0))

# ================================================================================================ debris
dp = piece('debris_panel')
dp.add(box(0.8, 0.03, 0.5, 0.008), 'metalDark', (0, 0.05, 0), (0.12, 0, 0.08))
dp.add(box(0.45, 0.03, 0.5, 0.008), 'rust', (0.42, 0.16, 0.05), (0.0, 0.2, 0.55))
dp.add(box(0.12, 0.04, 0.42, 0.006), 'trim', (-0.2, 0.09, 0.0), (0.12, 0, 0.08))
dpp = piece('debris_pipe')
dpp.add(cyl(0.08, 0.08, 1.2, 14, 0.006), 'rust', (0, 0.08, 0), (0, 0, math.pi / 2))
for x in (-0.6, 0.6):
    dpp.add(cyl(0.12, 0.12, 0.04, 14, 0.006), 'trim', (x, 0.08, 0), (0, 0, math.pi / 2))
bar = piece('barrel')
bar.add(lathe([(0, 0), (0.26, 0), (0.28, 0.02), (0.28, 0.85), (0.26, 0.87), (0, 0.87)], 20), 'rust', (0, 0, 0))
for y in (0.28, 0.58):
    bar.add(torus(0.285, 0.015, 24, 5), 'metalDark', (0, y, 0))
hazard_band(bar, 0.4, 0.12, (0, 0.72, 0.281))
cab = piece('cables')
pts = [(math.cos(t * 0.5) * (0.25 - t * 0.008), 0.03 + 0.012 * math.sin(t * 3), math.sin(t * 0.5) * (0.25 - t * 0.008)) for t in range(0, 30)]
cab.add(tube(pts, 0.022, 6), 'cable')
cab.add(tube([(0.25, 0.03, 0), (0.5, 0.02, 0.2), (0.75, 0.03, 0.15)], 0.022, 6), 'cable')
rb = piece('rubble')
r = rnd(18)
for k in range(6):
    rr = 0.07 + r.random() * 0.13
    rb.add(rock(rr, 300 + k, 1, 0.3, sharp=0.9), 'concrete' if k % 2 else 'concreteDark', ((r.random() - 0.5) * 0.7, rr * 0.4, (r.random() - 0.5) * 0.7), (r.random(), r.random() * 6, 0))
for k in range(2):
    rb.add(cyl(0.01, 0.01, 0.5, 5, 0), 'rebar', ((r.random() - 0.5) * 0.4, 0.06, (r.random() - 0.5) * 0.4), (math.pi / 2 - 0.2, r.random() * 6, 0))
cs = piece('crate_small')
cs.add(box(0.5, 0.32, 0.36, 0.015, 2), 'metal', (0, 0.16, 0))
cs.add(box(0.52, 0.04, 0.38, 0.008), 'trim', (0, 0.3, 0))
cs.add(box(0.14, 0.05, 0.01, 0.003), 'screen', (0.1, 0.18, 0.182))
pud = piece('puddle')
r = rnd(19)
ring = [(math.cos(a) * (1 + 0.25 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, 0.5)))), math.sin(a) * (1 + 0.25 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, 0.5))))) for a in [k / 24 * TAU for k in range(24)]]
pb = bmesh.new()
vs = [pb.verts.new((x, 0.0, y)) for x, y in ring]
pb.faces.new(vs)
bmesh.ops.triangulate(pb, faces=pb.faces[:])
bmesh.ops.recalc_face_normals(pb, faces=pb.faces)
for f in pb.faces:
    if f.normal.y < 0:
        f.normal_flip()
pb.normal_update()
pud.add(pb, 'puddle', (0, 0.006, 0))


# ================================================================================================ clutter props
co = piece('console')  # 0.8 x 1.1 x 0.5 terminal
co.add(box(0.8, 0.75, 0.5, 0.02, 2), 'metalDark', (0, 0.375, 0))
co.add(box(0.78, 0.4, 0.06, 0.015, 2), 'metal', (0, 0.95, -0.12), (-0.45, 0, 0))
co.add(box(0.6, 0.28, 0.01, 0.004), 'screen', (0, 0.96, -0.08), (-0.45, 0, 0))
co.add(box(0.7, 0.04, 0.28, 0.01), 'trim', (0, 0.77, 0.08), (0.15, 0, 0))
for k in range(6):
    co.add(box(0.06, 0.015, 0.05, 0.004), 'lampAmber' if k % 3 == 0 else 'trim', (-0.25 + k * 0.1, 0.8, 0.12), (0.15, 0, 0))
hazard_band(co, 0.8, 0.08, (0, 0.08, 0.252))
co.add(tube([(0.3, 0.05, -0.25), (0.35, 0.02, -0.5), (0.6, 0.02, -0.7)], 0.025, 6), 'cable')
rl = piece('railing')  # 2 m railing (X)
for x in (-1.0, 0.0, 1.0):
    rl.add(cyl(0.025, 0.025, 1.0, 8, 0.004), 'metal', (x, 0.5, 0))
    rl.add(box(0.14, 0.03, 0.14, 0.008), 'trim', (x, 0.015, 0))
for y in (0.95, 0.5):
    rl.add(cyl(0.02, 0.02, 2.0, 8, 0.0), 'hazard' if y > 0.9 else 'metal', (0, y, 0), (0, 0, math.pi / 2))
vu = piece('vent_unit')  # 1.0 x 0.7 x 0.8 HVAC box with fan
vu.add(box(1.0, 0.7, 0.8, 0.02, 2), 'metal', (0, 0.35, 0))
vu.add(cyl(0.28, 0.28, 0.04, 24, 0.006), 'trim', (0, 0.72, 0))
for k in range(5):
    vu.add(box(0.5, 0.012, 0.06, 0.003), 'metalDark', (0, 0.745, 0), (0, k * math.pi / 5, 0.3))
for k in range(7):
    vu.add(box(0.012, 0.4, 0.02, 0.003), 'metalDark', (-0.36 + k * 0.12, 0.35, 0.405))
vu.add(box(0.12, 0.05, 0.01, 0.003), 'lampRed', (0.38, 0.6, 0.405))
lp = piece('lamp_post')  # 2.2 m work light
lp.add(box(0.4, 0.08, 0.4, 0.01), 'trim', (0, 0.04, 0))
lp.add(cyl(0.03, 0.04, 2.1, 8, 0.0), 'metalDark', (0, 1.1, 0))
lp.add(box(0.3, 0.12, 0.16, 0.02), 'metalDark', (0, 2.12, 0.08), (0.4, 0, 0))
lp.add(box(0.24, 0.02, 0.1, 0.004), 'lampAmber', (0, 2.07, 0.11), (0.4, 0, 0))
lp.add(tube([(0.03, 0.1, 0), (0.25, 0.02, 0.1), (0.6, 0.02, 0.0)], 0.018, 5), 'cable')
lp.socket('lamp_amber', (0, 1.95, 0.25), lamp='amber')
fc = piece('floor_cable')  # 3 m cable run on the floor
pts = [(-1.5 + 3.0 * t / 20, 0.025, 0.12 * math.sin(t * 0.7) + 0.05 * math.sin(t * 1.9)) for t in range(21)]
fc.add(tube(pts, 0.03, 6), 'cable')
fc.add(tube([(x, y, z + 0.08) for x, y, z in pts], 0.018, 5), 'rubber' if False else 'hazardDark')

# ================================================================================================ backdrop structures
blk = piece('bd_block')  # 1 x 1 x 1 unit block, runtime scales to (w, h, d)
blk.add(box(1.0, 1.0, 1.0, 0.01, 1), 'metalDark', (0, 0.5, 0))
blk.add(box(1.03, 0.05, 1.03, 0.006), 'trim', (0, 1.0, 0))
for zz in (-1, 1):
    for k in range(3):
        blk.add(box(0.22, 0.06, 0.012, 0.002), 'lampAmber', (-0.3 + k * 0.3, 0.6, zz * 0.505))
    for k in range(4):
        blk.add(box(0.012, 0.9, 0.02, 0.002), 'trim', (-0.375 + k * 0.25, 0.48, zz * 0.505))
    blk.add(box(0.98, 0.04, 0.02, 0.002), 'rust', (0, 0.3, zz * 0.505))
    blk.socket('lamp_amber_%d' % (zz + 1), (0, 0.6, zz * 0.62), lamp='amber')
for xx in (-1, 1):
    blk.add(box(0.012, 0.9, 0.98, 0.002), 'rust', (xx * 0.505, 0.5, 0))
blk.add(box(0.25, 0.12, 0.25, 0.01), 'trim', (0.2, 1.06, 0.15))
blk.add(box(0.2, 0.08, 0.3, 0.01), 'metal', (-0.25, 1.04, -0.2))
tk = piece('bd_tank')  # radius 1, height 2 nominal
tk.add(lathe([(0, 0), (1.0, 0), (1.0, 1.7), (0.92, 1.88), (0.6, 2.0), (0, 2.02)], 32), 'rust', (0, 0, 0))
for y in (0.4, 0.9, 1.4):
    tk.add(torus(1.01, 0.025, 40, 5), 'metalDark', (0, y, 0))
tk.add(cyl(0.18, 0.18, 0.2, 16, 0.01), 'trim', (0, 2.1, 0))
tk.add(sphere(0.07, 10, 8), 'lampRed', (0, 2.25, 0))
tk.socket('lamp_red', (0, 2.35, 0), lamp='red')
for k in range(10):  # ladder
    tk.add(cyl(0.008, 0.008, 0.16, 5, 0), 'trim', (0.0, 0.15 + k * 0.17, 1.06), (0, 0, math.pi / 2))
for x in (-0.08, 0.08):
    tk.add(cyl(0.01, 0.01, 1.8, 5, 0), 'trim', (x, 0.9, 1.06))
tw = piece('bd_tower')  # 1.2 m footprint, 8 m tall lattice mast
for x in (-1, 1):
    for z in (-1, 1):
        tw.add(cyl(0.035, 0.05, 8.0, 6, 0), 'trim', (x * 0.5, 4.0, z * 0.5), (z * 0.02, 0, -x * 0.02))
for k in range(8):
    y = 0.5 + k
    for side in range(4):
        a = side * math.pi / 2
        p0 = Vector((math.cos(a) - math.sin(a), 0, math.sin(a) + math.cos(a))) * 0.5 * (1 - y * 0.02)
        p1 = Vector((math.cos(a + math.pi / 2) - math.sin(a + math.pi / 2), 0, math.sin(a + math.pi / 2) + math.cos(a + math.pi / 2))) * 0.5 * (1 - y * 0.02)
        tw.add(tube([p0 + Vector((0, y, 0)), p1 + Vector((0, y + 0.9, 0))], 0.012, 4), 'trim')
tw.add(box(0.9, 0.06, 0.9, 0.01), 'metalDark', (0, 8.0, 0))
tw.add(sphere(0.1, 12, 8), 'lampRed', (0, 8.15, 0))
tw.socket('lamp_red', (0, 8.3, 0), lamp='red')
pr = piece('bd_pipe')  # 4 m pipe run (X) with supports
pr.add(cyl(0.25, 0.25, 4.0, 18, 0.0), 'rust', (0, 0.6, 0), (0, 0, math.pi / 2))
for x in (-1.8, 1.8):
    pr.add(cyl(0.3, 0.3, 0.08, 18, 0.01), 'metalDark', (x, 0.6, 0), (0, 0, math.pi / 2))
pr.add(box(0.3, 0.6, 0.7, 0.02), 'trim', (0, 0.3, 0))
pr.add(cyl(0.1, 0.1, 3.9, 10, 0), 'metalDark', (0, 1.0, 0.25), (0, 0, math.pi / 2))

# ================================================================================================ bake + export
B = spec.get('bake', {})
objs = []
for i, p in enumerate(PIECES):
    if ONLY and p.name not in ONLY:
        continue
    big = p.name.startswith(('rock', 'bd_', 'wall', 'pillar', 'lair', 'cover', 'crate'))
    objs.append(to_object(p, bake=True, ao_dist=B.get('aoDist', 0.35) * (1.6 if big else 0.6), rays=B.get('rays', 16), uv_scale=2.0, seed=500 + i, ground=0.0, inset=0.025 if big else 0.012, max_edge=(0.6 if p.name.startswith('wall') else 0.4) if big else 0.2))
tris = stats(objs)
per = {p.name: p.tri_count() for p in PIECES}
print('ENVKIT tris', tris, per)
export_glb(A['out'], extras={'asset': 'envkit', 'tris': tris, 'pieces': per})
print('WROTE', A['out'])
