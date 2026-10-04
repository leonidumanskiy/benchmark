# Shared Blender-side modelling library for the asset pipeline (run inside `blender -b -P <gen>.py -- ...`).
#
# Conventions
# - Everything is authored directly in GAME space: +Y up, model forward +Z, model left +X, metres.
#   Export uses export_yup=False, so glTF coordinates == game coordinates (no axis conversion anywhere).
# - A `Part` is one rigid piece: a bmesh with named material slots. A character is one Part per rig joint,
#   modelled in that joint's local frame; an environment piece is one Part (plus socket empties).
# - Material slots are *names* only (armor, accent, glow ...). The runtime binds names to PBR materials built
#   from the spec palette, so colours stay programmable without re-running Blender.
# - Baked per-vertex data in COLOR_0:  R = ambient occlusion (1 = open), G = convex edge mask, B = cavity mask,
#   A = per-part random (used for subtle tint variation). The runtime shader uses it for AO, edge wear and grime.
import bpy, bmesh, math, json, sys, os, random, zlib
from mathutils import Vector, Matrix, Euler, noise
from mathutils.bvhtree import BVHTree

TAU = math.pi * 2


# ----------------------------------------------------------------------------------------------- cli / scene
def cli_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    i = 0
    while i < len(argv):
        k = argv[i].lstrip('-')
        out[k] = argv[i + 1] if i + 1 < len(argv) else '1'
        i += 2
    return out


def load_spec(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def M(pos=(0, 0, 0), rot=(0, 0, 0), scl=1.0):
    """TRS matrix. rot = XYZ euler radians (applied X, then Y, then Z in parent frame)."""
    s = (scl, scl, scl) if isinstance(scl, (int, float)) else scl
    S = Matrix.Diagonal((s[0], s[1], s[2], 1.0))
    R = Euler(rot, 'XYZ').to_matrix().to_4x4()
    return Matrix.Translation(Vector(pos)) @ R @ S


# ----------------------------------------------------------------------------------------------- primitives (return bmesh)
def _finish(bm, sharp_deg=38.0):
    bm.normal_update()
    lim = math.radians(sharp_deg)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) != 2:
            e.smooth = True
            continue
        e.smooth = e.calc_face_angle(0.0) < lim
    return bm


def bevel(bm, width, seg=2, edges=None, profile=0.5):
    if width <= 0:
        return bm
    geom = edges if edges is not None else [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.5]
    if geom:
        bmesh.ops.bevel(bm, geom=geom, offset=width, offset_type='OFFSET', segments=seg, profile=profile,
                        affect='EDGES', clamp_overlap=True, loop_slide=True)
    return bm


def box(w, h, d, bev=0.012, seg=2, taper=(1.0, 1.0), skew=0.0):
    """Box centred at origin. taper=(sx, sz) scales the TOP face; skew shifts the top face along +Z."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        top = v.co.y > 0
        v.co.x *= w * (taper[0] if top else 1.0)
        v.co.z *= d * (taper[1] if top else 1.0)
        v.co.y *= h
        if top:
            v.co.z += skew
    bevel(bm, bev, seg)
    return _finish(bm)


def prism(pts, depth, bev=0.01, seg=2):
    """2D profile in the XY plane extruded along Z (centred)."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, -depth / 2)) for x, y in pts]
    f = bm.faces.new(vs)
    bm.normal_update()
    if f.normal.z > 0:
        f.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]:
        v.co.z += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bevel(bm, bev, seg)
    return _finish(bm)


