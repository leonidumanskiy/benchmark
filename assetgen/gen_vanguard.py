# Player "Vanguard": heavy hard-surface trooper. One rigid Part per rig joint, authored in joint-local space
# (limbs hang along -Y; model faces +Z, left = +X). The skeleton numbers come from the shared spec, which the
# runtime reads too, so procedural IK animation drives these parts directly.
#   blender -b -P assetgen/gen_vanguard.py -- --spec assetgen/specs/vanguard.json --out public/assets/gen/vanguard.glb
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blib import *  # noqa

A = cli_args()
spec = load_spec(A['spec'])
SK, EQ = spec['skeleton'], spec['equipment']
reset_scene()
P = {}


def part(name):
    P[name] = Part(name)
    return P[name]


def seb(rx, ry, rz, p=0.75, nu=28, nv=16):
    """closed rounded-box-ish superellipsoid"""
    return shell(rx, ry, rz, lat=(0, math.pi), lon=(0, TAU), thick=0, nu=nu, nv=nv, power=p)


# ============================================================================================== head
h = part('head')
HC = (0, 0.105, -0.005)
h.add(seb(0.158, 0.155, 0.178, 0.78, 32, 18), 'armor', HC)  # helmet dome
# dark face recess + glowing visor band (wraps the front)
h.add(shell(0.162, 0.168, 0.182, lat=(1.32, 1.86), lon=(math.pi / 2 - 1.0, math.pi / 2 + 1.0), thick=0.012, nu=24, nv=6, power=0.82), 'gunDark', HC)
h.add(shell(0.166, 0.17, 0.186, lat=(1.42, 1.66), lon=(math.pi / 2 - 0.85, math.pi / 2 + 0.85), thick=0.008, nu=24, nv=4, power=0.82), 'visor', HC)
# brow ridge over the visor
h.add(shell(0.172, 0.175, 0.19, lat=(1.18, 1.36), lon=(math.pi / 2 - 1.05, math.pi / 2 + 1.05), thick=0.02, nu=22, nv=4, power=0.82), 'armorDark', HC)
# rebreather jaw block + filter canisters
h.add(box(0.15, 0.09, 0.08, 0.02, 2, taper=(0.8, 0.9)), 'armorDark', (0, 0.01, 0.15), (0.25, 0, 0))
h.add(box(0.07, 0.04, 0.03, 0.008), 'metal', (0, 0.0, 0.195), (0.25, 0, 0))
for x in (-1, 1):
    h.add(cyl(0.032, 0.036, 0.05, 14, 0.006), 'armorDark', (0.075 * x, -0.005, 0.16), (math.pi / 2 - 0.25, 0, 0.5 * x))
    h.add(cyl(0.024, 0.024, 0.052, 14, 0.003), 'metal', (0.075 * x, -0.005, 0.161), (math.pi / 2 - 0.25, 0, 0.5 * x))
    # ear / comm modules
    h.add(cyl(0.055, 0.06, 0.045, 18, 0.008), 'armorDark', (0.158 * x, 0.1, -0.01), (0, 0, math.pi / 2))
    h.add(cyl(0.035, 0.035, 0.05, 16, 0.004), 'accent', (0.165 * x, 0.1, -0.01), (0, 0, math.pi / 2))
    # cheek plates
    h.add(box(0.025, 0.09, 0.12, 0.008), 'armor', (0.14 * x, 0.04, 0.07), (0, 0.35 * x, 0))
h.add(cyl(0.012, 0.012, 0.02, 10, 0.002), 'lights', (-0.188, 0.1, -0.01), (0, 0, math.pi / 2))
# neck guard (rear skirt)
h.add(shell(0.17, 0.12, 0.17, lat=(1.55, 2.1), lon=(math.pi + 0.2, TAU - 0.2), thick=0.018, nu=18, nv=4, power=0.9), 'armor', (0, 0.07, -0.02))
if EQ.get('helmetCrest', True):
    h.add(box(0.03, 0.035, 0.3, 0.008, 2), 'accent', (0, 0.272, -0.02), (0.08, 0, 0))
    h.add(box(0.05, 0.02, 0.2, 0.006), 'armorDark', (0, 0.262, -0.03), (0.08, 0, 0))
