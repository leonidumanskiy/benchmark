# Seamless tileable floor material for the HD environment: high-poly deck plates, grates, hatches and bolts laid out
# on a 4x4 m tile and baked onto a plane (albedo / ORM / normal). The game repeats it over the arena.
# Usage: blender -b -P build_floor.py -- assets-src/specs/envkit.json public/assets/hd/floor.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

spec_path, out = lib.args()[:2]
S = lib.load_spec(spec_path)
F = S['floor']
lib.reset_scene()
A = lib.Asset(S['name'] + '_floor', S['slots'], S['seed'] + 1)
rng = A.rng
E = F['extent']  # tile size (m), seamless
N = F.get('cells', 4)
t = 0.06
cell = E / N
bag = [k for k, n in F['mix'].items() for _ in range(n)]
rng.shuffle(bag)
for ix in range(N):
    for iz in range(N):
        cx, cz = -E / 2 + cell * (ix + 0.5), -E / 2 + cell * (iz + 0.5)
        kind = bag[(ix * N + iz) % len(bag)]
        rot = rng.randrange(4) * math.pi / 2

        def P(dx, dz):  # cell-local offset, rotated
            c, s_ = math.cos(rot), math.sin(rot)
            return (cx + dx * c + dz * s_, cz - dx * s_ + dz * c)
        A.box('deck', (cell - 0.02, t, cell - 0.02), 'trim', pos=(cx, -t / 2, cz), bevel=0.012)
        if kind == 'plates':
            for x in (-1, 1):
                for z in (-1, 1):
                    px, pz = P(x * cell / 4, z * cell / 4)
                    A.box('deck', (cell / 2 - 0.07, t, cell / 2 - 0.07), 'floor', pos=(px, -t / 2 + 0.012, pz), bevel=0.018)
            A.box('deck', (0.36, t, 0.36), 'floorGrate', pos=(cx, -t / 2 + 0.014, cz), bevel=0.012)
        elif kind == 'grate':
            px, pz = P(-cell * 0.25 + 0.02, 0)
            A.box('deck', (cell * 0.46, t, cell - 0.16), 'floorGrate', pos=(px, -t / 2 + 0.008, pz), rot=(0, rot, 0), bevel=0.01)
            px, pz = P(cell * 0.25 - 0.02, 0)
            A.box('deck', (cell * 0.46, t, cell - 0.16), 'floor', pos=(px, -t / 2 + 0.012, pz), rot=(0, rot, 0), bevel=0.018)
            A.box('deck', (0.07, t, cell - 0.16), 'hazard', pos=(cx, -t / 2 + 0.008, cz), rot=(0, rot, 0), bevel=0.006)
        elif kind == 'hatch':
            A.box('deck', (cell - 0.12, t, cell - 0.12), 'floor', pos=(cx, -t / 2 + 0.01, cz), bevel=0.02)
            A.cyl('deck', 0.62, 0.62, t, 'panelDark', pos=(cx, -t / 2 + 0.016, cz), seg=40, bevel=0.015)
            A.cyl('deck', 0.5, 0.5, t, 'floorGrate', pos=(cx, -t / 2 + 0.02, cz), seg=40, bevel=0.01)
            for k in range(8):
                a = k / 8 * 2 * math.pi
                A.cyl('deck', 0.03, 0.03, t, 'trim', pos=(cx + math.sin(a) * 0.56, -t / 2 + 0.024, cz + math.cos(a) * 0.56), seg=10, bevel=0.006)
        elif kind == 'worn':  # cracked concrete slab
            A.box('deck', (cell - 0.06, t, cell - 0.06), 'concrete', pos=(cx, -t / 2 + 0.008, cz), bevel=0.02)
            for k in range(5):
                A.box('deck', (rng.uniform(0.3, 0.9), t, 0.012), 'trim', pos=(cx + rng.uniform(-0.6, 0.6), -t / 2 + 0.006, cz + rng.uniform(-0.6, 0.6)), rot=(0, rng.uniform(0, 3.1), 0), bevel=0)
        else:  # plain plate with bolt rows and a seam
            A.box('deck', (cell - 0.08, t, cell - 0.08), 'floor', pos=(cx, -t / 2 + 0.01, cz), bevel=0.02)
            px, pz = P(0, cell * 0.3)
            A.box('deck', (cell - 0.2, t, 0.03), 'trim', pos=(px, -t / 2 + 0.008, pz), rot=(0, rot, 0), bevel=0.006)
A.join_parts()
info = lib.bake_tileable(A, os.path.abspath(out), E, size=F.get('size', 2048), samples=S.get('samples', 12))
info['spec'] = os.path.basename(spec_path)
lib.write_report(os.path.abspath(out), info)
print('ASSET_INFO', info)
