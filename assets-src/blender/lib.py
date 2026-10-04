# Asset pipeline core (runs inside headless Blender: `blender -b -P <script> -- <spec.json> <out.glb>`).
#
# Model in the GAME's coordinate frame (three.js: +Y up, model faces +Z), one mesh per rig joint,
# each part in that joint's local space. Every piece gets a palette "slot" material. Finalisation:
#   1. join pieces per joint (keeps one material per slot)
#   2. shared UV atlas for the whole asset (smart project + average scale + pack)
#   3. Cycles bakes: base colour (palette x AO x edge wear x grime x decals), ORM (AO/roughness/metal), tangent normals
#      (bevel-rounded edges + procedural micro detail)
#   4. export GLB (+Y up) with per-slot materials that share the baked atlas
# Everything is driven by the spec JSON and a seed: rerunning the script reproduces the asset.
import bpy, bmesh, json, math, sys, os, random, hashlib
from mathutils import Matrix, Vector, Euler

# ------------------------------------------------------------------------------------------- args / spec
def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return a

def load_spec(path):
    with open(path) as f:
        return json.load(f)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.objects):
        for x in list(c):
            c.remove(x)

def hex_rgb(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return lin

# ------------------------------------------------------------------------------------------- transforms (three.js convention)
def trs(pos=(0, 0, 0), rot=(0, 0, 0), scl=1.0):
    """three.js Object3D matrix: T * R(Euler 'XYZ' => Rx*Ry*Rz) * S, all in game (Y-up) coordinates."""
    if isinstance(scl, (int, float)):
        scl = (scl, scl, scl)
    R = Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[2], 4, 'Z')
    S = Matrix.Diagonal((scl[0], scl[1], scl[2], 1.0))
    return Matrix.Translation(Vector(pos)) @ R @ S

def look_rot(direction, up=(0, 1, 0)):
    """Rotation matrix taking +Y onto `direction` (for tubes/cylinders that are modelled along +Y)."""
    d = Vector(direction).normalized()
    q = Vector((0, 1, 0)).rotation_difference(d)
    return q.to_matrix().to_4x4()

