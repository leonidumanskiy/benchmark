# HD environment kit: small set of modular sci-fi outpost pieces that the game fits onto the gameplay obstacle
# footprints (src/assets/hd/envkit.ts). Each module is one GLB node; origin at floor centre, length +X, front +Z.
# Usage: blender -b -P build_envkit.py -- assets-src/specs/envkit.json public/assets/hd/envkit.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
import bpy

spec_path, out = lib.args()[:2]
S = lib.load_spec(spec_path)
MOD = S['modules']
lib.reset_scene()
A = lib.Asset(S['name'], S['slots'], S['seed'])
rng = A.rng


def rnd(a, b):
    return a + (b - a) * rng.random()


# =========================================================================================== walls (2.0 x 2.6 x 0.8)
L, H, D = MOD['wall']


def wall_frame(P):
    A.box(P, (L, 0.22, D + 0.12), 'trim', pos=(0, 0.11, 0), bevel=0.02)  # plinth
    A.box(P, (L, 0.12, D + 0.06), 'panelDark', pos=(0, H - 0.06, 0), bevel=0.025)  # cap
    for x in (-1, 1):  # end posts (shared by neighbours when tiled)
        A.box(P, (0.16, H, D + 0.1), 'trim', pos=(x * (L / 2 - 0.08), H / 2, 0), bevel=0.02)
        A.box(P, (0.06, H * 0.9, 0.02), 'hazard', pos=(x * (L / 2 - 0.08), H * 0.47, D / 2 + 0.06), bevel=0.005)


def wall_a():
    P = 'wall_a'
    wall_frame(P)
    A.box(P, (L - 0.3, H - 0.34, D), 'panel', pos=(0, H / 2 + 0.05, 0), bevel=0.03, seg=2)
    for z in (-1, 1):
        for i, (y, h) in enumerate(((0.75, 0.7), (1.65, 0.8))):
            A.box(P, (L * 0.36, h, 0.06), 'panelDark', pos=(-L * 0.2, y, z * (D / 2 + 0.01)), bevel=0.02)
            A.box(P, (L * 0.3, h, 0.06), 'panelDark' if i else 'panel', pos=(L * 0.22, y, z * (D / 2 + 0.01)), bevel=0.02)
        A.box(P, (0.5, 0.3, 0.04), 'grate', pos=(L * 0.22, 0.6, z * (D / 2 + 0.04)), bevel=0.01)
        A.cyl(P, 0.07, 0.07, L - 0.32, 'pipe', pos=(0, 0.42, z * (D / 2 + 0.11)), rot=(0, 0, math.pi / 2), seg=12, bevel=0.01)
        for x in (-0.6, 0.6):
            A.box(P, (0.06, 0.2, 0.16), 'trim', pos=(x, 0.42, z * (D / 2 + 0.07)), bevel=0.01)
        A.box(P, (0.14, 0.2, 0.08), 'trim', pos=(-L * 0.2, 2.05, z * (D / 2 + 0.04)), bevel=0.012)  # junction box
        A.box(P, (0.1, 0.04, 0.02), 'screen', pos=(-L * 0.2, 2.1, z * (D / 2 + 0.085)), bevel=0.004)
    # conduit on top
    A.cyl(P, 0.05, 0.05, L, 'rubber', pos=(0.1, H + 0.05, 0.12), rot=(0, 0, math.pi / 2), seg=8, bevel=0)
    A.cyl(P, 0.035, 0.035, L, 'pipe', pos=(0.1, H + 0.04, -0.12), rot=(0, 0, math.pi / 2), seg=8, bevel=0)