def cyl(r_top, r_bot, h, seg=16, bev=0.006, bseg=1, cap=True):
    """Cylinder along Y, centred."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r_bot, radius2=r_top, depth=h)
    # create_cone builds along Z -> rotate to Y
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))
    if cap and bev > 0:
        ring = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.9]
        bevel(bm, bev, bseg, ring)
    return _finish(bm, 50)


def sphere(r, u=24, v=16, scl=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
    for vv in bm.verts:
        vv.co = Vector((vv.co.x * scl[0], vv.co.y * scl[1], vv.co.z * scl[2]))
    return _finish(bm, 80)


def torus(R, r, seg=24, rseg=8, arc=TAU):
    """Torus in the XZ plane (axis Y)."""
    closed = arc >= TAU - 1e-6
    n = seg if closed else seg + 1

    def f(i, j):
        a = arc * i / seg
        b = TAU * j / rseg
        c = Vector((math.cos(a), 0, math.sin(a)))
        return c * (R + r * math.cos(b)) + Vector((0, r * math.sin(b), 0))
    return grid(f, n, rseg, closed_u=closed, closed_v=True)


def grid(fn, nu, nv, closed_u=False, closed_v=False, cap_v=False):
    """Parametric surface from fn(i, j) -> Vector over an nu x nv vertex grid."""
    bm = bmesh.new()
    vs = [[bm.verts.new(fn(i, j)) for j in range(nv)] for i in range(nu)]
    iu = nu if closed_u else nu - 1
    jv = nv if closed_v else nv - 1
    for i in range(iu):
        for j in range(jv):
            a, b = vs[i][j], vs[(i + 1) % nu][j]
            c, d = vs[(i + 1) % nu][(j + 1) % nv], vs[i][(j + 1) % nv]
            try:
                bm.faces.new((a, b, c, d))
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish(bm, 60)


def lathe(profile, seg=24, arc=TAU, start=0.0):
    """Revolve [(radius, y), ...] around Y. Radius 0 points collapse."""
    closed = arc >= TAU - 1e-6
    n = seg if closed else seg + 1
    def f(i, j):
        a = start + arc * i / seg
        r, y = profile[j]
        return Vector((math.cos(a) * r, y, math.sin(a) * r))
    bm = grid(f, n, len(profile), closed_u=closed)
    return bm


def tube(points, radii, sides=8, cap=True, twist=0.0, flat=1.0):
    """Sweep a circle (optionally flattened along the frame normal) along a polyline with per-point radii."""
    P = [Vector(p) for p in points]
    n = len(P)
    if isinstance(radii, (int, float)):
        radii = [radii] * n
    tans = []
    for i in range(n):
        t = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)])
        tans.append(t.normalized())
    # parallel transport frames
    up = Vector((0, 1, 0)) if abs(tans[0].y) < 0.9 else Vector((1, 0, 0))
    nrm = tans[0].cross(up).normalized()
    frames = []
    for i in range(n):
        if i > 0:
            axis = tans[i - 1].cross(tans[i])
            if axis.length > 1e-6:
                ang = math.acos(max(-1, min(1, tans[i - 1].dot(tans[i]))))
                nrm = Matrix.Rotation(ang, 3, axis.normalized()) @ nrm
        bin_ = tans[i].cross(nrm).normalized()
        frames.append((nrm.copy(), bin_))

    def f(i, j):
        a = TAU * j / sides + twist * i / max(1, n - 1)
        N, B = frames[i]
        return P[i] + (N * math.cos(a) * flat + B * math.sin(a)) * radii[i]
    bm = grid(f, n, sides, closed_v=True)
    if cap:
        for idx in (0, n - 1):
            if radii[idx] > 1e-4:
                ring = [v for v in bm.verts if (v.co - P[idx]).length <= radii[idx] * 1.01 + 1e-5]
                edges = [e for e in bm.edges if e.verts[0] in ring and e.verts[1] in ring and len(e.link_faces) == 1]
                if len(edges) >= 3:
                    bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish(bm, 60)


def horn(length, r0, bend, seg=10, sides=7, curl_axis='z', tip=0.03, flat=1.0):
    """Tapered curved spike from origin along +Y bending towards +Z (or +X)."""
    pts, rr = [], []
    for i in range(seg + 1):
        t = i / seg
        b = bend * t * t
        p = (0, length * t, b) if curl_axis == 'z' else (b, length * t, 0)
        pts.append(p)
        rr.append(max(r0 * tip, r0 * (1 - t) ** 0.9))
    return tube(pts, rr, sides, cap=True, flat=flat)


def shell(rx, ry, rz, lat=(0.0, math.pi / 2), lon=(0, TAU), thick=0.02, nu=24, nv=10, bev=0.004, power=1.0):
    """Partial (super)ellipsoid shell. lat measured from +Y pole (0) to -Y (pi); lon around Y from +X."""
    closed = (lon[1] - lon[0]) >= TAU - 1e-6
    nU = nu if closed else nu + 1

    def f(i, j):
        u = lon[0] + (lon[1] - lon[0]) * i / nu
        v = lat[0] + (lat[1] - lat[0]) * j / (nv - 1)
        sv, cv, su, cu = math.sin(v), math.cos(v), math.sin(u), math.cos(u)
        pw = lambda x: math.copysign(abs(x) ** power, x)
        return Vector((rx * pw(sv) * pw(cu), ry * pw(cv), rz * pw(sv) * pw(su)))
    bm = grid(f, nU, nv, closed_u=closed)
    if thick > 0:
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=thick)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        rim = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 1.0]
        bevel(bm, min(bev, thick * 0.45), 1, rim)
    return _finish(bm, 50)


def skin(nodes, edges, subdiv=2, smooth=0.0, disp=None, name='skin'):
    """Organic mesh from a skin-modifier graph: nodes = [(pos, rx, rz)], edges = [(a, b)].
    disp(co, normal) -> offset along normal (applied after subdivision)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([n[0] for n in nodes], edges, [])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    sk = ob.modifiers.new('skin', 'SKIN')
    sk.use_smooth_shade = True
    for i, n in enumerate(nodes):
        sv = me.skin_vertices[0].data[i]
        sv.radius = (n[1], n[2] if len(n) > 2 else n[1])
    me.skin_vertices[0].data[0].use_root = True
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = subdiv
    sub.render_levels = subdiv
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    bm = bmesh.new()
    bm.from_mesh(ev.to_mesh())
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    bm.normal_update()
    if disp:
        offs = [disp(v.co.copy(), v.normal.copy()) for v in bm.verts]
        for v, o in zip(bm.verts, offs):
            v.co += v.normal * o
    if smooth > 0:
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=smooth, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    return _finish(bm, 70)


