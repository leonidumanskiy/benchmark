# HD monster "Ravager": armoured silver-carapace predator with red horns and glowing seams.
# Same joint layout as the procedural rig (src/assets/monster.ts): 4 IK legs + 2 scythe arms, head with two jaws.
# Every part is modelled in its joint's local frame (bones point along -Y; model faces +Z).
# Usage: blender -b -P build_monster.py -- assets-src/specs/monster.json public/assets/hd/monster.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
from mathutils import Vector

spec_path, out = lib.args()[:2]
S = lib.load_spec(spec_path)
R, D = S['rig'], S['design']
lib.reset_scene()
A = lib.Asset(S['name'], S['slots'], S['seed'])
rng = A.rng
HL = D.get('hornLength', 1.0)


def horn(part, base, direction, length, r0, bend, slot='spike', rseg=7, n=9, flat=1.0, rot=(0, 0, 0)):
    """Tapered curved horn: quadratic sweep base + dir*len*t + bend*t^2."""
    b, d, k = Vector(base), Vector(direction).normalized(), Vector(bend)
    pts, rad = [], []
    for i in range(n):
        t = i / (n - 1)
        pts.append(tuple(b + d * (length * t) + k * (t * t)))
        rad.append(max(0.003, r0 * (1 - t) ** 0.85))
    return A.tube(part, pts, rad, slot, rseg=rseg, flat=flat, rot=rot, smooth=1.0)


def plate(part, r, slot, pos, scl, rot=(0, 0, 0), cut=-0.05, seg=20, rings=10):
    """Domed carapace plate (half ellipsoid)."""
    return A.sphere(part, r, slot, pos=pos, rot=rot, scl=scl, seg=seg, rings=rings, cut=cut, smooth=1.0)


# =========================================================================================== thorax
Bd = 'body'
A.box(Bd, (0.56, 0.42, 0.8), 'sinew', pos=(0, -0.04, 0.02), bevel=0, subsurf=2, crease=0.2, taper=(0.85, 0.9))  # core mass
# overlapping dorsal carapace segments, front (shoulder hump) to back
for i, (z, w, h, l, pitch) in enumerate([(0.3, 0.62, 0.5, 0.42, -0.35), (0.08, 0.6, 0.44, 0.36, -0.18), (-0.14, 0.54, 0.38, 0.34, -0.05)]):
    plate(Bd, 0.5, 'shell', (0, 0.08 - i * 0.02, z), (w, h, l), rot=(pitch, 0, 0))
    plate(Bd, 0.5, 'shellDark', (0, 0.05 - i * 0.02, z - 0.06), (w * 1.03, h * 0.9, l * 0.9), rot=(pitch, 0, 0))  # rim under each plate
    A.box(Bd, (0.05, 0.03, l * 0.75), 'glow', pos=(0, 0.08 - i * 0.02 + h * 0.48, z - 0.02), rot=(pitch, 0, 0), bevel=0.01)  # seam
# shoulder pauldron plates + leg-mount flanges
for x in (-1, 1):
    plate(Bd, 0.24, 'shell', (0.27 * x, 0.06, 0.28), (1.0, 0.62, 1.25), rot=(0, 0, -0.55 * x))
    plate(Bd, 0.2, 'shellDark', (0.33 * x, -0.06, 0.02), (0.6, 0.7, 1.6), rot=(0, 0, -0.9 * x))
    for i in range(3):
        A.sphere(Bd, 0.04, 'glow', pos=(0.36 * x, -0.13, 0.18 - i * 0.15), seg=10, rings=6)  # vents
    for i in range(3):  # small side spikes
        horn(Bd, (0.36 * x, 0.04, 0.2 - i * 0.16), (0.8 * x, 0.6, -0.3), 0.16, 0.025, (0, 0.03, -0.05))
# underside ribs (flesh) with glowing gaps
for i in range(5):
    A.torus(Bd, 0.2 - i * 0.008, 0.03, 'flesh', pos=(0, -0.17, 0.28 - i * 0.13), rot=(0, 0, math.pi), arc=math.pi, seg=12, rseg=6, scl=(1.0, 1.0, 0.7))