def wall_b():
    P = 'wall_b'
    wall_frame(P)
    # stacked cargo blocks look
    A.box(P, (L - 0.3, 1.2, D), 'panelRed', pos=(0, 0.82, 0), bevel=0.035, seg=2)
    A.box(P, (L - 0.36, 1.1, D - 0.06), 'panel', pos=(0, 1.95, 0), bevel=0.035, seg=2)
    for z in (-1, 1):
        for i in range(5):
            A.box(P, (0.05, 1.0, 0.04), 'trim', pos=(-0.7 + i * 0.35, 0.82, z * (D / 2 + 0.01)), bevel=0.01)  # corrugation
        A.box(P, (1.2, 0.08, 0.03), 'hazard', pos=(0, 1.36, z * (D / 2 + 0.01)), bevel=0.006)
        A.box(P, (0.4, 0.5, 0.05), 'grate', pos=(0.45, 2.0, z * (D / 2 - 0.01)), bevel=0.01)
        A.box(P, (0.06, 0.1, 0.03), 'lampAmber', pos=(-0.5, 2.25, z * (D / 2 + 0.0)), bevel=0.006)
        # hanging cables
        A.tube(P, [(-0.8, 2.4, z * (D / 2 + 0.03)), (-0.4, 2.0, z * (D / 2 + 0.08)), (0.1, 2.35, z * (D / 2 + 0.03))], 0.025, 'rubber', rseg=6, tip=False)


def wall_c():
    P = 'wall_c'  # damaged: broken bulkhead with exposed rebar and rubble
    A.box(P, (L, 0.22, D + 0.12), 'trim', pos=(0, 0.11, 0), bevel=0.02)
    pts = [(-L / 2 + 0.05, 0.2), (L / 2 - 0.05, 0.2), (L / 2 - 0.05, H * 0.82), (L * 0.3, H * 0.95), (L * 0.12, H * 0.66), (-L * 0.1, H * 0.74), (-L * 0.28, H * 0.52), (-L / 2 + 0.05, H * 0.9)]
    A.prism(P, pts, D, 'concrete', bevel=0.02)
    for x in (-1, 1):
        A.box(P, (0.16, H * (0.92 if x < 0 else 0.84), D + 0.1), 'trim', pos=(x * (L / 2 - 0.08), H * (0.46 if x < 0 else 0.42), 0), bevel=0.02)
    for z in (-1, 1):
        A.box(P, (L * 0.4, 0.8, 0.05), 'panelDark', pos=(L * 0.2, 0.75, z * (D / 2 + 0.01)), rot=(0, 0, 0.04), bevel=0.02)
        A.box(P, (L * 0.3, 0.5, 0.05), 'panel', pos=(-L * 0.25, 0.6, z * (D / 2 + 0.01)), rot=(0, 0, -0.06), bevel=0.02)
    for i in range(7):
        x = rnd(-0.6, 0.4)
        A.cyl(P, 0.012, 0.012, rnd(0.3, 0.6), 'rust', pos=(x, H * 0.6 + rnd(0, 0.2), rnd(-0.25, 0.25)), rot=(rnd(-0.5, 0.5), 0, rnd(-0.5, 0.5)), seg=5, bevel=0)
    for i in range(9):
        r = rnd(0.08, 0.2)
        A.custom(P, lambda bm, r=r: __import__('bmesh').ops.create_icosphere(bm, subdivisions=1, radius=r), 'concrete',
                 pos=(rnd(-0.9, 0.9), r * 0.4, (1 if i % 2 else -1) * rnd(D / 2 + 0.1, D / 2 + 0.4)), rot=(rnd(0, 3), rnd(0, 3), 0), smooth=None)


