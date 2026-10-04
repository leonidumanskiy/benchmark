# Monster "Reaver": biomechanical hexapod (chrome carapace over dark sinew, red spikes and glowing seams).
# One rigid Part per rig joint, authored in joint-local space (model faces +Z, limbs hang along -Y).
#   blender -b -P assetgen/gen_reaver.py -- --spec assetgen/specs/reaver.json --out public/assets/gen/reaver.glb
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blib import *  # noqa

A = cli_args()
spec = load_spec(A['spec'])
SK = spec['skeleton']
reset_scene()
P = {}


def part(name):
    P[name] = Part(name)
    return P[name]


def wobble(amp, freq, seed):
    o = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    return lambda co, n: amp * (noise.noise(co * freq + o) + 0.45 * noise.noise(co * freq * 2.7 + o))


def sinew(co, n):
    # stringy muscle striation along the limb/body axis + lumps
    return 0.012 * math.sin(co.x * 90 + noise.noise(co * 6) * 4) + 0.018 * noise.noise(co * 9)


def plate(rx, ry, rz, lat=(0, 1.5), lon=(0, TAU), thick=0.018, nu=22, nv=8, power=0.9, ridge=0.0):
    bm = shell(rx, ry, rz, lat=lat, lon=lon, thick=thick, nu=nu, nv=nv, power=power)
    if ridge:
        deform(bm, lambda v: v + Vector((0, ridge * max(0.0, 1 - abs(v.x) / (rx * 0.35)) ** 2, 0)))
    return bm


# ============================================================================================== body (thorax)
b = part('body')
b.add(skin([((0, -0.02, -0.34), 0.17, 0.15), ((0, 0.0, -0.06), 0.25, 0.2), ((0, 0.02, 0.24), 0.23, 0.18), ((0, 0.03, 0.47), 0.14, 0.12)],
           [(0, 1), (1, 2), (2, 3)], subdiv=2, disp=lambda co, n: sinew(co, n) * 0.7 + wobble(0.012, 7, 1)(co, n)), 'flesh')
# carapace: one massive dorsal shield + collar + rear plate (overlapping), grooved
b.add(plate(0.31, 0.25, 0.46, lat=(0, 1.42), thick=0.03, nu=30, nv=12, power=0.78, ridge=0.05), 'shell', (0, 0.06, -0.02), (-0.12, 0, 0))
b.add(plate(0.315, 0.1, 0.465, lat=(1.2, 1.44), thick=0.016, nu=30, nv=3, power=0.78), 'shellDark', (0, 0.06, -0.02), (-0.12, 0, 0))
b.add(plate(0.25, 0.2, 0.16, lat=(0, 1.45), thick=0.026, nu=24, nv=9, power=0.8, ridge=0.04), 'shell', (0, 0.1, 0.38), (-0.45, 0, 0))
b.add(plate(0.22, 0.17, 0.15, lat=(0, 1.45), thick=0.024, nu=24, nv=9, power=0.8, ridge=0.03), 'shell', (0, 0.04, -0.4), (0.25, 0, 0))
for k in range(5):
    # transverse rib bands across the shield (segmented, mechanical read)
    zz = 0.3 - k * 0.15
    b.add(torus(0.27 - abs(k - 2) * 0.03, 0.012, 28, 5, arc=math.pi * 0.8), 'shellDark', (0, 0.07 + 0.01 * (2 - abs(k - 2)), zz), (math.pi / 2 - 0.12, 0, math.pi * 0.1), scl=(1.0, 1.0, 0.92))
for x in (-1, 1):
    # grooves + glowing slits along the shield
    b.add(tube([(0.12 * x, 0.27, 0.3), (0.17 * x, 0.25, 0.0), (0.15 * x, 0.2, -0.35)], 0.012, 6), 'glow')
    b.add(tube([(0.2 * x, 0.2, 0.32), (0.26 * x, 0.15, 0.0), (0.24 * x, 0.1, -0.32)], 0.01, 6), 'shellDark')
    # flank armour over the leg mounts
    b.add(plate(0.13, 0.12, 0.32, lat=(0.3, 1.9), lon=(-0.9, 0.9), thick=0.02, power=0.8), 'shellDark', (0.25 * x, -0.04, -0.04), (0, 0 if x > 0 else math.pi, 0.25 * x))
    for hz in (0.12, -0.22):
        b.add(sphere(0.07, 16, 12), 'flesh', (0.25 * x, -0.06, hz))
    b.add(sphere(0.06, 14, 10), 'flesh', (0.21 * x, 0.08, 0.42))