A.box(Bd, (0.1, 0.04, 0.6), 'glow', pos=(0, -0.24, 0.02), bevel=0.015)
# dorsal horn row: signature swept-back silhouette
n = D.get('dorsalHorns', 5)
for i in range(n):
    t = i / max(1, n - 1)
    z, h = 0.3 - t * 0.5, (0.62 - t * 0.2) * HL
    for x in (-1, 1):  # big hooked horns, curling backwards (reference silhouette)
        horn(Bd, (0.13 * x, 0.24 - t * 0.06, z), (0.35 * x, 1.0, -0.2), h, 0.065, (0.1 * x, -0.12, -0.55 * h), rseg=8, n=11)
    horn(Bd, (0, 0.27 - t * 0.06, z - 0.1), (0, 1.0, -0.6), h * 0.55, 0.04, (0, -0.05, -0.2 * h))

# =========================================================================================== abdomen + tail
Ab, Tl = 'abdomen', 'tail'
A.sphere(Ab, 0.3, 'flesh', pos=(0, -0.05, -0.16), scl=(0.78, 0.62, 1.0), seg=20, rings=12, smooth=1.0)
for i in range(4):
    plate(Ab, 0.3, 'shell' if i % 2 == 0 else 'shellDark', (0, 0.05 - i * 0.03, -0.04 - i * 0.14), (0.98 - i * 0.12, 0.62, 0.55), rot=(-0.2 - i * 0.16, 0, 0))
for x in (-1, 1):
    for i in range(3):
        A.sphere(Ab, 0.045 - i * 0.006, 'glow', pos=(0.21 * x, -0.07 - i * 0.02, -0.1 - i * 0.13), seg=10, rings=6)
horn(Tl, (0, 0.04, 0.12), (0, -0.25, -1.0), 0.45, 0.06, (0, 0.25, 0.0))
horn(Tl, (0, 0.06, 0.08), (0, 0.6, -1.0), 0.25, 0.03, (0, -0.05, -0.05))

# =========================================================================================== neck + head (pre-scaled x1.3 by the rig)
Nk, Hd = 'neck', 'head'
for i in range(3):
    A.cyl(Nk, 0.17 - i * 0.015, 0.15 - i * 0.015, 0.08, 'sinew', pos=(0, -0.02, -0.04 + i * 0.09), rot=(math.pi / 2 - 0.3, 0, 0), seg=14, bevel=0.015)
    plate(Nk, 0.17 - i * 0.012, 'shell', (0, 0.05, -0.04 + i * 0.09), (1.0, 0.6, 0.75), rot=(-0.25, 0, 0))
# skull: wedge, creased subdivided cage
A.box(Hd, (0.34, 0.2, 0.46), 'shellDark', pos=(0, -0.02, 0.1), bevel=0, subsurf=2, crease=0.35, taper=(0.78, 0.8))
plate(Hd, 0.24, 'shell', (0, 0.03, 0.06), (0.95, 0.55, 1.35), rot=(-0.1, 0, 0))  # skull plate
A.box(Hd, (0.05, 0.05, 0.34), 'spike', pos=(0, 0.14, 0.02), rot=(-0.12, 0, 0), bevel=0.015)  # crest ridge
for x in (-1, 1):
    plate(Hd, 0.1, 'shell', (0.11 * x, 0.05, 0.22), (0.9, 0.5, 1.4), rot=(-0.2, 0.25 * x, -0.4 * x))  # brow plates
    for e in range(3):
        A.sphere(Hd, 0.028 - e * 0.005, 'eye', pos=((0.085 + e * 0.04) * x, 0.035 - e * 0.012, 0.3 - e * 0.05), seg=10, rings=6)
    # crown of swept horns
    for k in range(D.get('headHorns', 3)):
        horn(Hd, (0.11 * x - k * 0.02 * x, 0.08, 0.02 - k * 0.07), (0.45 * x, 0.55 - k * 0.1, -1.0), (0.48 - k * 0.1) * HL, 0.05 - k * 0.008, (0.05 * x, 0.12, -0.06))
    horn(Hd, (0.16 * x, -0.03, 0.14), (1.0 * x, -0.1, 0.35), 0.18, 0.03, (0, 0.04, -0.04))  # cheek spurs