def subdivide(bm, levels=1):
    """Catmull-Clark via the subsurf modifier on a temp object."""
    me = bpy.data.meshes.new('sd')
    bm.to_mesh(me)
    ob = bpy.data.objects.new('sd', me)
    bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new('s', 'SUBSURF'); m.levels = levels
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    out = bmesh.new(); out.from_mesh(ev.to_mesh()); ev.to_mesh_clear()
    bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    return _finish(out, 60)


def displace(bm, fn):
    bm.normal_update()
    offs = [fn(v.co.copy(), v.normal.copy()) for v in bm.verts]
    for v, o in zip(bm.verts, offs):
        v.co += v.normal * o
    bm.normal_update()
    return bm


def deform(bm, fn):
    for v in bm.verts:
        v.co = fn(v.co.copy())
    bm.normal_update()
    return bm


def text_mesh(s, size=0.1, depth=0.004, font_bold=True):
    cu = bpy.data.curves.new('txt', 'FONT')
    cu.body = s
    cu.size = size
    cu.extrude = depth
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    ob = bpy.data.objects.new('txt', cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    bm = bmesh.new(); bm.from_mesh(ev.to_mesh()); ev.to_mesh_clear()
    bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
    # font is in XY facing +Z already
    return _finish(bm, 30)


def rock(r, seed, detail=4, flat=0.25, strata=0.0, sharp=0.6):
    """Chiselled rock: icosphere + layered noise + optional strata + planar cuts flattened."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=r)
    rnd = random.Random(seed)
    off = Vector((rnd.uniform(-50, 50), rnd.uniform(-50, 50), rnd.uniform(-50, 50)))
    cuts = []
    for _ in range(rnd.randint(4, 7)):
        n = Vector((rnd.uniform(-1, 1), rnd.uniform(-0.3, 1), rnd.uniform(-1, 1))).normalized()
        cuts.append((n, r * rnd.uniform(0.62, 0.86)))
    for v in bm.verts:
        n = v.co.normalized()
        p = n * 1.3 + off
        d = 1 + 0.22 * noise.noise(p) + 0.1 * noise.noise(p * 2.7) + 0.04 * noise.noise(p * 7.0)
        if strata > 0:
            d += strata * 0.04 * math.sin(n.y * 38 + noise.noise(p * 3) * 3)
        co = n * r * d
        # planar facets (chiselled)
        for cn, cd in cuts:
            h = co.dot(cn)
            if h > cd:
                co -= cn * (h - cd) * sharp
        if co.y < -r * flat:
            co.y = -r * flat + (co.y + r * flat) * 0.25
        v.co = co
    return _finish(bm, 45)


# ----------------------------------------------------------------------------------------------- parts
class Part:
    """One rigid piece: geometry + named material slots (+ optional sockets)."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.slots = []
        self.sockets = []  # (name, pos, extras)

    def slot(self, s):
        if s not in self.slots:
            self.slots.append(s)
        return self.slots.index(s)

    def add(self, src, slot, pos=(0, 0, 0), rot=(0, 0, 0), scl=1.0, mirror_x=False, mat=None):
        T = mat if mat is not None else M(pos, rot, scl)
        if mirror_x:
            T = Matrix.Diagonal((-1, 1, 1, 1)) @ T
        me = bpy.data.meshes.new('tmp')
        src.to_mesh(me)
        me.transform(T)
        if T.determinant() < 0:
            me.flip_normals()
        nf = len(self.bm.faces)
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        self.bm.faces.ensure_lookup_table()
        mi = self.slot(slot)
        for f in self.bm.faces[nf:]:
            f.material_index = mi
        return self

    def sym(self, src, slot, pos, rot=(0, 0, 0), scl=1.0):
        """Add at pos and mirrored across X=0."""
        self.add(src, slot, pos, rot, scl)
        self.add(src, slot, pos, rot, scl, mirror_x=True)
        return self

    def socket(self, name, pos, **extras):
        self.sockets.append((name, tuple(pos), extras))
        return self

    def tri_count(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)


# ----------------------------------------------------------------------------------------------- baking
def _hemi_dirs(k, seed=7):
    rnd = random.Random(seed)
    out = []
    for i in range(k):
        # cosine-weighted, stratified
        u = (i + rnd.random()) / k
        v = rnd.random()
        r = math.sqrt(u)
        a = TAU * v
        out.append((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1 - u))))
    return out


