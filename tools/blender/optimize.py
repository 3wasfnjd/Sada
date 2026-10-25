# صدى — turns a heavy source model into a light, game-ready .glb without destroying its shape:
#   1) voxel remesh -> watertight copy, 2) QuadriFlow retopology to a target face count (not decimation),
#   3) smart UV unwrap, 4) bake the source's colour + normal detail onto the light mesh (Cycles),
#   5) export .glb with the baked textures, 6) render source vs result side by side.
# Run:  blender -b -P tools/blender/optimize.py -- <source file> <out dir> <preview dir> [json settings]
import bpy, sys, os, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, PREV = argv[0], os.path.abspath(argv[1]), os.path.abspath(argv[2])
cfg = {'name': os.path.splitext(os.path.basename(SRC))[0], 'faces': 3000, 'height': None, 'texture': 1024, 'voxel': 0.01}
if len(argv) > 3 and os.path.exists(argv[3]): cfg.update(json.load(open(argv[3])))
os.makedirs(OUT, exist_ok=True); os.makedirs(PREV, exist_ok=True)
NAME = cfg['name']

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
ext = SRC.lower().rsplit('.', 1)[-1]
if ext in ('glb', 'gltf'): bpy.ops.import_scene.gltf(filepath=SRC)
elif ext == 'fbx': bpy.ops.import_scene.fbx(filepath=SRC)
elif ext == 'obj': bpy.ops.wm.obj_import(filepath=SRC)
else: raise SystemExit('unsupported format: ' + ext)

def sel(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]

meshes = [o for o in scene.objects if o.type == 'MESH']
for o in [o for o in scene.objects if o.type != 'MESH']: o.select_set(False)
sel(meshes); bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
if len(meshes) > 1: bpy.ops.object.join()
high = bpy.context.active_object; high.name = 'High'
src_tris = sum(len(p.vertices) - 2 for p in high.data.polygons)

# normalise: feet on the ground, centred, optional target height (m)
bb = [high.matrix_world @ Vector(c) for c in high.bound_box]
lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
if cfg['height']:
    k = cfg['height'] / (hi.z - lo.z); high.scale = (k, k, k); bpy.ops.object.transform_apply(scale=True)
    lo, hi = lo * k, hi * k
high.location = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z); bpy.ops.object.transform_apply(location=True)
size = max(hi - lo)

# light copy: voxel remesh (watertight) then QuadriFlow to the target face count
low = high.copy(); low.data = high.data.copy(); low.name = NAME; scene.collection.objects.link(low)
low.data.materials.clear()
sel([low])
low.data.remesh_voxel_size = max(cfg['voxel'] * size, 1e-4); bpy.ops.object.voxel_remesh()
voxel_faces = len(low.data.polygons)
try:
    r = bpy.ops.object.quadriflow_remesh(target_faces=int(cfg['faces']), use_preserve_sharp=True, use_mesh_symmetry=False, seed=0)
    print('[optimize] QuadriFlow:', r, voxel_faces, '->', len(low.data.polygons))
except Exception as e:
    print('[optimize] QuadriFlow error:', e)
if len(low.data.polygons) > cfg['faces'] * 1.5:   # QuadriFlow did not reach the target: collapse on the clean voxel mesh
    print('[optimize] falling back to collapse decimate from', len(low.data.polygons))
    m = low.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = cfg['faces'] / len(low.data.polygons)
    bpy.ops.object.modifier_apply(modifier='dec')
method = 'quadriflow' if len(low.data.polygons) <= cfg['faces'] * 1.5 and 'dec' not in [] else 'decimate'
for p in low.data.polygons: p.use_smooth = True
low_tris = sum(len(p.vertices) - 2 for p in low.data.polygons)

# UVs
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.003)
bpy.ops.object.mode_set(mode='OBJECT')

# bake targets
T = cfg['texture']
def image(n, color_data):
    img = bpy.data.images.new(f'{NAME}_{n}', T, T, alpha=False, float_buffer=not color_data)
    if not color_data: img.colorspace_settings.name = 'Non-Color'
    return img
img_col, img_nrm = image('color', True), image('normal', False)
mat = bpy.data.materials.new(NAME); mat.use_nodes = True; low.data.materials.append(mat)
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = .7
tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = img_col
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img_nrm
nm = nt.nodes.new('ShaderNodeNormalMap')

scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 16
bk = scene.render.bake; bk.use_selected_to_active = True; bk.cage_extrusion = .02 * size; bk.margin = 8
sel([high, low], active=low)
nt.nodes.active = tc; bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.use_pass_color = True
bpy.ops.object.bake(type='DIFFUSE')
nt.nodes.active = tn; bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
for img in (img_col, img_nrm): img.pack()

# export
sel([low])
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, NAME + '.glb'), export_format='GLB', use_selection=True,
                          export_apply=True, export_yup=True, export_image_format='JPEG')

# preview: source (left) vs game model (right)
high.location.x = -size * .65; low.location.x = size * .65
world = bpy.data.worlds.new('W'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.6, .6, .63, 1)
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3; sun.rotation_euler = (math.radians(45), 0, math.radians(-30))
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
h = hi.z - lo.z if not cfg['height'] else cfg['height']
scene.cycles.samples = 48; scene.render.resolution_x, scene.render.resolution_y = 1200, 700
for o in (high, low): o.rotation_mode = 'XYZ'   # glTF import uses quaternions
for tag, rz, d, z in (('side', 0, 3.2, .6), ('front', 90, 3.2, .6), ('back', -90, 3.2, .6), ('face', 90, 1.6, .72)):
    for o in (high, low): o.rotation_euler = (0, 0, math.radians(rz))
    cam.location = (0, -size * d, h * z); cam.rotation_euler = (math.radians(88), 0, 0)
    scene.render.filepath = os.path.join(PREV, f'{NAME}_compare_{tag}.png'); bpy.ops.render.render(write_still=True)

report = {'name': NAME, 'source_triangles': src_tris, 'game_triangles': low_tris, 'voxel_faces': voxel_faces, 'texture': T, 'size_m': round(size, 3)}
json.dump(report, open(os.path.join(OUT, NAME + '.report.json'), 'w'), indent=1)
print('[optimize]', report)