A.sphere(Hd, 0.11, 'glow', pos=(0, -0.09, 0.25), scl=(0.95, 0.5, 0.85), seg=14, rings=8)  # glowing maw
for i in range(7):
    xx = -0.12 + i * 0.04
    A.cyl(Hd, 0.014, 0.0005, 0.08, 'teeth', pos=(xx, -0.05, 0.33 - abs(xx) * 0.4), rot=(math.pi, 0, 0), seg=6, bevel=0)
# jaws (mandibles): curved flattened blades with tooth row
for J, x in (('jawL', 1), ('jawR', -1)):
    horn(J, (0, 0, 0), (0.45 * x, -0.15, 1.0), 0.36, 0.055, (-0.12 * x, -0.02, 0.0), slot='shell', flat=0.6)
    horn(J, (0.02 * x, -0.02, 0.05), (0.4 * x, -0.2, 1.0), 0.3, 0.03, (-0.1 * x, 0, 0.0), slot='shellDark', flat=0.8)
    horn(J, (0.11 * x, -0.01, 0.27), (-0.5 * x, -0.3, 1.0), 0.16, 0.024, (-0.06 * x, 0, 0))  # pincer tip
    for k in range(4):
        A.cyl(J, 0.012, 0.0005, 0.06, 'teeth', pos=(0.04 * x + k * 0.012 * x, -0.02, 0.07 + k * 0.05), rot=(0, 0, math.pi / 2 * x), seg=5, bevel=0)

# =========================================================================================== legs
for L in R['legs']:
    nm, a, b = L['name'], L['a'], L['b']
    side = 1 if L['hip'][0] > 0 else -1
    U, Lo, Hp = nm + 'Upper', nm + 'Lower', nm + 'Hip'
    A.sphere(Hp, 0.1, 'sinew', seg=14, rings=8)
    plate(Hp, 0.12, 'shell', (0.02 * side, 0.03, 0), (1.0, 0.7, 1.0), rot=(0, 0, -0.6 * side))
    # upper: thick armoured femur
    A.box(U, (0.15, a * 0.95, 0.13), 'sinew', pos=(0, -a / 2, 0), bevel=0, subsurf=2, crease=0.2, taper=(1.25, 1.2))
    A.box(U, (0.17, a * 0.78, 0.1), 'shell', pos=(0, -a * 0.47, 0.045), bevel=0, subsurf=2, crease=0.55, taper=(1.2, 1.0))
    A.box(U, (0.04, a * 0.6, 0.03), 'glow', pos=(0, -a * 0.5, -0.06), bevel=0.01)
    A.sphere(U, 0.075, 'shellDark', pos=(0, -a, 0), seg=14, rings=8)
    if D.get('legSpikes', True):
        horn(U, (0, -a * 0.95, 0.04), (0, 0.75, 0.65), 0.24, 0.035, (0, 0.04, -0.04))  # knee spike
        horn(U, (0, -a * 0.4, 0.08), (0, 0.35, 1.0), 0.12, 0.022, (0, 0.02, -0.02))
    # lower: long tapering shin ending in a curved red talon
    A.tube(Lo, [(0, 0, 0), (0, -b * 0.3, 0.015), (0, -b * 0.6, 0.02), (0, -b * 0.82, 0.01)], [0.065, 0.05, 0.035, 0.025], 'shell', rseg=8, tip=False, smooth=1.0)
    A.box(Lo, (0.1, b * 0.5, 0.08), 'shellDark', pos=(0, -b * 0.3, 0.03), bevel=0, subsurf=2, crease=0.5, taper=(0.6, 0.6))
    for k in range(3):
        A.torus(Lo, 0.045 - k * 0.006, 0.012, 'sinew', pos=(0, -b * (0.55 + k * 0.08), 0.015), seg=10, rseg=5)
    horn(Lo, (0, -b * 0.8, 0.01), (0, -1.0, 0.05), b * 0.22, 0.03, (0, 0.0, 0.07))  # talon
    for x in (-1, 1):
        horn(Lo, (0.02 * x, -b * 0.88, 0.0), (0.6 * x, -1.0, 0.3), 0.1, 0.014, (0, 0.01, 0.03))  # side claws
    horn(Lo, (0, -b * 0.45, 0.05), (0, 0.4, 1.0), 0.13, 0.02, (0, 0.02, -0.02), slot='spike')