# ------------------------------------------------------------------------------------------- asset builder
class Asset:
    def __init__(self, name, slots, seed=1):
        """slots: {slotName: {color, rough, metal, wear, grime, emissive?, pattern?, ...}}"""
        self.name = name
        self.slots = slots
        self.rng = random.Random(seed)
        self.seed = seed
        self.parts = {}      # partName -> list[(mesh, slot)]
        self.mats = {}
        self.placement = {}  # partName -> Matrix (game coords) used only while baking (assembled rest pose)
        for sname, s in slots.items():
            self.mats[sname] = self._make_material(sname, s)

    # ---- materials
    def _make_material(self, name, s):
        m = bpy.data.materials.new(f'{self.name}_{name}')
        m.use_nodes = True
        m['slot'] = name
        return m

    # ---- piece creation
    def _obj_from_bm(self, bm, name='piece'):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob

    def add(self, part, ob, slot, m=None, bevel=None, subsurf=0, smooth=0.6, crease=None, mods=None):
        """Bake modifiers on temp object `ob`, transform by matrix m (game coords), append to `part` with slot."""
        if slot not in self.slots:
            raise KeyError(f'unknown slot {slot}')
        if crease is not None:
            ob.data.edge_creases_ensure()
            cr = ob.data.edge_creases.data
            for i in range(len(cr)):
                cr[i].value = crease
        if subsurf:
            md = ob.modifiers.new('sub', 'SUBSURF'); md.levels = subsurf; md.render_levels = subsurf
        if bevel:
            w, seg = (bevel, 2) if isinstance(bevel, (int, float)) else bevel
            md = ob.modifiers.new('bev', 'BEVEL'); md.width = w; md.segments = seg
            md.limit_method = 'ANGLE'; md.angle_limit = math.radians(35); md.miter_outer = 'MITER_ARC'
            md.profile = 0.6
        for fn in (mods or []):
            fn(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        ev = ob.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        if m is not None:
            me.transform(m)
        if m is not None and m.determinant() < 0:
            me.flip_normals()
        # smoothing: flat faces, smooth bevels/curves
        for p in me.polygons:
            p.use_smooth = True
        if smooth is not None:
            me.set_sharp_from_angle(angle=smooth)
        bpy.data.objects.remove(ob)
        self.parts.setdefault(part, []).append((me, slot))
        return me

    # ---- primitives (all modelled in game coordinates, centred unless noted)
    def box(self, part, size, slot, pos=(0, 0, 0), rot=(0, 0, 0), scl=1, bevel=0.015, seg=2, taper=None, **kw):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
            if taper:  # taper=(tx, tz): scale x/z of the top (+Y) face
                if v.co.y > 0:
                    v.co.x *= taper[0]; v.co.z *= taper[1]
        ob = self._obj_from_bm(bm)
        return self.add(part, ob, slot, trs(pos, rot, scl), bevel=(bevel, seg) if bevel else None, **kw)

    def cyl(self, part, r1, r2, h, slot, pos=(0, 0, 0), rot=(0, 0, 0), scl=1, seg=16, bevel=0.01, cap=True, **kw):
        """Cylinder along +Y, r1 bottom / r2 top."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
        # create_cone builds along Z: rotate to Y
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))
        ob = self._obj_from_bm(bm)
        return self.add(part, ob, slot, trs(pos, rot, scl), bevel=(bevel, 2) if bevel else None, **kw)

    def sphere(self, part, r, slot, pos=(0, 0, 0), rot=(0, 0, 0), scl=1, seg=24, rings=14, cut=None, **kw):
        """UV sphere; cut: keep only y >= cut*r (dome)."""
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))
        if cut is not None:
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, cut * r, 0), plane_no=(0, 1, 0), clear_inner=True)
            edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
            bmesh.ops.holes_fill(bm, edges=edges, sides=0)
        ob = self._obj_from_bm(bm)
        return self.add(part, ob, slot, trs(pos, rot, scl), **kw)

    def capsule(self, part, r, length, slot, pos=(0, 0, 0), rot=(0, 0, 0), scl=1, seg=16, **kw):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=12, radius=r)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))
        for v in bm.verts:
            v.co.y += (length / 2) if v.co.y > 1e-6 else (-length / 2 if v.co.y < -1e-6 else 0)
        ob = self._obj_from_bm(bm)
        return self.add(part, ob, slot, trs(pos, rot, scl), **kw)

    def torus(self, part, R, r, slot, pos=(0, 0, 0), rot=(0, 0, 0), scl=1, seg=24, rseg=8, arc=2 * math.pi, **kw):
        """Torus in the XZ plane (axis +Y)."""
        bm = bmesh.new()
        rings = []
        closed = arc >= 2 * math.pi - 1e-4
        n = seg if closed else seg + 1
        for i in range(n):
            a = arc * i / seg
            c = Vector((math.cos(a) * R, 0, math.sin(a) * R))
            out = Vector((math.cos(a), 0, math.sin(a)))
            ring = []
            for j in range(rseg):
                b = 2 * math.pi * j / rseg
                ring.append(bm.verts.new(c + out * (math.cos(b) * r) + Vector((0, math.sin(b) * r, 0))))
            rings.append(ring)
        for i in range(seg if closed else seg):
            a, b = rings[i], rings[(i + 1) % n]
            for j in range(rseg):
                bm.faces.new((a[j], b[j], b[(j + 1) % rseg], a[(j + 1) % rseg]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = self._obj_from_bm(bm)
        return self.add(part, ob, slot, trs(pos, rot, scl), **kw)

    def prism(self, part, pts, depth, slot, pos=(0, 0, 0), rot=(0, 0, 0), scl=1, bevel=0.012, **kw):
        """2D profile in XY extruded along Z (centred)."""
        bm = bmesh.new()
        vs = [bm.verts.new((x, y, -depth / 2)) for x, y in pts]
        f = bm.faces.new(vs)
        r = bmesh.ops.extrude_face_region(bm, geom=[f])
        nv = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=nv, vec=(0, 0, depth))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = self._obj_from_bm(bm)
        return self.add(part, ob, slot, trs(pos, rot, scl), bevel=(bevel, 2) if bevel else None, **kw)

    def lathe(self, part, profile, slot, pos=(0, 0, 0), rot=(0, 0, 0), scl=1, seg=24, a0=None, a1=None, closed=False, **kw):
        """Revolve profile [(r, y), ...] around +Y. Angle 0 = +Z (front), positive towards +X.
        a0/a1: partial revolve (capped ends). closed=True: the profile is a closed loop (thick shells / rims)."""
        bm = bmesh.new()
        full = a0 is None
        a0 = 0.0 if full else a0
        a1 = 2 * math.pi if full else a1
        n = seg if full else seg + 1
        rings = []
        for i in range(n):
            a = a0 + (a1 - a0) * i / seg
            rings.append([bm.verts.new((math.sin(a) * r, y, math.cos(a) * r)) for r, y in profile])
        m = len(profile)
        segs = m if closed else m - 1
        for i in range(seg):
            A, B = rings[i], rings[(i + 1) % n]
            for j in range(segs):
                j2 = (j + 1) % m
                if profile[j][0] < 1e-5 and profile[j2][0] < 1e-5:
                    continue
                try:
                    bm.faces.new((A[j], A[j2], B[j2], B[j]))
                except ValueError:
                    pass
        if not full and closed:
            for ring in (rings[0], rings[-1]):
                try:
                    bm.faces.new(ring)
                except ValueError:
                    pass
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = self._obj_from_bm(bm)
        return self.add(part, ob, slot, trs(pos, rot, scl), **kw)

    def shell(self, part, r0, r1, h, th, slot, a0=-1.0, a1=1.0, pos=(0, 0, 0), rot=(0, 0, 0), scl=1, seg=12, bulge=0.0, bevel=0.006, **kw):
        """Curved armour plate: thick partial cylinder/cone around +Y from y=0 (radius r0) to y=h (radius r1).
        bulge pushes the middle outward (rounded plates)."""
        k = 5
        prof_out = []
        for i in range(k):
            t = i / (k - 1)
            r = r0 + (r1 - r0) * t + bulge * math.sin(math.pi * t)
            prof_out.append((r, h * t))
        prof = prof_out + [(r - th, y) for r, y in reversed(prof_out)]
        return self.lathe(part, prof, slot, pos=pos, rot=rot, scl=scl, seg=seg, a0=a0, a1=a1, closed=True,
                          bevel=(bevel, 2) if bevel else None, **kw)

    def tube(self, part, path, radii, slot, pos=(0, 0, 0), rot=(0, 0, 0), scl=1, rseg=8, flat=1.0, tip=True, twist=0.0, **kw):
        """Swept tube through points `path` (list of xyz) with per-point radii; flat scales the section's X (blades/horns)."""
        bm = bmesh.new()
        P = [Vector(p) for p in path]
        n = len(P)
        rings = []
        prev_side = None
        for i in range(n):
            t = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized()
            ref = Vector((1, 0, 0)) if abs(t.x) < 0.9 else Vector((0, 0, 1))
            side = (ref - t * ref.dot(t)).normalized() if prev_side is None else (prev_side - t * prev_side.dot(t)).normalized()
            prev_side = side
            up = t.cross(side).normalized()
            r = radii[i] if isinstance(radii, (list, tuple)) else radii
            ring = []
            tw = twist * i / max(1, n - 1)
            for j in range(rseg):
                b = 2 * math.pi * j / rseg + tw
                ring.append(bm.verts.new(P[i] + side * (math.cos(b) * r * flat) + up * (math.sin(b) * r)))
            rings.append(ring)
        for i in range(n - 1):
            A, B = rings[i], rings[i + 1]
            for j in range(rseg):
                bm.faces.new((A[j], A[(j + 1) % rseg], B[(j + 1) % rseg], B[j]))
        bm.faces.new(list(reversed(rings[0])))
        if tip:
            tipv = bm.verts.new(P[-1] + (P[-1] - P[-2]).normalized() * (radii[-1] if isinstance(radii, (list, tuple)) else radii) * 0.5)
            for j in range(rseg):
                bm.faces.new((rings[-1][j], rings[-1][(j + 1) % rseg], tipv))
        else:
            bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = self._obj_from_bm(bm)
        return self.add(part, ob, slot, trs(pos, rot, scl), **kw)

    def custom(self, part, build, slot, pos=(0, 0, 0), rot=(0, 0, 0), scl=1, **kw):
        """build(bm) fills a bmesh; full modifier support through **kw."""
        bm = bmesh.new()
        build(bm)
        ob = self._obj_from_bm(bm)
        return self.add(part, ob, slot, trs(pos, rot, scl), **kw)

    # ---- finalise
    def join_parts(self):
        objs = {}
        for part, pieces in self.parts.items():
            bm = bmesh.new()
            slots = []
            for me, slot in pieces:
                if slot not in slots:
                    slots.append(slot)
                before = set(bm.faces)
                bm.from_mesh(me)
                idx = slots.index(slot)
                for f in bm.faces:
                    if f not in before:
                        f.material_index = idx
                bpy.data.meshes.remove(me)
            me = bpy.data.meshes.new(part)
            bm.to_mesh(me)
            bm.free()
            for s in slots:
                me.materials.append(self.mats[s])
            ob = bpy.data.objects.new(part, me)
            bpy.context.scene.collection.objects.link(ob)
            objs[part] = ob
        self.objects = objs
        return objs

    def place(self, part, M):
        self.placement[part] = M

    def stats(self):
        tris = 0
        for ob in self.objects.values():
            ob.data.calc_loop_triangles()
            tris += len(ob.data.loop_triangles)
        return {'parts': len(self.objects), 'tris': tris}


# ------------------------------------------------------------------------------------------- UV atlas
def unwrap(objs, margin=0.0025):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=margin, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')


# ------------------------------------------------------------------------------------------- bake graphs
class NB:
    """Tiny node-graph helper."""
    def __init__(self, mat):
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.x = 0

    def n(self, t, **props):
        node = self.nt.nodes.new(t)
        node.location = (self.x, 0); self.x += 200
        for k, v in props.items():
            if k.startswith('in_'):
                key = k[3:]
                sock = node.inputs[int(key)] if key.isdigit() else node.inputs[key.replace('_', ' ')]
                sock.default_value = v
            else:
                setattr(node, k, v)
        return node

    def link(self, a, b):
        self.nt.links.new(a, b)

    def math(self, op, a, b=None, clamp=False):
        m = self.n('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                self.link(v, m.inputs[i])
        return m.outputs[0]

    def mix(self, fac, a, b, blend='MIX'):
        m = self.n('ShaderNodeMix', data_type='RGBA', blend_type=blend)
        for sock, v in ((m.inputs[0], fac), (m.inputs[6], a), (m.inputs[7], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            elif isinstance(v, (tuple, list)):
                sock.default_value = (*v[:3], 1.0) if len(v) >= 3 else v
            else:
                self.link(v, sock)
        return m.outputs[2]

    def noise(self, scale, detail=4, rough=0.6, vec=None, dist=0.0):
        nz = self.n('ShaderNodeTexNoise', in_Scale=scale, in_Detail=detail, in_Roughness=rough, in_Distortion=dist)
        if vec is not None:
            self.link(vec, nz.inputs['Vector'])
        return nz.outputs['Fac']

    def ramp(self, inp, a, b):
        """smoothstep-ish remap of inp from [a,b] to [0,1]"""
        mr = self.n('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP', clamp=True)
        mr.inputs['From Min'].default_value = a; mr.inputs['From Max'].default_value = b
        self.link(inp, mr.inputs['Value'])
        return mr.outputs['Result']


def _signals(g, s, seed):
    """Shared procedural signals for one slot: AO, edge (convex wear), cavity, grime, scratches, pattern."""
    tc = g.n('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    # seed offset so different assets don't share the same noise
    off = g.n('ShaderNodeVectorMath', operation='ADD')
    off.inputs[1].default_value = ((seed * 13.17) % 50, (seed * 7.31) % 50, (seed * 3.77) % 50)
    g.link(obj, off.inputs[0])
    P = off.outputs[0]
    ao = g.n('ShaderNodeAmbientOcclusion', samples=16, only_local=False, in_Distance=s.get('aoDist', 0.12))
    bev = g.n('ShaderNodeBevel', samples=8, in_Radius=s.get('edgeR', 0.012))
    geo = g.n('ShaderNodeNewGeometry')
    dot = g.n('ShaderNodeVectorMath', operation='DOT_PRODUCT')
    g.link(bev.outputs['Normal'], dot.inputs[0]); g.link(geo.outputs['Normal'], dot.inputs[1])
    curv = g.math('SUBTRACT', 1.0, dot.outputs['Value'])
    curv = g.math('MULTIPLY', curv, 18.0, clamp=True)
    aoF = ao.outputs['AO']
    edge = g.math('MULTIPLY', curv, g.ramp(aoF, 0.75, 0.98), clamp=True)  # convex: curved but unoccluded
    # break the edge wear up with noise -> chips
    chipN = g.noise(s.get('chipScale', 26.0), 6, 0.7, P)
    chips = g.math('MULTIPLY', edge, g.ramp(chipN, 0.42, 0.62), clamp=True)
    grimeN = g.noise(3.5, 5, 0.65, P)
    grime = g.math('MULTIPLY', g.ramp(aoF, 1.0, 0.35), g.ramp(grimeN, 0.3, 0.75), clamp=True)
    # scratches: anisotropic noise
    sc = g.n('ShaderNodeVectorMath', operation='MULTIPLY'); sc.inputs[1].default_value = (90.0, 6.0, 90.0)
    g.link(P, sc.inputs[0])
    scr = g.ramp(g.noise(1.0, 2, 0.5, sc.outputs[0]), 0.62, 0.66)
    scr = g.math('MULTIPLY', scr, g.ramp(g.noise(4.0, 2, 0.5, P), 0.5, 0.7), clamp=True)
    return dict(P=P, ao=aoF, curv=curv, edge=edge, chips=chips, grime=grime, scr=scr, bevelN=bev.outputs['Normal'])


def _pattern(g, s, P):
    """Optional slot pattern (returns (colorMaskSocket or None, secondColor, bumpHeightSocket or None))."""
    pat = s.get('pattern')
    if not pat:
        return None, None, None
    sep = g.n('ShaderNodeSeparateXYZ'); g.link(P, sep.inputs[0])
    if pat == 'hazard':  # diagonal stripes along the X+Y direction
        w = s.get('stripe', 0.08)
        u = g.math('ADD', sep.outputs['X'], sep.outputs['Y'])
        u = g.math('ADD', u, sep.outputs['Z'])
        fr = g.math('FRACT', g.math('DIVIDE', u, w * 2))
        mask = g.math('GREATER_THAN', fr, 0.5)
        return mask, s.get('color2', '#141414'), None
    if pat == 'panels':  # 3D lattice seams -> panel lines in the normal map and a darker seam colour
        cell = s.get('cell', 0.5)
        lines = None
        for ax in ('X', 'Y', 'Z'):
            fr = g.math('FRACT', g.math('DIVIDE', sep.outputs[ax], cell))
            d = g.math('ABSOLUTE', g.math('SUBTRACT', fr, 0.5))  # 0.5 at the seam
            l = g.ramp(d, 0.5 - s.get('seam', 0.012) / cell, 0.5)
            lines = l if lines is None else g.math('MAXIMUM', lines, l)
        return lines, None, g.math('MULTIPLY', lines, -1.0)
    if pat == 'grille':  # perforated / vent bumps
        cell = s.get('cell', 0.03)
        v = g.n('ShaderNodeTexVoronoi', feature='F1', distance='EUCLIDEAN', in_Scale=1.0 / cell, in_Randomness=0.0)
        g.link(P, v.inputs['Vector'])
        holes = g.ramp(v.outputs['Distance'], 0.32, 0.22)
        return holes, '#050505', g.math('MULTIPLY', holes, -1.0)
    if pat == 'rivets':
        cell = s.get('cell', 0.12)
        v = g.n('ShaderNodeTexVoronoi', feature='F1', distance='EUCLIDEAN', in_Scale=1.0 / cell, in_Randomness=0.0)
        g.link(P, v.inputs['Vector'])
        bump = g.ramp(v.outputs['Distance'], 0.12, 0.06)
        return None, None, bump
    if pat == 'organic':  # veined flesh / chitin cells
        v = g.n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE', in_Scale=s.get('cellScale', 9.0))
        g.link(P, v.inputs['Vector'])
        veins = g.ramp(v.outputs['Distance'], 0.06, 0.0)
        return veins, s.get('color2', '#ff2020'), g.math('MULTIPLY', veins, -0.6)
    return None, None, None


def build_bake_graph(mat, s, seed, mode, img):
    """mode: 'albedo' | 'orm' | 'normal'. Emission-based for colour data; principled normal for 'normal'."""
    g = NB(mat)
    out = g.n('ShaderNodeOutputMaterial')
    imgn = g.n('ShaderNodeTexImage'); imgn.image = img
    g.nt.nodes.active = imgn
    S = _signals(g, s, seed)
    mask, col2, bump = _pattern(g, s, S['P'])
    wear = s.get('wear', 0.5); grime = s.get('grime', 0.5)
    emissive = s.get('emissive', 0) > 0
    if mode == 'albedo':
        base = hex_rgb(s['color'])
        if emissive:
            c = g.mix(0.0, (*base, 1), (*base, 1))
        else:
            # base variation (mottling)
            mott = g.noise(9.0, 4, 0.6, S['P'])
            c = g.mix(g.math('MULTIPLY', mott, 0.12), (*base, 1), (*[x * 0.6 for x in base], 1))
            if mask is not None and col2 is not None:
                c = g.mix(mask, c, (*hex_rgb(col2), 1))
            elif mask is not None:
                c = g.mix(g.math('MULTIPLY', mask, 0.6), c, (0.01, 0.01, 0.012, 1))
            # cavity darkening from AO
            aoMul = g.mix(s.get('aoStrength', 0.75), (1, 1, 1, 1), S['ao'], 'MULTIPLY')
            c = g.mix(1.0, c, aoMul, 'MULTIPLY')
            # grime
            gcol = hex_rgb(s.get('grimeColor', '#2a2219'))
            c = g.mix(g.math('MULTIPLY', S['grime'], grime), c, (*gcol, 1))
            # edge highlight + paint chips -> bare metal
            metal = hex_rgb(s.get('metalColor', '#9a9ea4'))
            c = g.mix(g.math('MULTIPLY', S['edge'], wear * 0.35), c, (*[min(1, x * 1.6 + 0.08) for x in base], 1))
            c = g.mix(g.math('MULTIPLY', S['chips'], wear), c, (*metal, 1))
            c = g.mix(g.math('MULTIPLY', S['scr'], wear * 0.6), c, (*metal, 1))
        em = g.n('ShaderNodeEmission'); g.link(c, em.inputs['Color'])
        g.link(em.outputs[0], out.inputs['Surface'])
    elif mode == 'orm':
        # R = AO, G = roughness, B = metalness (glTF metallicRoughness + occlusion packing)
        r0, m0 = s.get('rough', 0.5), s.get('metal', 0.3)
        rn = g.noise(14.0, 4, 0.6, S['P'])
        rough = g.math('ADD', r0 - 0.08, g.math('MULTIPLY', rn, 0.16))
        rough = g.math('ADD', rough, g.math('MULTIPLY', S['grime'], grime * 0.25))
        rough = g.math('SUBTRACT', rough, g.math('MULTIPLY', S['chips'], wear * 0.25), clamp=True)
        metal = g.math('ADD', m0, g.math('MULTIPLY', g.math('MAXIMUM', S['chips'], S['scr']), wear * (1 - m0)), clamp=True)
        if emissive:
            rough = g.math('ADD', r0, 0.0); metal = g.math('ADD', 0.0, 0.0)
        comb = g.n('ShaderNodeCombineColor')
        g.link(S['ao'], comb.inputs[0]); g.link(rough, comb.inputs[1]); g.link(metal, comb.inputs[2])
        em = g.n('ShaderNodeEmission'); g.link(comb.outputs[0], em.inputs['Color'])
        g.link(em.outputs[0], out.inputs['Surface'])
    elif mode == 'normal':
        bsdf = g.n('ShaderNodeBsdfPrincipled')
        h = g.math('MULTIPLY', g.noise(s.get('microScale', 60.0), 3, 0.5, S['P']), s.get('micro', 0.15))
        h = g.math('ADD', h, g.math('MULTIPLY', S['scr'], -0.3 * wear))
        h = g.math('ADD', h, g.math('MULTIPLY', S['chips'], -0.5 * wear))
        if bump is not None:
            h = g.math('ADD', h, g.math('MULTIPLY', bump, s.get('patternDepth', 1.0)))
        bp = g.n('ShaderNodeBump', in_Strength=s.get('bumpStrength', 0.35), in_Distance=0.004)
        g.link(h, bp.inputs['Height'])
        g.link(S['bevelN'], bp.inputs['Normal'])
        g.link(bp.outputs['Normal'], bsdf.inputs['Normal'])
        g.link(bsdf.outputs[0], out.inputs['Surface'])
    return g


def build_export_material(mat, s, imgs):
    """Final glTF-exportable material: baked albedo, ORM (occlusion via glTF settings group), normal; emissive from palette."""
    g = NB(mat)
    out = g.n('ShaderNodeOutputMaterial')
    bsdf = g.n('ShaderNodeBsdfPrincipled')
    g.link(bsdf.outputs[0], out.inputs['Surface'])
    a = g.n('ShaderNodeTexImage'); a.image = imgs['albedo']
    g.link(a.outputs['Color'], bsdf.inputs['Base Color'])
    o = g.n('ShaderNodeTexImage'); o.image = imgs['orm']
    sep = g.n('ShaderNodeSeparateColor'); g.link(o.outputs['Color'], sep.inputs[0])
    g.link(sep.outputs[1], bsdf.inputs['Roughness']); g.link(sep.outputs[2], bsdf.inputs['Metallic'])
    nm = g.n('ShaderNodeTexImage'); nm.image = imgs['normal']
    nmap = g.n('ShaderNodeNormalMap'); g.link(nm.outputs['Color'], nmap.inputs['Color'])
    g.link(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    # occlusion: glTF exporter reads the "glTF Material Output" group's Occlusion socket
    grp = bpy.data.node_groups.get('glTF Material Output')
    if grp is None:
        grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    gn = g.n('ShaderNodeGroup'); gn.node_tree = grp
    g.link(sep.outputs[0], gn.inputs['Occlusion'])
    if s.get('emissive', 0) > 0:
        bsdf.inputs['Emission Color'].default_value = (*hex_rgb(s.get('emissiveColor', s['color'])), 1)
        bsdf.inputs['Emission Strength'].default_value = s['emissive']
    if s.get('alphaClip'):
        mat.blend_method = 'CLIP'


def bake_and_export(asset, out_glb, size=2048, samples=16, margin=4, passes=None):
    """passes: groups of mutually exclusive equipment parts (they occupy the same space). Pass 0 bakes the body plus
    group 0; pass i bakes group i with the other groups hidden, so every variant gets correct AO from the body."""
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    scn.cycles.device = 'CPU'
    scn.cycles.samples = samples
    scn.cycles.use_denoising = False
    scn.render.bake.margin = margin
    objs = list(asset.objects.values())
    for ob in objs:
        if not ob.data.uv_layers:
            ob.data.uv_layers.new(name='UVMap')
    unwrap(objs)
    # assembled rest pose for baking (AO / bevel must see the real neighbours, not overlapping joint-local parts)
    for name, ob in asset.objects.items():
        ob.matrix_world = asset.placement.get(name, Matrix.Identity(4))
    names = list(asset.objects.keys())
    groups = [list(p) for p in (passes or [[]])]
    variant_parts = set(n for g in groups for n in g)
    body = [n for n in names if n not in variant_parts]
    imgs = {}
    for mode in ('albedo', 'orm', 'normal'):
        img = bpy.data.images.new(f'{asset.name}_{mode}', size, size, alpha=False, float_buffer=False)
        img.colorspace_settings.name = 'sRGB' if mode == 'albedo' else 'Non-Color'
        imgs[mode] = img
        for sname, mat in asset.mats.items():
            build_bake_graph(mat, asset.slots[sname], asset.seed, mode, img)
        for pi, grp in enumerate(groups):
            pnames = (body if pi == 0 else []) + grp
            if not pnames:
                continue
            for n, ob in asset.objects.items():
                ob.hide_render = n in variant_parts and n not in grp
            bpy.ops.object.select_all(action='DESELECT')
            sel = [asset.objects[n] for n in pnames]
            for ob in sel:
                ob.select_set(True)
            bpy.context.view_layer.objects.active = sel[0]
            kw = dict(margin=margin if pi == 0 else 2, use_clear=(pi == 0))
            if mode == 'normal':
                bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', **kw)
            else:
                bpy.ops.object.bake(type='EMIT', **kw)
        for ob in objs:
            ob.hide_render = False
        img.pack()
    for ob in objs:
        ob.matrix_world = Matrix.Identity(4)
    for sname, mat in asset.mats.items():
        build_export_material(mat, asset.slots[sname], imgs)
    # game coords -> Blender Z-up so the exporter's +Y-up conversion yields the original game coords
    conv = Matrix.Rotation(math.pi / 2, 4, 'X')
    for ob in objs:
        ob.data.transform(conv)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    os.makedirs(os.path.dirname(out_glb), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_glb, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
        export_image_format='WEBP', export_image_quality=88, export_materials='EXPORT', export_texcoords=True,
        export_normals=True, export_tangents=False, export_animations=False, export_extras=True,
    )
    if os.environ.get('HD_DUMP_ATLAS'):
        for im in imgs.values():
            im.filepath_raw = os.path.join(os.environ['HD_DUMP_ATLAS'], im.name + '.png'); im.file_format = 'PNG'; im.save()
    return {'size': size, **asset.stats()}


def write_report(out_glb, info):
    with open(out_glb.replace('.glb', '.json'), 'w') as f:
        json.dump(info, f, indent=1)


def bake_tileable(asset, out_glb, extent, size=2048, samples=16, margin=0):
    """Bake the asset's (high-poly) pieces, laid out in [-extent/2, extent/2]^2 on the floor, onto a single plane
    (selected-to-active): yields a seamless tileable albedo/ORM/normal set exported as a plane named 'floor_tile'."""
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'; scn.cycles.device = 'CPU'; scn.cycles.samples = samples; scn.cycles.use_denoising = False
    highs = list(asset.objects.values())
    me = bpy.data.meshes.new('floor_tile')
    h = extent / 2
    # plane in game coords (y up) at y=0.03, UV 0..1 (u along +x, v along -z)
    verts = [(-h, 0.03, h), (h, 0.03, h), (h, 0.03, -h), (-h, 0.03, -h)]
    me.from_pydata(verts, [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name='UVMap')
    for li, (u, v) in zip(range(4), [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[li].uv = (u, v)
    low = bpy.data.objects.new('floor_tile', me)
    scn.collection.objects.link(low)
    mat = bpy.data.materials.new(f'{asset.name}_floor')
    mat.use_nodes = True
    me.materials.append(mat)
    tile_slot = {'color': '#808080', 'rough': 0.5, 'metal': 0.5}
    imgs = {}
    for mode in ('albedo', 'orm', 'normal'):
        img = bpy.data.images.new(f'{asset.name}_tile_{mode}', size, size, alpha=False, float_buffer=False)
        img.colorspace_settings.name = 'sRGB' if mode == 'albedo' else 'Non-Color'
        imgs[mode] = img
        for sname, m in asset.mats.items():
            build_bake_graph(m, asset.slots[sname], asset.seed, mode, img)
        g = NB(mat)
        o = g.n('ShaderNodeOutputMaterial'); b = g.n('ShaderNodeBsdfPrincipled'); g.link(b.outputs[0], o.inputs['Surface'])
        im = g.n('ShaderNodeTexImage'); im.image = img; g.nt.nodes.active = im
        bpy.ops.object.select_all(action='DESELECT')
        for ob in highs:
            ob.select_set(True)
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        kw = dict(use_selected_to_active=True, cage_extrusion=0.08, max_ray_distance=0.3, margin=margin, use_clear=True)
        if mode == 'normal':
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', **kw)
        else:
            bpy.ops.object.bake(type='EMIT', **kw)
        img.pack()
    build_export_material(mat, tile_slot, imgs)
    low.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_image_format='WEBP', export_image_quality=90, export_materials='EXPORT', export_texcoords=True,
                              export_normals=True, export_tangents=False, export_animations=False)
    if os.environ.get('HD_DUMP_ATLAS'):
        for im in imgs.values():
            im.filepath_raw = os.path.join(os.environ['HD_DUMP_ATLAS'], im.name + '.png'); im.file_format = 'PNG'; im.save()
    return {'size': size, 'extent': extent, 'highTris': asset.stats()['tris']}