# helmet lamps
h.add(box(0.05, 0.035, 0.04, 0.008), 'armorDark', (0.12, 0.2, 0.11), (0, 0.4, 0))
h.add(cyl(0.013, 0.013, 0.01, 12, 0.002), 'lens', (0.128, 0.2, 0.132), (math.pi / 2, 0.4, 0))
if EQ.get('antenna', True):
    h.add(cyl(0.004, 0.007, 0.32, 6, 0), 'gunDark', (-0.17, 0.27, -0.05), (-0.18, 0, 0.12))
    h.add(sphere(0.011, 8, 6), 'lights', (-0.19, 0.43, -0.08))

# ============================================================================================== neck
n = part('neck')
n.add(cyl(0.065, 0.075, 0.12, 16, 0.004), 'suit', (0, 0.0, 0))
for i in range(3):
    n.add(torus(0.07 - i * 0.004, 0.009, 18, 6), 'rubber', (0, -0.03 + i * 0.03, 0))

# ============================================================================================== chest
c = part('chest')
c.add(seb(0.23, 0.2, 0.15, 0.6, 32, 16), 'suit', (0, 0.07, -0.01))  # torso core
# front plate (layered) + sternum ridge
c.add(shell(0.245, 0.21, 0.17, lat=(0.55, 2.1), lon=(math.pi / 2 - 1.15, math.pi / 2 + 1.15), thick=0.03, nu=22, nv=12, power=0.65), 'armor', (0, 0.08, 0.0))
c.add(shell(0.25, 0.12, 0.175, lat=(1.0, 1.9), lon=(math.pi / 2 - 0.55, math.pi / 2 - 0.05), thick=0.014, nu=8, nv=6, power=0.65), 'accent', (0, 0.12, 0.012))
c.add(box(0.035, 0.24, 0.03, 0.01), 'armorDark', (0, 0.05, 0.178))
for i in range(3):
    c.add(box(0.055, 0.012, 0.012, 0.004), 'lights' if i == 0 else 'armorDark', (-0.11, 0.17 - i * 0.025, 0.172))
# back plate
c.add(shell(0.24, 0.21, 0.16, lat=(0.5, 2.0), lon=(3 * math.pi / 2 - 1.2, 3 * math.pi / 2 + 1.2), thick=0.025, nu=20, nv=10, power=0.65), 'armorDark', (0, 0.08, -0.015))
# collar
c.add(torus(0.115, 0.03, 26, 8), 'armorDark', (0, 0.255, -0.01), scl=(1.05, 0.8, 1.0))
# mag pouches on the chest rig
for x in (-1, 1):
    for k in range(2):
        c.add(box(0.062, 0.085, 0.045, 0.01), 'webbing', ((0.04 + k * 0.07) * x, -0.04, 0.185))
        c.add(box(0.066, 0.025, 0.05, 0.006), 'webbing', ((0.04 + k * 0.07) * x, 0.0, 0.19), (0.2, 0, 0))
# shoulder straps (webbing) over the plates
for x in (-1, 1):
    pts = [(0.13 * x, -0.05, 0.19), (0.15 * x, 0.12, 0.2), (0.16 * x, 0.26, 0.06), (0.16 * x, 0.25, -0.12), (0.15 * x, 0.1, -0.2)]
    c.add(tube(pts, 0.022, 6, flat=0.35), 'webbing')
# pauldrons: layered rounded shells with a red trim and a lower lame
heavy = EQ.get('pauldron', 'heavy') == 'heavy'
ps = 0.88 if heavy else 0.74
for x in (-1, 1):
    px = (0.275 + (0.015 if heavy else 0)) * x
    rz = -0.35 * x
    c.add(shell(0.14 * ps, 0.085 * ps, 0.165 * ps, lat=(0, 1.62), thick=0.024, nu=26, nv=10, power=0.62), 'armor', (px, 0.215, 0.0), (0, 0, rz))
    c.add(shell(0.146 * ps, 0.07 * ps, 0.171 * ps, lat=(1.38, 1.62), thick=0.016, nu=26, nv=3, power=0.62), 'accent', (px, 0.218, 0.0), (0, 0, rz))
    c.add(shell(0.13 * ps, 0.07 * ps, 0.155 * ps, lat=(0.9, 1.62), thick=0.02, nu=24, nv=6, power=0.62), 'armorDark', (px + 0.03 * x, 0.14, 0.0), (0, 0, rz * 1.7))
    c.add(shell(0.12 * ps, 0.06 * ps, 0.145 * ps, lat=(0.9, 1.62), thick=0.018, nu=24, nv=6, power=0.62), 'armor', (px + 0.055 * x, 0.08, 0.0), (0, 0, rz * 2.2))
    if heavy:
        c.add(box(0.012, 0.03, 0.22, 0.004), 'armorDark', (px - 0.01 * x, 0.3, 0.0), (0, 0, rz))