# ventral ribs
for k in range(5):
    b.add(torus(0.17 - abs(k - 2) * 0.015, 0.02, 20, 6, arc=math.pi), 'shellDark', (0, -0.1, 0.3 - k * 0.14), (0, 0, math.pi), scl=(1.2, 1.0, 0.6))
# dorsal spikes: swept-back paired blades growing out between the plates
N = spec.get('dorsalSpikes', 4)
for i in range(N):
    t = i / max(1, N - 1)
    z = 0.3 - t * 0.6
    L = 0.78 - t * 0.38
    for x in (-1, 1):
        b.add(horn(L, 0.085 - t * 0.025, -0.36, 14, 8, flat=0.85), 'spike', ((0.13 + 0.03 * t) * x, 0.24 - t * 0.05, z), (-0.12 - 0.2 * t, 0, -0.42 * x))
        b.add(cyl(0.095 - t * 0.025, 0.11 - t * 0.025, 0.06, 14, 0.008), 'shellDark', ((0.13 + 0.03 * t) * x, 0.23 - t * 0.05, z), (-0.12 - 0.2 * t, 0, -0.42 * x))
    b.add(horn(0.22 - t * 0.08, 0.035, -0.1, 8, 6), 'spike', (0, 0.31 - t * 0.05, z - 0.08), (-0.9, 0, 0))

# ============================================================================================== neck + head
n = part('neck')
n.add(skin([((0, -0.01, -0.08), 0.15, 0.13), ((0, 0.0, 0.1), 0.13, 0.11), ((0, 0.0, 0.25), 0.11, 0.1)], [(0, 1), (1, 2)], subdiv=2, disp=sinew), 'flesh')
for k in range(3):
    n.add(plate(0.15 - k * 0.012, 0.12, 0.08, lat=(0, 1.6), thick=0.016, power=0.85, ridge=0.02), 'shell', (0, 0.04, -0.03 + k * 0.1), (-0.3, 0, 0))

h = part('head')
h.add(skin([((0, 0.02, -0.08), 0.15, 0.13), ((0, 0.03, 0.1), 0.15, 0.11), ((0, -0.01, 0.28), 0.1, 0.07)], [(0, 1), (1, 2)], subdiv=2,
           disp=wobble(0.01, 9, 4)), 'flesh')
# skull plate: long armoured wedge with a central crest
h.add(plate(0.17, 0.13, 0.27, lat=(0, 1.45), thick=0.02, power=0.8, ridge=0.04), 'shell', (0, 0.04, 0.07), (-0.08, 0, 0))
h.add(plate(0.12, 0.08, 0.14, lat=(0, 1.4), thick=0.016, power=0.8, ridge=0.02), 'shell', (0, 0.0, 0.25), (-0.15, 0, 0))
h.add(box(0.03, 0.04, 0.34, 0.01), 'spike', (0, 0.17, 0.06), (-0.1, 0, 0))
# upper maw: dark gum line, teeth, glowing throat
h.add(plate(0.12, 0.05, 0.12, lat=(1.4, 2.2), lon=(0, math.pi), thick=0.012, power=0.9), 'shellDark', (0, -0.04, 0.26))
for k in range(9):
    a = (k / 8 - 0.5) * 2.2
    h.add(horn(0.07 if k % 2 else 0.1, 0.012, 0.01, 4, 5), 'teeth', (math.sin(a) * 0.1, -0.05, 0.27 + math.cos(a) * 0.08), (math.pi, 0, 0))