# =========================================================================================== barricade (1.2 x 1.15 x 0.9)
def barricade():
    P = 'barricade'
    l, h, d = MOD['barricade']
    pd, top = d / 2, h - 0.1
    A.box(P, (l, 0.12, d + 0.14), 'trim', pos=(0, 0.06, 0), bevel=0.015)
    prof = [(-pd, 0.12), (pd, 0.12), (pd * 0.98, top * 0.55), (pd * 0.62, top), (-pd * 0.62, top), (-pd * 0.98, top * 0.55)]
    A.prism(P, prof, l - 0.04, 'panel', rot=(0, math.pi / 2, 0), bevel=0.02)
    A.box(P, (l, 0.07, d * 0.58), 'panelDark', pos=(0, top + 0.03, 0), bevel=0.015)
    A.box(P, (l - 0.1, 0.03, d * 0.2), 'trim', pos=(0, top + 0.075, 0), bevel=0.006)
    for z in (-1, 1):
        A.box(P, (l * 0.44, top * 0.42, 0.05), 'panelDark', pos=(-l * 0.24, top * 0.34, z * pd), bevel=0.015)
        A.box(P, (l * 0.44, top * 0.42, 0.05), 'panelRed' if z > 0 else 'panelDark', pos=(l * 0.24, top * 0.34, z * pd), bevel=0.015)
        A.box(P, (0.05, top * 0.85, 0.07), 'trim', pos=(0, top * 0.45, z * pd * 0.92), bevel=0.01)
        A.box(P, (l * 0.86, 0.03, 0.025), 'lampCyan', pos=(0, top * 0.68, z * (pd * 0.82 + 0.01)), rot=(z * 0.55, 0, 0), bevel=0.004)
        for x in (-0.45, 0.45):
            A.cyl(P, 0.018, 0.018, 0.02, 'pipe', pos=(x, top * 0.53, z * (pd + 0.02)), rot=(math.pi / 2, 0, 0), seg=8, bevel=0)
    A.box(P, (0.3, 0.16, 0.06), 'trim', pos=(l * 0.25, top * 0.6, pd + 0.02), bevel=0.01)
    A.box(P, (0.22, 0.09, 0.01), 'screen', pos=(l * 0.25, top * 0.6, pd + 0.055), bevel=0.002)


def barricade_end():
    P = 'barricade_end'  # end cap: hazard-striped bumper post (placed at both ends, faces +X)
    l, h, d = MOD['barricade']
    A.box(P, (0.14, h * 0.85, d * 0.86), 'hazard', pos=(0.0, h * 0.45, 0), bevel=0.03, seg=2)
    A.box(P, (0.16, 0.1, d * 0.9), 'trim', pos=(0.0, h * 0.88, 0), bevel=0.02)
    A.cyl(P, 0.05, 0.05, 0.06, 'lampAmber', pos=(0.0, h * 0.95, 0), seg=10, bevel=0.005)


# =========================================================================================== gate barricade (lair)
def gate():
    P = 'gate'
    l, h, d = MOD['gate']
    A.box(P, (l, 0.15, d + 0.2), 'trim', pos=(0, 0.075, 0), bevel=0.02)
    A.box(P, (l - 0.06, h - 0.15, d), 'panelRed', pos=(0, 0.075 + (h - 0.15) / 2, 0), bevel=0.04, seg=2)
    for z in (-1, 1):
        for x in (-l / 2 + 0.05, 0, l / 2 - 0.05):
            A.box(P, (0.1, h * 0.95, 0.09), 'trim', pos=(x, h * 0.48, z * (d / 2 + 0.035)), bevel=0.015)
        A.box(P, (l, 0.14, 0.04), 'hazard', pos=(0, h - 0.25, z * (d / 2 + 0.03)), bevel=0.008)
        A.box(P, (l * 0.36, 0.5, 0.04), 'grate', pos=(-l * 0.22, h * 0.42, z * (d / 2 + 0.01)), bevel=0.01)
        A.box(P, (l * 0.36, 0.5, 0.04), 'panelDark', pos=(l * 0.22, h * 0.42, z * (d / 2 + 0.01)), bevel=0.015)
    for i in range(4):  # spikes
        A.cyl(P, 0.045, 0.002, 0.32, 'rust', pos=(-l / 2 + 0.18 + i * (l - 0.36) / 3, h + 0.14, rnd(-0.1, 0.1)), rot=(rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3)), seg=6, bevel=0)
    A.cyl(P, 0.05, 0.05, l, 'pipe', pos=(0, h + 0.02, 0.25), rot=(0, 0, math.pi / 2), seg=10, bevel=0)