# backpack
bp = EQ.get('backpack', 'comms')
if bp == 'comms':
    BZ = -0.285
    c.add(box(0.4, 0.5, 0.2, 0.03, 3), 'armorDark', (0, 0.07, BZ))
    c.add(box(0.36, 0.42, 0.04, 0.015, 2), 'armor', (0, 0.08, BZ - 0.11))
    for x in (-1, 1):
        c.add(box(0.05, 0.44, 0.2, 0.015, 2), 'accent', (0.215 * x, 0.07, BZ - 0.005))  # red side armour
        for k in range(5):
            c.add(box(0.054, 0.012, 0.15, 0.003), 'armorDark', (0.218 * x, -0.1 + k * 0.08, BZ))
    # vents
    for k in range(6):
        c.add(box(0.22, 0.012, 0.012, 0.003), 'gunDark', (0, -0.08 + k * 0.025, BZ - 0.135))
    # number decal on the back
    if EQ.get('decal'):
        c.add(text_mesh(str(EQ['decal']), 0.15, 0.003), 'decal', (0.0, 0.16, BZ - 0.133), (0, math.pi, 0))
        c.add(box(0.12, 0.012, 0.004, 0.002), 'decal', (0, 0.26, BZ - 0.132))
    # side canister + hoses
    c.add(cyl(0.05, 0.05, 0.34, 18, 0.008), 'metal', (-0.17, 0.08, BZ - 0.15))
    for y in (-0.06, 0.08, 0.22):
        c.add(torus(0.052, 0.008, 18, 6), 'gunDark', (-0.17, y, BZ - 0.15))
    c.add(tube([(0.17, 0.27, BZ), (0.2, 0.3, -0.1), (0.19, 0.12, 0.08), (0.13, -0.04, 0.17)], 0.016, 8), 'rubber')
    c.add(tube([(-0.12, 0.3, BZ + 0.02), (-0.1, 0.34, -0.12), (-0.05, 0.3, 0.02)], 0.013, 8), 'rubber')
    # top handle + light strip
    c.add(tube([(-0.1, 0.32, BZ), (-0.08, 0.37, BZ), (0.08, 0.37, BZ), (0.1, 0.32, BZ)], 0.012, 8), 'metal')
    c.add(box(0.2, 0.014, 0.01, 0.003), 'lights', (0, -0.15, BZ - 0.132))
    if EQ.get('antenna', True):
        c.add(cyl(0.006, 0.009, 0.62, 6, 0), 'gunDark', (0.15, 0.62, BZ - 0.02), (-0.12, 0, -0.05))
        c.add(cyl(0.022, 0.022, 0.05, 12, 0.004), 'armorDark', (0.15, 0.33, BZ - 0.02))
        c.add(sphere(0.016, 10, 8), 'lights', (0.165, 0.93, BZ - 0.06))
elif bp == 'reactor':
    BZ = -0.27
    c.add(box(0.36, 0.44, 0.1, 0.025, 2), 'armorDark', (0, 0.07, BZ + 0.06))
    c.add(cyl(0.11, 0.11, 0.42, 24, 0), 'lights', (0, 0.07, BZ - 0.06))
    for y in (-0.15, 0.29):
        c.add(cyl(0.14, 0.14, 0.07, 24, 0.01), 'armor', (0, y, BZ - 0.06))
    for k in range(6):
        a = k / 6 * TAU
        c.add(box(0.03, 0.42, 0.03, 0.006), 'armorDark', (math.cos(a) * 0.125, 0.07, BZ - 0.06 + math.sin(a) * 0.125))
    for y in (-0.06, 0.07, 0.2):
        c.add(torus(0.13, 0.016, 28, 6), 'accent', (0, y, BZ - 0.06))
    c.add(tube([(0.12, 0.25, BZ), (0.18, 0.3, -0.12), (0.15, 0.1, 0.1)], 0.016, 8), 'rubber')

# ============================================================================================== spine (abdomen)
s = part('spine')
s.add(seb(0.16, 0.13, 0.12, 0.7, 24, 12), 'suit', (0, 0.1, 0))
for i in range(3):
    y = 0.03 + i * 0.065
    s.add(shell(0.165 - i * 0.005, 0.05, 0.13, lat=(0.7, 2.3), lon=(math.pi / 2 - 0.95, math.pi / 2 + 0.95), thick=0.018, nu=16, nv=5, power=0.7), 'armor' if i != 1 else 'armorDark', (0, y, 0.0))