def bake_vertex_data(bm, ao_dist=0.25, rays=20, occluders=None, edge_gain=3.0, seed=1, ground=None):
    """Return per-vertex (ao, edge, cavity) using BVH ray casts (self + optional occluder bmeshes)."""
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    trees = [BVHTree.FromBMesh(bm)]
    for o in occluders or []:
        trees.append(BVHTree.FromBMesh(o))
    dirs = _hemi_dirs(rays, seed)
    ao = []
    for v in bm.verts:
        n = v.normal
        if n.length < 0.5:
            ao.append(1.0)
            continue
        t = n.orthogonal().normalized()
        b = n.cross(t)
        o = v.co + n * 0.002
        occ = 0.0
        for dx, dy, dz in dirs:
            d = t * dx + b * dy + n * dz
            best = None
            for tr in trees:
                hit = tr.ray_cast(o, d, ao_dist)
                if hit[0] is not None and (best is None or hit[3] < best):
                    best = hit[3]
            if ground is not None and d.y < -1e-3:
                dist = (ground - o.y) / d.y
                if 0 < dist < ao_dist and (best is None or dist < best):
                    best = dist
            if best is not None:
                occ += 1.0 - (best / ao_dist) ** 0.5 * 0.6
        ao.append(max(0.0, 1.0 - occ / len(dirs)))
    # edge/cavity masks from curvature = signed dihedral angle / adjacent face width (rad per metre):
    # narrow bevel rims and small hard details light up, broad facets of rocks/cylinders stay clean
    edge = [0.0] * len(bm.verts)
    cav = [0.0] * len(bm.verts)
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        ang = e.calc_face_angle_signed(0.0)
        L = max(e.calc_length(), 1e-5)
        w = max(1e-4, min(f.calc_area() / L for f in e.link_faces))
        k = abs(ang) / max(w, 0.004)
        val = max(0.0, min(1.0, (k - 10.0) / 30.0)) * max(0.0, min(1.0, (abs(ang) - 0.12) / 0.3))
        tgt = edge if ang > 0 else cav
        for v in e.verts:
            tgt[v.index] = max(tgt[v.index], val)
    def blur(arr, k=0.5):
        out = []
        for v in bm.verts:
            acc, c = 0.0, 0
            for e in v.link_edges:
                acc += arr[e.other_vert(v).index]; c += 1
            out.append(arr[v.index] * (1 - k) + (acc / c if c else arr[v.index]) * k)
        return out
    edge = blur(edge, 0.35)
    cav = blur(cav, 0.5)
    return ao, edge, cav