# =========================================================================================== crates
def crate(P, body):
    w, h, d = MOD['crate']
    A.box(P, (w - 0.06, h - 0.04, d - 0.06), body, pos=(0, h / 2, 0), bevel=0.02)
    e = 0.08
    for x in (-1, 1):
        for z in (-1, 1):
            A.box(P, (e, h, e), 'trim', pos=(x * (w / 2 - e / 2), h / 2, z * (d / 2 - e / 2)), bevel=0.012)
    for y in (e / 2, h - e / 2):
        for z in (-1, 1):
            A.box(P, (w, e, e), 'trim', pos=(0, y, z * (d / 2 - e / 2)), bevel=0.012)
        for x in (-1, 1):
            A.box(P, (e, e, d), 'trim', pos=(x * (w / 2 - e / 2), y, 0), bevel=0.012)
    for z in (-1, 1):
        A.box(P, (0.05, h - 0.16, 0.03), 'trim', pos=(0, h / 2, z * (d / 2 - 0.01)), rot=(0, 0, 0.78), bevel=0.008)
        A.box(P, (w * 0.86, 0.06, 0.03), 'hazard', pos=(0, h * 0.18, z * (d / 2 + 0.0)), bevel=0.006)
    A.box(P, (0.18, 0.06, 0.02), 'lampAmber', pos=(w * 0.25, h * 0.78, d / 2 - 0.0), bevel=0.004)
    A.box(P, (w * 0.5, 0.05, d * 0.5), 'panelDark', pos=(0, h + 0.015, 0), bevel=0.012)
    A.box(P, (0.2, 0.05, 0.12), 'grate', pos=(-w * 0.2, h + 0.03, 0.1), bevel=0.006)


# =========================================================================================== pylon (pillar)
def pylon():
    P = 'pylon'
    w, h, d = MOD['pylon']
    A.box(P, (w * 1.0, 0.3, d * 1.0), 'concrete', pos=(0, 0.15, 0), bevel=0.04)
    A.cyl(P, 0.48, 0.44, h - 0.3, 'panelDark', pos=(0, 0.3 + (h - 0.3) / 2, 0), seg=8, bevel=0.03)
    for i in range(8):
        a = i / 8 * 2 * math.pi + math.pi / 8
        A.box(P, (0.06, h - 0.5, 0.06), 'trim', pos=(math.sin(a) * 0.45, 0.3 + (h - 0.5) / 2, math.cos(a) * 0.45), rot=(0, a, 0), bevel=0.01)
    A.cyl(P, 0.5, 0.5, 0.14, 'trim', pos=(0, h * 0.35, 0), seg=16, bevel=0.015)
    A.cyl(P, 0.505, 0.505, 0.05, 'lampAmber', pos=(0, h * 0.35 + 0.085, 0), seg=16, bevel=0)
    A.cyl(P, 0.5, 0.5, 0.06, 'hazard', pos=(0, 0.42, 0), seg=16, bevel=0.01)
    A.cyl(P, 0.52, 0.46, 0.16, 'panel', pos=(0, h - 0.08, 0), seg=8, bevel=0.02)
    for i in range(3):
        a = i * 2.1
        A.tube(P, [(math.sin(a) * 0.47, h - 0.2, math.cos(a) * 0.47), (math.sin(a) * 0.58, h * 0.6, math.cos(a) * 0.58), (math.sin(a) * 0.62, 0.32, math.cos(a) * 0.62)], 0.03, 'rubber', rseg=6, tip=False)


# =========================================================================================== rocks
def rock(P, seed):
    def disp(ob):
        t = bpy.data.textures.new(f'{P}_tex', 'VORONOI'); t.noise_scale = 0.55; t.distance_metric = 'DISTANCE'
        md = ob.modifiers.new('d1', 'DISPLACE'); md.texture = t; md.strength = 0.35; md.mid_level = 0.5; md.texture_coords = 'LOCAL'
        t2 = bpy.data.textures.new(f'{P}_tex2', 'CLOUDS'); t2.noise_scale = 0.25; t2.noise_depth = 3
        md2 = ob.modifiers.new('d2', 'DISPLACE'); md2.texture = t2; md2.strength = 0.12; md2.texture_coords = 'LOCAL'
        dec = ob.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.7
    import bmesh
    from mathutils import Vector
    def build(bm):
        bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
        import random
        r = random.Random(seed)
        o = [r.random() * 10 for _ in range(3)]
        for v in bm.verts:
            n = v.co.normalized()
            k = 1 + 0.16 * math.sin(n.x * 2.3 + o[0]) * math.cos(n.z * 2.1 + o[1]) + 0.08 * math.sin(n.y * 5 + o[2])
            v.co = n * k
            if v.co.y < -0.15:
                v.co.y = -0.15 + (v.co.y + 0.15) * 0.25
            v.co.y = v.co.y * 0.7 + 0.12
            # strata: terraces
            v.co.y = math.floor(v.co.y * 9) / 9 * 0.4 + v.co.y * 0.6
    A.custom(P, build, 'rock', scl=(1.0, 1.0, 1.0), mods=[disp], smooth=0.5)