for x in (-1, 1):
    s.add(box(0.03, 0.17, 0.12, 0.01), 'armorDark', (0.16 * x, 0.1, -0.01))

# ============================================================================================== hips
p = part('hips')
p.add(seb(0.19, 0.12, 0.14, 0.7, 24, 12), 'suit', (0, -0.03, 0))
p.add(torus(0.19, 0.028, 32, 6), 'webbing', (0, 0.055, 0), scl=(1.03, 1.0, 0.78))  # belt
p.add(box(0.07, 0.05, 0.02, 0.006), 'metal', (0, 0.055, 0.155))  # buckle
# codpiece / front plate
p.add(shell(0.12, 0.13, 0.16, lat=(1.35, 2.35), lon=(math.pi / 2 - 0.7, math.pi / 2 + 0.7), thick=0.02, nu=12, nv=6, power=0.7), 'armor', (0, 0.02, -0.02))
# tasset plates (hang from the belt)
for x in (-1, 1):
    p.add(shell(0.08, 0.16, 0.13, lat=(1.4, 2.35), lon=(-0.75, 0.75), thick=0.018, nu=10, nv=6, power=0.75), 'armor', (0.14 * x, 0.03, 0.0), (0, 0 if x > 0 else math.pi, 0))
    p.add(box(0.012, 0.11, 0.1, 0.004), 'accent', (0.225 * x, -0.04, 0.0), (0, 0, 0.12 * x))
# pouches on the belt
for ang in (0.6, 1.05, 2.1, 2.55, 3.6, 4.2, 5.2):
    x, z = math.cos(ang) * 0.2, math.sin(ang) * 0.155
    if abs(x) > 0.16 and abs(z) < 0.08:
        continue
    p.add(box(0.06, 0.075, 0.045, 0.01), 'webbing', (x, 0.02, z), (0, -ang + math.pi / 2, 0))
    p.add(box(0.064, 0.02, 0.05, 0.005), 'webbing', (x, 0.06, z), (0.15, -ang + math.pi / 2, 0))
p.add(box(0.2, 0.1, 0.07, 0.015), 'armorDark', (0, 0.0, -0.17))  # rear utility box
p.add(box(0.06, 0.012, 0.01, 0.003), 'lights', (0.05, 0.02, -0.206))

# ============================================================================================== legs
for side, x in (('L', 1), ('R', -1)):
    T = part('thigh' + side)
    T.add(tube([(0, 0.05, 0), (0, -0.12, 0.01), (0, -0.3, 0.01), (0, -0.45, 0)], [0.1, 0.098, 0.085, 0.07], 12), 'suit')
    T.add(shell(0.105, 0.17, 0.11, lat=(0.6, 2.4), lon=(math.pi / 2 - 1.25, math.pi / 2 + 1.25), thick=0.02, nu=16, nv=8, power=0.7), 'armor', (0, -0.2, 0.0))
    T.add(box(0.03, 0.2, 0.12, 0.01), 'armorDark', (0.1 * x, -0.2, 0.0))
    for k in range(2):
        T.add(torus(0.1 - k * 0.006, 0.012, 18, 5), 'webbing', (0, -0.08 - k * 0.2, 0.0), scl=(1, 1, 1.05))
    if side == 'R':  # sidearm holster
        T.add(box(0.05, 0.17, 0.09, 0.012), 'webbing', (-0.115, -0.16, 0.02))
        T.add(box(0.035, 0.07, 0.04, 0.008), 'gunDark', (-0.12, -0.04, 0.01), (0.3, 0, 0))
    else:  # thigh pouch
        T.add(box(0.05, 0.1, 0.1, 0.012), 'webbing', (0.115, -0.24, 0.02))
    S = part('shin' + side)
    S.add(tube([(0, 0.03, 0), (0, -0.15, -0.01), (0, -0.35, 0.0), (0, -0.44, 0.0)], [0.08, 0.083, 0.068, 0.062], 12), 'suit')
    S.add(shell(0.095, 0.2, 0.1, lat=(0.45, 2.45), lon=(math.pi / 2 - 1.2, math.pi / 2 + 1.2), thick=0.022, nu=16, nv=9, power=0.7), 'armor', (0, -0.24, 0.015))
    S.add(box(0.06, 0.22, 0.02, 0.008), 'armorDark', (0, -0.25, 0.115))
    S.add(shell(0.09, 0.15, 0.09, lat=(0.6, 2.2), lon=(3 * math.pi / 2 - 1.1, 3 * math.pi / 2 + 1.1), thick=0.016, nu=12, nv=6, power=0.75), 'armorDark', (0, -0.2, -0.01))
    if EQ.get('kneePads', True):
        S.add(shell(0.085, 0.09, 0.085, lat=(0.0, 1.9), lon=(math.pi / 2 - 1.3, math.pi / 2 + 1.3), thick=0.03, nu=16, nv=8, power=0.8), 'accent', (0, 0.0, 0.035), (math.pi / 2 - 0.15, 0, 0))
        S.add(box(0.08, 0.02, 0.02, 0.006), 'armorDark', (0, 0.0, 0.125))
    F = part('foot' + side)
    F.add(box(0.15, 0.06, 0.3, 0.018, 2), 'rubber', (0, -0.07, 0.06))  # sole
    for k in range(6):
        F.add(box(0.155, 0.012, 0.018, 0.004), 'rubber', (0, -0.1, -0.06 + k * 0.05))  # treads
    F.add(box(0.14, 0.1, 0.24, 0.035, 3, taper=(0.9, 0.7)), 'armorDark', (0, -0.01, 0.04))
    F.add(shell(0.075, 0.07, 0.1, lat=(0.0, 1.7), lon=(0, TAU), thick=0.018, nu=16, nv=6, power=0.8), 'armor', (0, -0.03, 0.12))  # toe cap
    F.add(tube([(0, 0.06, 0), (0, -0.0, 0)], [0.07, 0.075], 12), 'armor')  # ankle cuff
    F.add(box(0.02, 0.03, 0.06, 0.005), 'metal', (0.075 * x, -0.0, -0.02))