def box_uv(bm, scale=1.0):
    """World-scale box projection UVs (1 unit = 1 m * scale) for tiling detail maps."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            c = l.vert.co
            if ax == 0:
                l[uv].uv = (c.z * scale * (1 if n.x > 0 else -1), c.y * scale)
            elif ax == 1:
                l[uv].uv = (c.x * scale, c.z * scale * (1 if n.y > 0 else -1))
            else:
                l[uv].uv = (c.x * scale * (-1 if n.z > 0 else 1), c.y * scale)


_MAT_COLORS = {}


def material(slot):
    m = bpy.data.materials.get(slot)
    if m is None:
        m = bpy.data.materials.new(slot)
        m.use_nodes = True
        h = (zlib.crc32(slot.encode()) % 1000) / 1000.0
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        if bsdf:
            bsdf.inputs['Base Color'].default_value = (0.3 + 0.4 * h, 0.3, 0.35, 1)
    return m


def mask_support(bm, inset=0.02, max_edge=0.25):
    """Give flat faces interior vertices so per-vertex edge/AO masks have somewhere to fall off:
    inset broad planar faces by roughly a wear-band width, then split long edges."""
    bm.normal_update()
    big = [f for f in bm.faces if len(f.verts) >= 4 and f.calc_area() > (inset * 7) ** 2]
    if big:
        bmesh.ops.inset_individual(bm, faces=big, thickness=inset, depth=0.0, use_even_offset=True, use_relative_offset=False)
    for _ in range(3):
        long_e = [e for e in bm.edges if e.calc_length() > max_edge and all(len(f.verts) == 4 for f in e.link_faces)]
        if not long_e:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_e, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.normal_update()
    return bm


def to_object(part, bake=True, ao_dist=0.25, rays=20, occluders=None, uv_scale=1.0, ground=None, seed=1, collection=None, inset=0.02, max_edge=0.25):
    bm = part.bm
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    if bake and inset > 0:
        mask_support(bm, inset, max_edge)
    bm.normal_update()
    box_uv(bm, uv_scale)
    me = bpy.data.meshes.new(part.name)
    if bake:
        ao, edge, cav = bake_vertex_data(bm, ao_dist, rays, occluders, seed=seed, ground=ground)
    bm.to_mesh(me)
    if bake:
        attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
        rnd = random.Random(seed)
        tint = rnd.random()
        for i in range(len(me.vertices)):
            attr.data[i].color = (ao[i], edge[i], cav[i], tint)
        me.color_attributes.active_color = attr
        me.color_attributes.render_color_index = 0
    for s in part.slots:
        me.materials.append(material(s))
    ob = bpy.data.objects.new(part.name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    for name, pos, extras in part.sockets:
        e = bpy.data.objects.new(name, None)
        e.empty_display_size = 0.05
        e.location = pos
        for k, v in extras.items():
            e[k] = v
        (collection or bpy.context.scene.collection).objects.link(e)
        e.parent = ob
    return ob


def export_glb(path, extras=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if extras:
        for k, v in extras.items():
            bpy.context.scene[k] = json.dumps(v) if isinstance(v, (dict, list)) else v
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_yup=False, export_apply=True,
        export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_normals=True,
        export_materials='EXPORT', export_extras=True, export_image_format='NONE',
        export_texcoords=True, export_tangents=False, export_animations=False, export_skins=False,
        export_morph=False, export_cameras=False, export_lights=False,
    )


def stats(objs):
    tris = 0
    for o in objs:
        if o.type == 'MESH':
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    return tris