h.add(sphere(0.09, 14, 10, (1.0, 0.55, 1.1)), 'glow', (0, -0.08, 0.2))
for x in (-1, 1):
    # swept crown horns (signature silhouette) + cheek blades
    h.add(horn(0.55, 0.05, -0.28, 12, 7, flat=0.8), 'spike', (0.1 * x, 0.12, -0.02), (-1.25, 0, -0.42 * x))
    h.add(horn(0.32, 0.035, -0.15, 10, 6), 'spike', (0.15 * x, 0.06, 0.06), (-1.05, 0, -0.95 * x))
    h.add(horn(0.18, 0.022, -0.05, 6, 5), 'spike', (0.13 * x, -0.02, 0.18), (-0.6, 0, -1.4 * x))
    # eye cluster
    for e in range(3):
        h.add(sphere(0.026 - e * 0.005, 10, 8), 'eye', ((0.085 + e * 0.035) * x, 0.06 - e * 0.012, 0.3 - e * 0.065))
        h.add(torus(0.028 - e * 0.005, 0.006, 12, 4), 'shellDark', ((0.085 + e * 0.035) * x, 0.06 - e * 0.012, 0.3 - e * 0.065), (0.9, 0, 0.5 * x))

for side, x in (('L', 1), ('R', -1)):
    jw = part('jaw' + side)
    pts = [(0, 0, -0.04), (0.03 * x, -0.03, 0.08), (0.0, -0.05, 0.2), (-0.05 * x, -0.04, 0.27)]
    jw.add(tube(pts, [0.045, 0.04, 0.03, 0.012], 8, flat=0.7), 'shell')
    jw.add(horn(0.2, 0.025, 0.08, 8, 6), 'spike', (0.0, -0.03, 0.18), (math.pi / 2 + 0.3, 0, 1.1 * x))
    for k in range(4):
        jw.add(horn(0.05, 0.01, 0.0, 3, 5), 'teeth', ((0.01 - k * 0.012) * x, -0.03, 0.08 + k * 0.05), (0, 0, -math.pi / 2 * x))

# ============================================================================================== abdomen + tail
ab = part('abdomen')
ab.add(skin([((0, 0.0, 0.05), 0.2, 0.16), ((0, -0.03, -0.2), 0.22, 0.18), ((0, -0.06, -0.45), 0.13, 0.11)], [(0, 1), (1, 2)], subdiv=2,
            disp=lambda co, n: wobble(0.016, 6, 9)(co, n) + 0.01 * math.sin(co.z * 60)), 'flesh')
for i in range(2):
    ab.add(plate(0.25 - i * 0.04, 0.17 - i * 0.015, 0.11, lat=(0, 1.5), thick=0.02, power=0.85, ridge=0.025), 'shell', (0, 0.05 - i * 0.025, -0.02 - i * 0.13), (-0.25 - i * 0.25, 0, 0))
for x in (-1, 1):
    ab.add(tube([(0.17 * x, -0.02, 0.0), (0.2 * x, -0.06, -0.2), (0.12 * x, -0.1, -0.4)], 0.016, 6), 'glow')
tl = part('tail')
tl.add(skin([((0, 0, 0.12), 0.08), ((0, -0.02, -0.08), 0.06)], [(0, 1)], subdiv=1), 'flesh')
tl.add(horn(0.5, 0.06, -0.25, 12, 7), 'spike', (0, 0.0, 0.05), (-2.1, 0, 0))
tl.add(plate(0.09, 0.07, 0.1, lat=(0, 1.5), thick=0.014), 'shell', (0, 0.02, 0.06))

