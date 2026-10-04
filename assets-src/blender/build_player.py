# HD player "Ranger": heavy hard-surface trooper. One rigid mesh per rig joint (+ tagged equipment variants),
# modelled in each joint's local frame (game coords: +Y up, +Z forward, +X = character's left).
# Usage: blender -b -P build_player.py -- assets-src/specs/player.json public/assets/hd/player.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

spec_path, out = lib.args()[:2]
S = lib.load_spec(spec_path)
R, PR = S['rig'], S['proportions']
lib.reset_scene()
A = lib.Asset(S['name'], S['slots'], S['seed'])
B = PR.get('bulk', 1.0)
SIDES = (('L', 1), ('R', -1))


def glyph(part, digit, h, depth, slot, pos, rot):
    """Seven-segment stencil numeral as raised geometry (decal that survives any texture res)."""
    segs = {'a': (0, 1), 'b': (0.5, 0.5), 'c': (0.5, -0.5), 'd': (0, -1), 'e': (-0.5, -0.5), 'f': (-0.5, 0.5), 'g': (0, 0)}
    on = {0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg'}[digit % 10]
    w = h * 0.55; t = h * 0.13
    import mathutils
    for k in on:
        x, y = segs[k]
        vert = k in 'bcef'
        sz = (t, h * 0.5 - t * 0.3, depth) if vert else (w - t * 0.3, t, depth)
        local = mathutils.Vector((x * w, y * h * 0.5, 0))
        M = lib.trs(pos, rot) @ lib.trs(tuple(local))
        A.add(part, _box_ob(sz), slot, M, bevel=(0.002, 1))


def _box_ob(size):
    import bmesh
    from mathutils import Vector
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    return A._obj_from_bm(bm)


# =========================================================================================== legs
th, sh = R['thigh'], R['shin']
for s, x in SIDES:
    T, Sh, F = 'thigh' + s, 'shin' + s, 'foot' + s
    # thigh: padded undersuit + wrap-around armour shells
    A.capsule(T, 0.088 * B, th * 0.62, 'suit', pos=(0, -th * 0.5, 0))
    A.shell(T, 0.105 * B, 0.12 * B, th * 0.62, 0.022, 'armor', a0=-1.35, a1=1.35, pos=(0, -th * 0.86, 0.01), seg=14, bulge=0.012)
    A.shell(T, 0.1 * B, 0.11 * B, th * 0.4, 0.018, 'armorDark', a0=math.pi - 1.0, a1=math.pi + 1.0, pos=(0, -th * 0.8, 0), seg=10)
    A.box(T, (0.05, 0.2, 0.17), 'armorDark', pos=(0.105 * x * B, -th * 0.42, 0), bevel=0.012)  # side plate
    A.box(T, (0.012, 0.13, 0.11), 'accent', pos=(0.132 * x * B, -th * 0.42, 0), bevel=0.004)
    if s == 'R':  # holster + sidearm
        A.box(T, (0.06, 0.17, 0.11), 'webbing', pos=(-0.15 * B, -0.17, 0.01), bevel=0.01)
        A.box(T, (0.04, 0.08, 0.07), 'gunDark', pos=(-0.15 * B, -0.07, 0.015), bevel=0.008)
        for yy in (-0.09, -0.25):
            A.cyl(T, 0.1 * B, 0.1 * B, 0.022, 'webbing', pos=(0, yy, 0), seg=16, cap=False, bevel=0)
    else:  # utility pouch
        A.box(T, (0.05, 0.1, 0.12), 'webbing', pos=(0.15 * B, -0.14, 0.02), bevel=0.012)
        A.cyl(T, 0.1 * B, 0.1 * B, 0.022, 'webbing', pos=(0, -0.11, 0), seg=16, cap=False, bevel=0)
    # knee joint ball
    A.sphere(T, 0.075 * B, 'rubber', pos=(0, -th, 0), seg=14, rings=8)
    # shin: greave shell + calf plate, ribbed rubber gaiter
    A.capsule(Sh, 0.072 * B, sh * 0.6, 'suit', pos=(0, -sh * 0.48, 0))
    A.shell(Sh, 0.09 * B, 0.105 * B, sh * 0.62, 0.022, 'armor', a0=-1.3, a1=1.3, pos=(0, -sh * 0.86, 0.012), seg=14, bulge=0.01)
    A.shell(Sh, 0.088 * B, 0.098 * B, sh * 0.5, 0.018, 'armorDark', a0=math.pi - 1.2, a1=math.pi + 1.2, pos=(0, -sh * 0.78, -0.004), seg=10, bulge=0.012)
    A.box(Sh, (0.07, 0.17, 0.02), 'armorDark', pos=(0, -sh * 0.52, 0.112 * B), bevel=0.006)
    A.box(Sh, (0.03, 0.06, 0.012), 'lights', pos=(0.045 * x, -sh * 0.4, 0.105 * B), rot=(0, 0.5 * x, 0), bevel=0.003)
    for i in range(4):
        A.torus(Sh, 0.076 * B, 0.013, 'rubber', pos=(0, -sh * 0.86 - i * 0.022, 0), seg=16, rseg=6)
    A.add(Sh + '__knee', _box_ob((0.15 * B, 0.13, 0.1)), 'accent', lib.trs((0, -0.02, 0.1 * B), (0.15, 0, 0)), bevel=(0.03, 3))
    A.add(Sh + '__knee', _box_ob((0.09, 0.02, 0.02)), 'armorDark', lib.trs((0, -0.03, 0.155 * B)), bevel=(0.004, 1))
    A.add(Sh + '__knee', _box_ob((0.11, 0.05, 0.08)), 'armorDark', lib.trs((0, 0.04, 0.08 * B), (-0.3, 0, 0)), bevel=(0.012, 2))
    # boot: heavy armoured, rubber sole with lugs, toe cap, ankle cuff
    bt = PR.get('boot', 1.0)
    A.box(F, (0.165 * bt, 0.11, 0.3 * bt), 'armorDark', pos=(0, -0.025, 0.055), bevel=0.03, seg=3)
    A.box(F, (0.175 * bt, 0.04, 0.33 * bt), 'rubber', pos=(0, -0.088, 0.06), bevel=0.012)
    for i in range(5):
        A.box(F, (0.16 * bt, 0.014, 0.025), 'rubber', pos=(0, -0.11, -0.07 + i * 0.065), bevel=0.004)
    A.box(F, (0.15 * bt, 0.07, 0.1), 'armor', pos=(0, 0.0, 0.17 * bt), rot=(0.25, 0, 0), bevel=0.025, seg=3)  # toe cap
    A.box(F, (0.15, 0.09, 0.12), 'armor', pos=(0, 0.04, -0.04), bevel=0.025, seg=3)  # heel / ankle guard
    A.cyl(F, 0.085, 0.08, 0.07, 'rubber', pos=(0, 0.06, 0.0), seg=16)
    A.box(F, (0.012, 0.05, 0.12), 'accent', pos=(0.085 * x * bt, -0.02, 0.06), bevel=0.003)

# =========================================================================================== pelvis
H = 'hips'
A.box(H, (0.36 * B, 0.2, 0.25 * B), 'suit', pos=(0, -0.02, 0), bevel=0.05, seg=3)
A.box(H, (0.42 * B, 0.065, 0.29 * B), 'webbing', pos=(0, 0.06, 0), bevel=0.015)  # belt
A.box(H, (0.08, 0.055, 0.025), 'gunDark', pos=(0, 0.06, 0.155 * B), bevel=0.006)  # buckle
A.box(H, (0.04, 0.02, 0.01), 'lights', pos=(0, 0.06, 0.17 * B), bevel=0.002)
A.box(H, (0.26 * B, 0.16, 0.05), 'armor', pos=(0, -0.08, 0.13 * B), rot=(-0.1, 0, 0), bevel=0.02, seg=3, taper=(1.15, 1.0))  # front plate
A.box(H, (0.2 * B, 0.06, 0.02), 'accent', pos=(0, -0.03, 0.158 * B), rot=(-0.1, 0, 0), bevel=0.006)
A.box(H, (0.28 * B, 0.13, 0.05), 'armorDark', pos=(0, -0.06, -0.14 * B), rot=(0.1, 0, 0), bevel=0.02, seg=3)  # rear plate
for x in (-1, 1):
    A.box(H, (0.08, 0.1, 0.1), 'webbing', pos=(0.17 * x * B, 0.0, 0.1 * B), bevel=0.015)  # pouches
    A.box(H, (0.082, 0.025, 0.104), 'webbing', pos=(0.17 * x * B, 0.05, 0.1 * B), bevel=0.006)
    A.shell(H, 0.2 * B, 0.17 * B, 0.2, 0.018, 'armor', a0=(math.pi / 2) * x - 0.55, a1=(math.pi / 2) * x + 0.55,
            pos=(0, -0.2, 0), seg=10, bulge=0.012)  # hip skirts
    A.box(H, (0.012, 0.07, 0.1), 'hazard', pos=(0.205 * x * B, -0.1, 0), bevel=0.003)
A.box(H, (0.22 * B, 0.11, 0.08), 'webbing', pos=(0, 0.0, -0.16 * B), bevel=0.02)

# =========================================================================================== torso
SP, C = 'spine', 'chest'
A.box(SP, (0.3 * B, 0.22, 0.21 * B), 'suit', pos=(0, 0.1, 0), bevel=0.06, seg=3)
for i in range(3):
    w = (0.24 - i * 0.01) * B
    A.box(SP, (w, 0.055, 0.05), 'armorDark', pos=(0, 0.035 + i * 0.065, 0.1 * B), rot=(-0.08, 0, 0), bevel=0.015, seg=2)
for x in (-1, 1):
    A.box(SP, (0.05, 0.18, 0.18), 'armorDark', pos=(0.15 * x * B, 0.1, 0), bevel=0.02)
# breastplate: sculpted slab (subdivided, creased) + layered plates
A.box(C, (0.5 * B, 0.36, 0.32 * B), 'armor', pos=(0, 0.06, 0.0), bevel=0, subsurf=2, crease=0.75)
A.box(C, (0.44 * B, 0.2, 0.06), 'armorDark', pos=(0, 0.0, 0.15 * B), rot=(0.05, 0, 0), bevel=0.02, seg=3, taper=(1.12, 1.0))
for x in (-1, 1):
    A.box(C, (0.2 * B, 0.15, 0.05), 'armor', pos=(0.11 * x * B, 0.14, 0.16 * B), rot=(-0.18, 0.18 * x, 0.06 * x), bevel=0.02, seg=3)
    A.box(C, (0.12, 0.025, 0.02), 'accent', pos=(0.12 * x * B, 0.2, 0.18 * B), rot=(-0.18, 0.18 * x, 0.06 * x), bevel=0.005)
A.box(C, (0.1, 0.07, 0.03), 'vent', pos=(0, 0.06, 0.19 * B), bevel=0.008)  # center vent
A.box(C, (0.11, 0.08, 0.02), 'armorDark', pos=(0, 0.06, 0.18 * B), bevel=0.006)
A.box(C, (0.045, 0.012, 0.01), 'lights', pos=(-0.1 * B, 0.03, 0.19 * B), bevel=0.002)
A.box(C, (0.045, 0.012, 0.01), 'lights', pos=(-0.1 * B, 0.01, 0.19 * B), bevel=0.002)
A.torus(C, 0.14, 0.045, 'armorDark', pos=(0, 0.23, 0), seg=20, rseg=8)  # collar ring
A.torus(C, 0.12, 0.02, 'rubber', pos=(0, 0.27, 0), seg=18, rseg=6)
for x in (-1, 1):  # webbing straps + mag pouches
    A.box(C, (0.05, 0.36, 0.012), 'webbing', pos=(0.12 * x * B, 0.06, 0.172 * B), rot=(0, 0, 0.12 * x), bevel=0.003)
    A.box(C, (0.075, 0.085, 0.06), 'webbing', pos=(0.08 * x * B, -0.07, 0.2 * B), bevel=0.012)
    A.box(C, (0.077, 0.02, 0.064), 'webbing', pos=(0.08 * x * B, -0.025, 0.2 * B), bevel=0.005)
# side ribs
for x in (-1, 1):
    for i in range(3):
        A.box(C, (0.03, 0.04, 0.18), 'armorDark', pos=(0.25 * x * B, -0.04 + i * 0.06, 0), bevel=0.01)

# ---- backpacks (variants)
P = 'chest__pack'
A.box(P, (0.42 * B, 0.48, 0.22), 'armorDark', pos=(0, 0.05, -0.25 * B), bevel=0.03, seg=3)
A.box(P, (0.38 * B, 0.36, 0.08), 'accent', pos=(0, 0.08, -0.37 * B), bevel=0.03, seg=3)  # red shell
A.box(P, (0.4 * B, 0.07, 0.24), 'armor', pos=(0, 0.3, -0.25 * B), bevel=0.02, seg=2)  # top plate
A.box(P, (0.22, 0.05, 0.06), 'vent', pos=(0, 0.33, -0.27 * B), bevel=0.008)
glyph(P, S['decal']['number'], 0.16, 0.012, 'decal', (0.06, 0.1, -0.414 * B), (0, math.pi, 0))
A.box(P, (0.1, 0.03, 0.012), 'lights', pos=(-0.1, 0.2, -0.414 * B), bevel=0.003)
A.box(P, (0.1, 0.03, 0.012), 'hazard', pos=(-0.1, -0.02, -0.414 * B), bevel=0.003)
for x in (-1, 1):
    A.cyl(P, 0.058, 0.058, 0.38, 'armor', pos=(0.25 * x * B, 0.04, -0.25 * B), seg=16, bevel=0.012)
    A.cyl(P, 0.061, 0.061, 0.05, 'accent', pos=(0.25 * x * B, 0.12, -0.25 * B), seg=16, bevel=0.006)
    A.cyl(P, 0.035, 0.035, 0.04, 'gunDark', pos=(0.25 * x * B, 0.25, -0.25 * B), seg=12, bevel=0.005)
    A.tube(P, [(0.25 * x * B, 0.25, -0.25 * B), (0.2 * x * B, 0.36, -0.15), (0.12 * x, 0.32, -0.02)], 0.014, 'rubber', rseg=6, tip=False)
A.box(P, (0.38 * B, 0.09, 0.17), 'webbing', pos=(0, -0.24, -0.25 * B), bevel=0.04, seg=3)  # bedroll
for x in (-0.12, 0.12):
    A.box(P, (0.03, 0.095, 0.175), 'gunDark', pos=(x, -0.24, -0.25 * B), bevel=0.006)

P = 'chest__reactor'
A.box(P, (0.36 * B, 0.42, 0.12), 'armorDark', pos=(0, 0.04, -0.2 * B), bevel=0.025, seg=3)
A.cyl(P, 0.105, 0.105, 0.4, 'gunGlow', pos=(0, 0.06, -0.33 * B), seg=20, bevel=0)
for y in (-0.17, 0.29):
    A.lathe(P, [(0.0, -0.04), (0.14, -0.04), (0.15, -0.02), (0.15, 0.02), (0.13, 0.04), (0.0, 0.04)], 'armor', pos=(0, y, -0.33 * B), seg=20)
for i in range(4):  # armoured housing with four narrow glowing windows
    a = i / 4 * 2 * math.pi + math.pi / 4
    A.shell(P, 0.13, 0.13, 0.4, 0.022, 'armorDark' if i % 2 else 'armor', a0=a - 0.62, a1=a + 0.62, pos=(0, -0.14, -0.33 * B), seg=8, bevel=0.006)
A.shell(P, 0.136, 0.136, 0.05, 0.012, 'accent', a0=math.pi - 0.9, a1=math.pi + 0.9, pos=(0, 0.16, -0.33 * B), seg=10, bevel=0.003)
glyph(P, S['decal']['number'], 0.09, 0.008, 'decal', (0.0, 0.0, -0.33 * B - 0.152), (0, math.pi, 0))
A.tube(P, [(0.15, -0.12, -0.3), (0.2, 0.05, -0.25), (0.16, 0.22, -0.2)], 0.02, 'rubber', rseg=6, tip=False)
A.box(P, (0.1, 0.03, 0.012), 'hazard', pos=(0, 0.34, -0.25 * B), bevel=0.003)

P = 'chest__antenna'
A.cyl(P, 0.006, 0.011, 0.55, 'gunDark', pos=(-0.16, 0.5, -0.3 * B), rot=(-0.12, 0, 0.05), seg=6, bevel=0)
A.sphere(P, 0.02, 'lights', pos=(-0.147, 0.775, -0.335 * B), seg=10, rings=6)
A.cyl(P, 0.032, 0.032, 0.07, 'armor', pos=(-0.17, 0.25, -0.3 * B), seg=12, bevel=0.006)

# ---- pauldrons (on the chest so arm IK twist doesn't drag them): layered curved plates around a front-back axis
def pauldron(P, x, w, big):
    cx, cy = 0.27 * x * B, 0.21
    rot = (math.pi / 2, 0, 0)  # shell axis -> +Z; angle pi = up, pi/2 = +X (left)
    out = math.pi / 2 if x > 0 else 3 * math.pi / 2
    sgn = 1 if x > 0 else -1
    def arc(lo, hi):  # angles measured from 'up' towards the outside
        a0, a1 = math.pi - sgn * lo, math.pi - sgn * hi
        return (min(a0, a1), max(a0, a1))
    L = 0.3 * w
    a0, a1 = arc(-0.45, 1.25)
    A.shell(P, 0.135 * w, 0.135 * w, L, 0.03, 'armor', a0=a0, a1=a1, pos=(cx, cy, -L / 2), rot=rot, seg=14, bulge=0.025, bevel=0.01)
    a0, a1 = arc(-0.42, -0.25)
    A.shell(P, 0.142 * w, 0.142 * w, L * 0.96, 0.034, 'accent', a0=a0, a1=a1, pos=(cx, cy, -L * 0.48), rot=rot, seg=3, bulge=0.025, bevel=0.006)
    a0, a1 = arc(0.85, 1.75)
    A.shell(P, 0.152 * w, 0.152 * w, L * 0.86, 0.026, 'armorDark', a0=a0, a1=a1, pos=(cx, cy - 0.01, -L * 0.43), rot=rot, seg=10, bulge=0.018, bevel=0.008)
    a0, a1 = arc(1.45, 2.25)
    A.shell(P, 0.165 * w, 0.165 * w, L * 0.74, 0.024, 'armor', a0=a0, a1=a1, pos=(cx, cy - 0.02, -L * 0.37), rot=rot, seg=8, bulge=0.012, bevel=0.008)
    if big:
        a0, a1 = arc(2.0, 2.45)
        A.shell(P, 0.172 * w, 0.172 * w, L * 0.66, 0.02, 'hazard', a0=a0, a1=a1, pos=(cx, cy - 0.03, -L * 0.33), rot=rot, seg=4, bulge=0.01, bevel=0.005)
        for zz in (-0.1, 0.1):
            A.cyl(P, 0.013, 0.013, 0.03, 'gunDark', pos=(cx + 0.05 * x, cy + 0.125, zz * w), rot=(0, 0, -0.4 * x), seg=8, bevel=0)
        A.box(P, (0.05, 0.03, 0.08), 'armorDark', pos=(cx - 0.02 * x, cy + 0.14, 0.0), rot=(0, 0, -0.2 * x), bevel=0.01)


for tag, big in (('heavy', True), ('light', False)):
    for x in (-1, 1):
        pauldron('chest__pauldron_' + tag, x, PR.get('pauldron', 1.0) * (1.0 if big else 0.85), big)

P = 'chest__lamp'
A.box(P, (0.085, 0.075, 0.1), 'armorDark', pos=(-0.3 * B, 0.29, 0.06), bevel=0.012)
A.cyl(P, 0.03, 0.03, 0.02, 'lens', pos=(-0.3 * B, 0.29, 0.115), rot=(math.pi / 2, 0, 0), seg=14, bevel=0)
A.torus(P, 0.034, 0.008, 'gun', pos=(-0.3 * B, 0.29, 0.112), rot=(math.pi / 2, 0, 0), seg=14, rseg=5)

# =========================================================================================== head
N, HD = 'neck', 'head'
hs = PR.get('helmet', 1.0)
A.cyl(N, 0.062, 0.072, 0.11, 'rubber', pos=(0, 0.0, 0), seg=14, bevel=0.01)
for i in range(3):
    A.torus(N, 0.066, 0.008, 'rubber', pos=(0, -0.03 + i * 0.03, 0), seg=14, rseg=5)
# helmet dome
A.sphere(HD, 0.165 * hs, 'armor', pos=(0, 0.11, -0.015), scl=(1.0, 0.98, 1.1), seg=28, rings=16, smooth=1.2)
# visor: wraparound emissive band + frame
A.lathe(HD, [(0.152 * hs, 0.06), (0.158 * hs, 0.09), (0.156 * hs, 0.125), (0.145 * hs, 0.15), (0.13 * hs, 0.15), (0.14 * hs, 0.06)], 'visor',
        pos=(0, 0.0, 0.012), scl=(1.0, 1.0, 1.1), seg=18, a0=-1.15, a1=1.15, closed=True)
A.lathe(HD, [(0.16 * hs, 0.05), (0.168 * hs, 0.06), (0.168 * hs, 0.155), (0.158 * hs, 0.165), (0.15 * hs, 0.155), (0.15 * hs, 0.055)], 'armorDark',
        pos=(0, 0.0, 0.0), scl=(1.0, 1.0, 1.1), seg=20, a0=-1.35, a1=1.35, closed=True)
A.box(HD, (0.045, 0.1, 0.03), 'visor', pos=(0, 0.04, 0.188 * hs), bevel=0.008)  # T-slot
# face guard / rebreather
A.box(HD, (0.15 * hs, 0.085, 0.09), 'armorDark', pos=(0, 0.0, 0.13 * hs), rot=(0.25, 0, 0), bevel=0.025, seg=3, taper=(1.2, 1.0))
A.box(HD, (0.07, 0.04, 0.02), 'vent', pos=(0, -0.01, 0.18 * hs), rot=(0.25, 0, 0), bevel=0.005)
for x in (-1, 1):
    A.cyl(HD, 0.03, 0.033, 0.045, 'gunDark', pos=(0.06 * x, -0.0, 0.15 * hs), rot=(math.pi / 2 - 0.3, 0, 0.5 * x), seg=12, bevel=0.006)
    A.cyl(HD, 0.052, 0.052, 0.05, 'armorDark', pos=(0.15 * x * hs, 0.09, -0.01), rot=(0, 0, math.pi / 2), seg=16, bevel=0.01)  # ear modules
    A.cyl(HD, 0.032, 0.032, 0.056, 'accent', pos=(0.15 * x * hs, 0.09, -0.01), rot=(0, 0, math.pi / 2), seg=14, bevel=0.006)
    A.box(HD, (0.012, 0.03, 0.012), 'lights', pos=(0.18 * x * hs, 0.09, 0.02), bevel=0.003)
A.box(HD, (0.045, 0.05, 0.3), 'accent', pos=(0, 0.255 * hs, -0.02), bevel=0.015, seg=3)  # crest
A.box(HD, (0.25 * hs, 0.08, 0.07), 'armorDark', pos=(0, 0.13, -0.15 * hs), rot=(-0.3, 0, 0), bevel=0.02, seg=3)  # rear neck guard
A.cyl(HD, 0.004, 0.006, 0.18, 'gunDark', pos=(-0.12, 0.28, -0.08), rot=(-0.2, 0, 0.2), seg=6, bevel=0)

# =========================================================================================== arms
up, lo = R['upper'], R['lower']
for s, x in SIDES:
    U, Fo, Hd = 'upper' + s, 'fore' + s, 'hand' + s
    A.capsule(U, 0.062 * B, up * 0.55, 'suit', pos=(0, -up * 0.45, 0))
    A.shell(U, 0.078 * B, 0.084 * B, up * 0.5, 0.016, 'armor', a0=(math.pi / 2) * x - 1.4, a1=(math.pi / 2) * x + 1.4, pos=(0, -up * 0.75, 0), seg=12, bulge=0.008)
    A.box(U, (0.04, 0.06, 0.06), 'armorDark', pos=(0.07 * x, -up * 0.5, 0), bevel=0.01)
    A.sphere(U, 0.058 * B, 'rubber', pos=(0, -up, 0), seg=14, rings=8)  # elbow
    A.sphere(U, 0.068 * B, 'suit', pos=(0, -0.01, 0), seg=14, rings=8)  # shoulder ball
    A.capsule(Fo, 0.055 * B, lo * 0.5, 'suit', pos=(0, -lo * 0.4, 0))
    A.box(Fo, (0.125 * B, 0.18, 0.125 * B), 'armorDark', pos=(0, -lo * 0.5, 0), bevel=0.03, seg=3, taper=(0.88, 0.88))  # gauntlet
    A.box(Fo, (0.04, 0.12, 0.135 * B), 'accent', pos=(0.05 * x * B, -lo * 0.48, 0), bevel=0.012)
    A.box(Fo, (0.02, 0.035, 0.05), 'lights', pos=(0.072 * x * B, -lo * 0.48, 0.02), bevel=0.004)
    A.box(Fo, (0.08, 0.05, 0.05), 'armor', pos=(0, -0.02, -0.04), rot=(0.4, 0, 0), bevel=0.015)  # elbow guard
    # glove: palm block + knuckle plate + finger bundle + thumb
    A.box(Hd, (0.085, 0.09, 0.07), 'suit', pos=(0, -0.04, 0), bevel=0.022, seg=3)
    A.box(Hd, (0.08, 0.045, 0.075), 'armorDark', pos=(0, -0.015, 0), bevel=0.012)
    A.box(Hd, (0.075, 0.05, 0.06), 'rubber', pos=(0, -0.095, 0.01), rot=(0.3, 0, 0), bevel=0.018, seg=3)
    A.box(Hd, (0.025, 0.06, 0.025), 'rubber', pos=(0.04 * x, -0.05, 0.035), rot=(0.5, 0, 0.3 * x), bevel=0.01)

# =========================================================================================== rifle (gun joint)
Gn = 'gun'
A.box(Gn, (0.08, 0.12, 0.42), 'gun', pos=(0, 0, 0.12), bevel=0.012, seg=2)  # receiver
A.box(Gn, (0.084, 0.05, 0.18), 'gunDark', pos=(0, 0.02, 0.1), bevel=0.006)  # ejection side panel
A.box(Gn, (0.06, 0.03, 0.34), 'gunDark', pos=(0, 0.075, 0.1), bevel=0.006)  # rail base
for i in range(10):
    A.box(Gn, (0.07, 0.014, 0.018), 'gunDark', pos=(0, 0.095, -0.05 + i * 0.033), bevel=0.003)
A.box(Gn, (0.078, 0.1, 0.32), 'gunDark', pos=(0, -0.004, 0.46), bevel=0.018, seg=2)  # handguard
for side in (-1, 1):
    A.box(Gn, (0.006, 0.05, 0.22), 'vent', pos=(0.04 * side, 0.0, 0.47), bevel=0.002)
A.box(Gn, (0.082, 0.012, 0.24), 'gunGlow', pos=(0, 0.035, 0.47), bevel=0.003)
A.box(Gn, (0.082, 0.012, 0.24), 'gunGlow', pos=(0, -0.035, 0.47), bevel=0.003)
A.cyl(Gn, 0.02, 0.02, 0.26, 'gunDark', pos=(0, 0, 0.72), rot=(math.pi / 2, 0, 0), seg=12, bevel=0)  # barrel
A.lathe(Gn, [(0.0, 0.0), (0.034, 0.0), (0.038, 0.015), (0.038, 0.07), (0.03, 0.09), (0.016, 0.09), (0.016, 0.0)], 'gun',
        pos=(0, 0, 0.8), rot=(math.pi / 2, 0, 0), seg=16, bevel=(0.003, 1))  # muzzle brake
for i in range(3):
    A.box(Gn, (0.08, 0.008, 0.008), 'gunDark', pos=(0, 0, 0.82 + i * 0.02), bevel=0)
A.box(Gn, (0.055, 0.17, 0.08), 'gunDark', pos=(0, -0.12, 0.2), rot=(0.32, 0, 0), bevel=0.012, taper=(1.0, 1.15))  # magazine
A.box(Gn, (0.057, 0.03, 0.082), 'accent', pos=(0, -0.17, 0.18), rot=(0.32, 0, 0), bevel=0.006)
A.box(Gn, (0.05, 0.12, 0.06), 'rubber', pos=(0, -0.09, 0.0), rot=(-0.28, 0, 0), bevel=0.015)  # grip
A.prism(Gn, [(-0.11, -0.06), (0.12, -0.04), (0.12, 0.05), (-0.2, 0.06), (-0.22, -0.08), (-0.16, -0.08)], 0.06, 'gun',
        pos=(0, -0.01, -0.12), rot=(0, -math.pi / 2, 0), bevel=0.01)  # stock (profile in local ZY via rotation)
A.box(Gn, (0.065, 0.12, 0.03), 'rubber', pos=(0, -0.02, -0.33), bevel=0.01)  # butt pad
A.box(Gn, (0.066, 0.035, 0.08), 'accent', pos=(0, 0.035, -0.22), bevel=0.008)
A.lathe(Gn, [(0.0, -0.09), (0.03, -0.09), (0.03, -0.06), (0.024, -0.04), (0.024, 0.04), (0.032, 0.06), (0.032, 0.09), (0.0, 0.09)], 'gunDark',
        pos=(0, 0.14, 0.1), rot=(math.pi / 2, 0, 0), seg=16)  # scope
A.cyl(Gn, 0.026, 0.026, 0.004, 'lens', pos=(0, 0.14, 0.192), rot=(math.pi / 2, 0, 0), seg=14, bevel=0)
for z in (0.05, 0.15):
    A.box(Gn, (0.03, 0.04, 0.02), 'gunDark', pos=(0, 0.11, z), bevel=0.004)
A.box(Gn, (0.025, 0.07, 0.04), 'rubber', pos=(0, -0.085, 0.36), bevel=0.008)  # fore grip
A.box(Gn, (0.03, 0.03, 0.06), 'gunDark', pos=(0.045, -0.0, 0.58), bevel=0.006)  # under-rail light
A.cyl(Gn, 0.012, 0.012, 0.004, 'lights', pos=(0.045, 0.0, 0.612), rot=(math.pi / 2, 0, 0), seg=10, bevel=0)

# ---- assembled rest pose used while baking (joint layout = src/assets/player.ts)
T = lib.trs
yaw = -0.55
M = {}
M['hips'] = T((0, R['hipY'], 0))
M['spine'] = M['hips'] @ T((0, R['spine'], 0))
M['chest'] = M['spine'] @ T((0, R['chest'], 0), (0, yaw, 0))
M['neck'] = M['chest'] @ T(tuple(R['neck']), (0, -yaw * 0.8, 0))
M['head'] = M['neck'] @ T(tuple(R['head']))
M['gun'] = M['spine'] @ T(tuple(R['gun']))
for s_, x in SIDES:
    M['thigh' + s_] = M['hips'] @ T((R['hipX'] * x, -0.04, 0))
    M['shin' + s_] = M['thigh' + s_] @ T((0, -th, 0))
    M['foot' + s_] = M['shin' + s_] @ T((0, -sh, 0))
    sx, sy, sz = R['shoulder']
    M['upper' + s_] = M['chest'] @ T((sx * x, sy, sz), (0, 0, 0.18 * x))
    M['fore' + s_] = M['upper' + s_] @ T((0, -up, 0), (-0.25, 0, 0))
    M['hand' + s_] = M['fore' + s_] @ T((0, -lo, 0))
for name in list(A.parts.keys()):
    A.place(name, M[name.split('__')[0]])
A.join_parts()
VARIANTS = [['chest__reactor', 'chest__pauldron_heavy'], ['chest__pack', 'chest__pauldron_light']]
info = lib.bake_and_export(A, os.path.abspath(out), size=S.get('atlas', 2048), samples=S.get('samples', 16), passes=VARIANTS)
info['spec'] = os.path.basename(spec_path)
lib.write_report(os.path.abspath(out), info)
print('ASSET_INFO', info)