# =========================================================================================== scythe arms
ah, aa, ab = R['arms']['hip'], R['arms']['a'], R['arms']['b']
curve = D.get('bladeCurve', 0.28)
for s_, x in (('L', 1), ('R', -1)):
    Hp, U, Bl = 'arm' + s_, 'arm' + s_ + 'Upper', 'arm' + s_ + 'Blade'
    A.sphere(Hp, 0.085, 'sinew', seg=12, rings=8)
    A.box(U, (0.12, aa * 0.95, 0.11), 'sinew', pos=(0, -aa / 2, 0), bevel=0, subsurf=2, crease=0.2, taper=(1.2, 1.2))
    A.box(U, (0.14, aa * 0.75, 0.08), 'shell', pos=(0, -aa * 0.47, 0.035), bevel=0, subsurf=2, crease=0.55, taper=(1.25, 1.0))
    A.sphere(U, 0.068, 'flesh', pos=(0, -aa, 0), seg=12, rings=8)
    horn(U, (0, -aa * 0.9, 0.03), (0, 0.8, 0.6), 0.18, 0.03, (0, 0.03, -0.03))
    # blade: broad flattened curved scythe (shell) with a red cutting edge
    horn(Bl, (0, 0, 0), (0, -1.0, 0.0), ab, 0.075, (0, 0, curve), slot='shell', flat=0.45, n=11)
    horn(Bl, (0, -0.04, -0.035), (0, -1.0, -0.05), ab * 0.88, 0.045, (0, 0, curve * 1.15), slot='spike', flat=0.35, n=11)
    A.box(Bl, (0.09, 0.18, 0.1), 'shellDark', pos=(0, -0.08, 0), bevel=0.03, seg=2)
    for k in range(3):
        horn(Bl, (0, -0.15 - k * 0.14, 0.03 + k * 0.02), (0, 0.2, 1.0), 0.07, 0.014, (0, -0.01, 0))

# =========================================================================================== rest pose for baking
T = lib.trs
M = {}
M['body'] = T((0, R['bodyY'], 0), (R['bodyPitch'], 0, 0))
M['abdomen'] = M['body'] @ T(tuple(R['abdomen']), (R['abdomenPitch'], 0, 0))
M['tail'] = M['abdomen'] @ T(tuple(R['tail']))
M['neck'] = M['body'] @ T(tuple(R['neck']))
M['head'] = M['neck'] @ T(tuple(R['head']), (R['headPitch'], 0, 0), R['headScale'])
jx, jy, jz = R['jaw']
M['jawL'] = M['head'] @ T((jx, jy, jz), (0, 0.1, 0))
M['jawR'] = M['head'] @ T((-jx, jy, jz), (0, -0.1, 0))


def aim(fr, to):
    """rotation taking the bone (-Y) from point fr towards point to"""
    d = (Vector(to) - Vector(fr)).normalized()
    q = Vector((0, -1, 0)).rotation_difference(d)
    return q.to_matrix().to_4x4()


for L in R['legs']:
    hip = M['body'] @ T(tuple(L['hip']))
    M[L['name'] + 'Hip'] = hip
    hw = hip.to_translation()
    foot = Vector(L['foot'])
    knee = hw + (foot - hw) * 0.45 + Vector((0, 0.45, 0))
    M[L['name'] + 'Upper'] = T(tuple(hw)) @ aim(hw, knee)
    M[L['name'] + 'Lower'] = T(tuple(knee)) @ aim(knee, foot)
for s_, x in (('L', 1), ('R', -1)):
    hip = M['body'] @ T((ah[0] * x, ah[1], ah[2]))
    M['arm' + s_] = hip
    hw = hip.to_translation()
    elbow = hw + Vector((0.1 * x, 0.35, 0.2))
    M['arm' + s_ + 'Upper'] = T(tuple(hw)) @ aim(hw, elbow)
    M['arm' + s_ + 'Blade'] = T(tuple(elbow)) @ aim(elbow, elbow + Vector((0.05 * x, -0.4, 0.5)))
for name in list(A.parts.keys()):
    A.place(name, M[name.split('__')[0]])
A.join_parts()
info = lib.bake_and_export(A, os.path.abspath(out), size=S.get('atlas', 2048), samples=S.get('samples', 16))
info['spec'] = os.path.basename(spec_path)
lib.write_report(os.path.abspath(out), info)
print('ASSET_INFO', info)