# ============================================================================================== arms
for side, x in (('L', 1), ('R', -1)):
    U = part('upper' + side)
    U.add(tube([(0, 0.03, 0), (0, -0.15, 0), (0, -0.29, 0)], [0.065, 0.062, 0.055], 12), 'suit')
    U.add(shell(0.075, 0.12, 0.072, lat=(0.5, 2.5), lon=(-1.6, 1.6), thick=0.016, nu=12, nv=8, power=0.75), 'armor', (0, -0.14, 0), (0, 0 if x > 0 else math.pi, 0))
    U.add(torus(0.064, 0.01, 16, 5), 'webbing', (0, -0.06, 0))
    U.add(sphere(0.06, 14, 10, (1, 1, 1)), 'armorDark', (0, -0.29, -0.01))  # elbow
    Fo = part('fore' + side)
    Fo.add(tube([(0, 0.02, 0), (0, -0.14, 0), (0, -0.27, 0)], [0.056, 0.058, 0.046], 12), 'suit')
    Fo.add(box(0.11, 0.19, 0.11, 0.03, 3, taper=(1.12, 1.12)), 'armorDark', (0, -0.15, 0))  # gauntlet
    Fo.add(box(0.03, 0.12, 0.085, 0.008), 'accent', (0.058 * x, -0.15, 0))
    Fo.add(box(0.012, 0.05, 0.04, 0.003), 'lights', (0.075 * x, -0.15, 0.0))
    Fo.add(torus(0.055, 0.011, 16, 5), 'metal', (0, -0.245, 0))
    H = part('hand' + side)
    H.add(box(0.08, 0.09, 0.06, 0.02, 2), 'suit', (0, -0.04, 0))
    H.add(box(0.075, 0.05, 0.065, 0.016, 2), 'armorDark', (0, -0.015, 0.0))  # back-of-hand plate
    H.add(box(0.07, 0.06, 0.05, 0.018, 2), 'rubber', (0, -0.1, 0.01), (0.5, 0, 0))  # curled fingers
    H.add(box(0.03, 0.05, 0.03, 0.01), 'rubber', (0.035 * x, -0.06, 0.04), (0.3, 0, -0.4 * x))  # thumb

# ============================================================================================== rifle (gun joint, +Z forward)
g = part('gun')
# receiver: angular profile (YZ side view) extruded across X
rec = [(-0.06, -0.05), (0.24, -0.05), (0.26, -0.02), (0.26, 0.05), (0.08, 0.065), (-0.05, 0.065), (-0.08, 0.03)]
recv = prism([(zz, yy) for zz, yy in rec], 0.075, 0.008)
deform(recv, lambda v: Vector((v.z, v.y, v.x)))
g.add(recv, 'gun', (0, 0, 0))
g.add(box(0.08, 0.02, 0.28, 0.005), 'gunDark', (0, 0.075, 0.11))  # top rail
for k in range(12):
    g.add(box(0.084, 0.008, 0.012, 0.002), 'gunDark', (0, 0.089, -0.01 + k * 0.022))