# ============================================================================================== legs
for L in SK['legs']:
    a, bl, nm, x = L['a'], L['b'], L['name'], 1
    up = part(nm + 'Upper')
    up.add(tube([(0, 0.04, 0), (0, -a * 0.3, 0.0), (0, -a * 0.7, 0.0), (0, -a, 0)], [0.075, 0.08, 0.06, 0.05], 10), 'flesh')
    # armour: long chrome greave on the outer/front face with a raised spine
    up.add(plate(0.08, a * 0.48, 0.075, lat=(0.25, 2.9), lon=(math.pi / 2 - 1.5, math.pi / 2 + 1.5), thick=0.018, nu=14, nv=12, power=0.8), 'shell', (0, -a * 0.47, 0.012))
    up.add(box(0.016, a * 0.75, 0.02, 0.006), 'shellDark', (0, -a * 0.48, 0.09))
    up.add(sphere(0.065, 14, 10), 'shellDark', (0, -a, 0))
    if spec.get('legSpikes', True):
        up.add(horn(0.26, 0.035, -0.08, 8, 6), 'spike', (0, -a * 0.95, 0.04), (0.5, 0, 0))
        up.add(horn(0.12, 0.02, -0.03, 6, 5), 'spike', (0, -a * 0.45, 0.07), (0.9, 0, 0))
    lo = part(nm + 'Lower')
    lo.add(tube([(0, 0.03, 0), (0, -bl * 0.35, 0.0), (0, -bl * 0.8, 0.0), (0, -bl * 0.98, 0)], [0.055, 0.05, 0.03, 0.018], 9), 'flesh')
    lo.add(plate(0.062, bl * 0.34, 0.06, lat=(0.2, 2.9), lon=(math.pi / 2 - 1.7, math.pi / 2 + 1.7), thick=0.014, nu=12, nv=14, power=0.8), 'shell', (0, -bl * 0.36, 0.008))
    lo.add(box(0.012, bl * 0.5, 0.016, 0.004), 'shellDark', (0, -bl * 0.36, 0.07))
    lo.add(torus(0.05, 0.012, 14, 5), 'glow', (0, -0.02, 0))
    # red talon + hook claws
    lo.add(horn(bl * 0.24, 0.032, 0.05, 8, 6), 'spike', (0, -bl * 0.78, 0.0), (math.pi, 0, 0))
    for sx in (-1, 1):
        lo.add(horn(0.1, 0.014, 0.04, 5, 5), 'spike', (0.0, -bl * 0.86, 0.0), (math.pi - 0.5, 0, 0.5 * sx))
    lo.add(horn(0.13, 0.02, -0.05, 6, 5), 'spike', (0, -bl * 0.42, 0.05), (0.8, 0, 0))

# ============================================================================================== scythe arms
ar = SK['arms']
for side in ('L', 'R'):
    au = part('armUpper' + side)
    au.add(tube([(0, 0.03, 0), (0, -ar['a'] * 0.5, 0.0), (0, -ar['a'], 0)], [0.065, 0.06, 0.05], 10), 'flesh')
    au.add(plate(0.075, ar['a'] * 0.45, 0.07, lat=(0.3, 2.85), lon=(math.pi / 2 - 1.5, math.pi / 2 + 1.5), thick=0.016, nu=12, nv=10, power=0.8), 'shell', (0, -ar['a'] * 0.48, 0.01))
    au.add(sphere(0.06, 12, 10), 'shellDark', (0, -ar['a'], 0))
    bl = part('armBlade' + side)
    bl.add(horn(ar['b'], 0.07, 0.3, 14, 8, flat=0.32), 'shell', (0, 0, 0), (math.pi, 0, 0))
    bl.add(horn(ar['b'] * 0.9, 0.03, 0.34, 14, 6, flat=0.5), 'spike', (0, -0.04, -0.035), (math.pi, 0, 0))
    bl.add(box(0.1, 0.16, 0.11, 0.03, 2), 'shellDark', (0, -0.07, 0))
    for k in range(3):
        bl.add(horn(0.08, 0.014, 0.02, 4, 5), 'spike', (0, -0.2 - k * 0.15, 0.03 + k * 0.03), (1.3, 0, 0))

# ============================================================================================== bake + export
B = spec.get('bake', {})
objs = []
for i, name in enumerate(P.keys()):
    objs.append(to_object(P[name], bake=True, ao_dist=B.get('aoDist', 0.3), rays=B.get('rays', 20), uv_scale=4.0, seed=100 + i, inset=0.01, max_edge=0.1))
tris = stats(objs)
print('REAVER tris', tris, {k: P[k].tri_count() for k in P})
export_glb(A['out'], extras={'asset': 'reaver', 'tris': tris, 'spec': spec})
print('WROTE', A['out'])