# =========================================================================================== props
def barrel():
    P = 'barrel'
    A.lathe(P, [(0, 0), (0.28, 0), (0.3, 0.03), (0.3, 0.86), (0.28, 0.9), (0.22, 0.9), (0.22, 0.88), (0, 0.88)], 'panelRed', seg=20, bevel=(0.004, 1))
    for y in (0.28, 0.6):
        A.torus(P, 0.305, 0.018, 'trim', pos=(0, y, 0), seg=20, rseg=6)
    A.cyl(P, 0.06, 0.06, 0.03, 'trim', pos=(0.12, 0.9, 0), seg=10, bevel=0)
    A.box(P, (0.2, 0.06, 0.02), 'hazard', pos=(0, 0.45, 0.3), bevel=0.004)


def lamp(P, slot):
    A.box(P, (0.24, 0.14, 0.1), 'trim', pos=(0, 0, -0.03), bevel=0.02)
    A.box(P, (0.16, 0.07, 0.05), slot, pos=(0, 0, 0.03), bevel=0.012)
    for x in (-1, 1):
        A.box(P, (0.02, 0.12, 0.08), 'trim', pos=(x * 0.08, 0, 0.03), bevel=0.004)


def floor_tile(P, grate):
    w, t, d = MOD['floor']
    A.box(P, (w - 0.02, t, d - 0.02), 'trim', pos=(0, -t / 2, 0), bevel=0.01)
    if grate:
        A.box(P, (w * 0.46, t, d - 0.16), 'floorGrate', pos=(-w * 0.25 + 0.02, -t / 2 + 0.008, 0), bevel=0.01)
        A.box(P, (w * 0.46, t, d - 0.16), 'floor', pos=(w * 0.25 - 0.02, -t / 2 + 0.01, 0), bevel=0.015)
        A.box(P, (0.06, t, d - 0.16), 'hazard', pos=(0, -t / 2 + 0.006, 0), bevel=0.006)
    else:
        for x in (-1, 1):
            for z in (-1, 1):
                A.box(P, (w / 2 - 0.08, t, d / 2 - 0.08), 'floor', pos=(x * w / 4, -t / 2 + 0.01, z * d / 4), bevel=0.015)
        A.box(P, (0.4, t, 0.4), 'floorGrate', pos=(0, -t / 2 + 0.012, 0), bevel=0.01)


wall_a(); wall_b(); wall_c(); barricade(); barricade_end(); gate()
crate('crate_a', 'panel'); crate('crate_b', 'panelRed'); pylon()
rock('rock_a', 3); rock('rock_b', 8); barrel()
lamp('lamp_red', 'lampRed'); lamp('lamp_cyan', 'lampCyan'); lamp('lamp_amber', 'lampAmber')

# spread modules apart while baking (independent AO)
names = list(A.parts.keys())
for i, n in enumerate(names):
    A.place(n, lib.trs(((i % 5) * 5.0, 0, (i // 5) * 5.0)))
A.join_parts()
info = lib.bake_and_export(A, os.path.abspath(out), size=S.get('atlas', 2048), samples=S.get('samples', 12))
info['spec'] = os.path.basename(spec_path)
info['modules'] = names
lib.write_report(os.path.abspath(out), info)
print('ASSET_INFO', info)