# handguard with vent slots
g.add(box(0.07, 0.085, 0.3, 0.012), 'gunDark', (0, -0.005, 0.42))
for k in range(5):
    for sx in (-1, 1):
        g.add(box(0.006, 0.02, 0.035, 0.002), 'lights' if k % 2 == 0 else 'gun', (0.036 * sx, 0.015, 0.33 + k * 0.045))
g.add(box(0.074, 0.016, 0.24, 0.005), 'accent', (0, -0.048, 0.42))  # red underside stripe
g.add(box(0.077, 0.012, 0.12, 0.004), 'accent', (0, 0.03, 0.08))  # red receiver flash
# barrel + muzzle brake
g.add(cyl(0.017, 0.017, 0.28, 14, 0.002), 'metal', (0, 0.01, 0.7), (math.pi / 2, 0, 0))
g.add(cyl(0.03, 0.03, 0.09, 16, 0.005), 'gunDark', (0, 0.01, 0.86), (math.pi / 2, 0, 0))
for k in range(3):
    g.add(box(0.064, 0.012, 0.01, 0.002), 'metal', (0, 0.01, 0.835 + k * 0.022))
# magazine (curved) + pistol grip + trigger guard
g.add(tube([(0, -0.04, 0.17), (0, -0.12, 0.19), (0, -0.2, 0.23)], 0.032, 4, flat=0.6, twist=math.pi / 4), 'gunDark')
g.add(box(0.045, 0.12, 0.06, 0.012), 'rubber', (0, -0.1, 0.0), (-0.3, 0, 0))
g.add(tube([(0, -0.05, 0.03), (0, -0.09, 0.06), (0, -0.05, 0.1)], 0.006, 6), 'gunDark')
# stock
stk = prism([(-0.06, 0.04), (-0.06, -0.04), (-0.3, -0.08), (-0.33, -0.08), (-0.33, 0.05), (-0.12, 0.05)], 0.055, 0.01)
deform(stk, lambda v: Vector((v.z, v.y, v.x)))
g.add(stk, 'gun')
g.add(box(0.06, 0.13, 0.03, 0.01), 'rubber', (0, -0.015, -0.335))
g.add(box(0.058, 0.03, 0.08, 0.006), 'accent', (0, 0.02, -0.22))
# optic
g.add(lathe([(0, -0.07), (0.026, -0.07), (0.03, -0.05), (0.024, -0.02), (0.024, 0.04), (0.032, 0.07), (0.032, 0.085), (0, 0.085)], 18), 'gunDark', (0, 0.135, 0.08), (math.pi / 2, 0, 0))
g.add(cyl(0.026, 0.026, 0.004, 16, 0), 'lens', (0, 0.135, 0.167), (math.pi / 2, 0, 0))
g.add(box(0.03, 0.04, 0.03, 0.006), 'gunDark', (0, 0.105, 0.06))
g.add(box(0.03, 0.04, 0.03, 0.006), 'gunDark', (0, 0.105, 0.12))
# under-barrel light + foregrip
g.add(cyl(0.022, 0.022, 0.09, 14, 0.004), 'gunDark', (0, -0.075, 0.56), (math.pi / 2, 0, 0))
g.add(cyl(0.016, 0.016, 0.004, 12, 0), 'lens', (0, -0.075, 0.607), (math.pi / 2, 0, 0))
g.add(box(0.03, 0.08, 0.035, 0.008), 'rubber', (0, -0.08, 0.37))
g.add(box(0.012, 0.03, 0.012, 0.003), 'lights', (0.04, 0.03, -0.02))

# ============================================================================================== bake + export
B = spec.get('bake', {})
objs = []
order = list(P.keys())
for i, name in enumerate(order):
    objs.append(to_object(P[name], bake=True, ao_dist=B.get('aoDist', 0.22), rays=B.get('rays', 20), uv_scale=4.0, seed=i + 1, inset=0.008, max_edge=0.08))
tris = stats(objs)
print('VANGUARD tris', tris, {k: P[k].tri_count() for k in order})
export_glb(A['out'], extras={'asset': 'vanguard', 'tris': tris, 'spec': spec})
print('WROTE', A['out'])
