# Contact-sheet preview of a built GLB (Cycles, CPU): `blender -b -P preview.py -- in.glb out.png [angles] [height]`
# Camera matches the game's view direction (yaw 45°, elevation ~41.5°), orthographic.
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
n = int(a[2]) if len(a) > 2 else 4
H = float(a[3]) if len(a) > 3 else 2.0
px = int(a[4]) if len(a) > 4 else 360
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
root = bpy.data.objects.new('root', None); bpy.context.scene.collection.objects.link(root)
for o in bpy.context.scene.objects:
    if o.parent is None and o is not root: o.parent = root
scn = bpy.context.scene
scn.render.engine = 'CYCLES'; scn.cycles.device = 'CPU'; scn.cycles.samples = 24; scn.cycles.use_denoising = True
scn.render.resolution_x = px; scn.render.resolution_y = px
scn.render.film_transparent = False
w = bpy.data.worlds.new('w'); scn.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.03, 0.035, 0.045, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
def light(kind, loc, energy, color, size=1):
    L = bpy.data.lights.new(kind, kind); L.energy = energy; L.color = color
    if kind == 'AREA': L.size = size
    o = bpy.data.objects.new(kind, L); o.location = loc; scn.collection.objects.link(o)
    o.rotation_euler = (Vector((0, 0, H * 0.4)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
light('SUN', (-6, 4, 10), 2.5, (0.75, 0.85, 1.0))
light('AREA', (4, -4, 4), 300, (1.0, 0.8, 0.6), 3)
light('AREA', (-3, -5, 2), 120, (1.0, 0.2, 0.15), 2)
bpy.ops.mesh.primitive_plane_add(size=20); fl = bpy.context.object
m = bpy.data.materials.new('floor'); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.05, 0.055, 0.06, 1)
m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.35
fl.data.materials.append(m)
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = H
co = bpy.data.objects.new('c', cam); scn.collection.objects.link(co); scn.camera = co
d = Vector((1, -1, 1.25)).normalized() * 30  # game (1,1.25,1) in Blender coords (x, -z, y)
tgt = Vector((0, 0, H * 0.42))
co.location = tgt + d
co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler()
frames = []
base = os.path.splitext(out)[0]
for i in range(n):
    root.rotation_euler = (0, 0, i * 2 * math.pi / n)
    p = f'{base}_{i}.png'; scn.render.filepath = p
    bpy.ops.render.render(write_still=True); frames.append(p)
print('FRAMES', ' '.join(frames))
