# صدى — builds every game model in code and exports one .glb per slot.
# Run:  blender -b -P tools/blender/make_assets.py -- <out_dir> <preview_dir>
# Units: 1 Blender unit = 1 m = one grid cell. Blender is Z-up / -Y forward; the glTF
# exporter converts to Y-up / +Z forward, which is what the game expects (docs/ASSETS.md).
import bpy, bmesh, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else 'assets')
PREV = os.path.abspath(argv[1] if len(argv) > 1 else 'docs/previews')
os.makedirs(OUT, exist_ok=True); os.makedirs(PREV, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 60

# ---------- helpers ----------
def mat(name, color, rough=.8, metal=0., emit=None, strength=0., vcol=False):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    if vcol:
        n = m.node_tree.nodes.new('ShaderNodeVertexColor'); n.layer_name = 'Col'
        m.node_tree.links.new(n.outputs['Color'], b.inputs['Base Color'])
    return m

def obj_from_bm(name, bm, material=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    if material: me.materials.append(material)
    return o

def box(bm, sx, sy, sz, cx=0, cy=0, z0=0):
    r = bmesh.ops.create_cube(bm, size=1)
    vs = r['verts']
    for v in vs: v.co = Vector((v.co.x * sx + cx, v.co.y * sy + cy, (v.co.z + .5) * sz + z0))
    return vs

def bevel(o, w=.03, seg=2):
    m = o.modifiers.new('bevel', 'BEVEL'); m.width = w; m.segments = seg; m.limit_method = 'ANGLE'
    return m

def smooth(o, on=True):
    for p in o.data.polygons: p.use_smooth = on

def paint(o, fn):
    """vertex colour per corner from the vertex position (single material, two tones)"""
    me = o.data
    a = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for li, loop in enumerate(me.loops):
        a.data[li].color = (*fn(me.vertices[loop.vertex_index].co), 1)

def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

def export(name, objs, anim=False):
    select_only(objs)
    kw = dict(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True,
              export_apply=True, export_yup=True, export_animations=anim)
    if anim: kw.update(export_animation_mode='ACTIONS', export_force_sampling=True)
    try: bpy.ops.export_scene.gltf(**kw, export_vertex_color='MATERIAL')
    except TypeError: bpy.ops.export_scene.gltf(**kw)
    print('[assets] exported', name)

SAND, SAND_D = (.86, .74, .56), (.70, .56, .39)
STONE, STONE_L = (.33, .27, .47), (.55, .48, .70)

# ---------- floor tile: origin = centre of the TOP face ----------
bm = bmesh.new(); box(bm, .96, .96, .5, z0=-.5)
top = [f for f in bm.faces if f.normal.z > .9][0]
r = bmesh.ops.inset_region(bm, faces=[top], thickness=.09, depth=0)
bmesh.ops.inset_region(bm, faces=[top], thickness=.025, depth=-.012)   # engraved groove
bmesh.ops.inset_region(bm, faces=[top], thickness=.0, depth=.004)
floor = obj_from_bm('Floor', bm, mat('Sandstone', (1, 1, 1), rough=.9, vcol=True)); bevel(floor, .02, 2)
paint(floor, lambda c: SAND if (abs(c.x) < .38 and abs(c.y) < .38 and c.z > -.02) else SAND_D)

# ---------- wall: origin = centre of the base; body + wider cap in ONE mesh ----------
bm = bmesh.new(); box(bm, .98, .98, .9); box(bm, 1.04, 1.04, .1, z0=.9)
for i, zz in enumerate((.3, .6)):  # carved courses
    box(bm, 1.0, 1.0, .03, z0=zz - .015)
wall = obj_from_bm('Wall', bm, mat('Stone', (1, 1, 1), rough=.85, vcol=True)); bevel(wall, .025, 2)
paint(wall, lambda c: STONE_L if c.z > .89 else tuple(x * .85 for x in STONE) if abs(abs(c.x) - .5) < .02 or abs(abs(c.y) - .5) < .02 and c.z % .3 < .04 else STONE)

# ---------- door: origin = centre of the base ----------
bm = bmesh.new(); box(bm, .98, .9, .95)
for s in (-1, 1): box(bm, .98, .05, .95, cy=s * .47)            # frame posts
box(bm, .7, .94, .12, z0=.68); box(bm, .7, .94, .12, z0=.18)    # carved bands
door = obj_from_bm('Door', bm, mat('DoorStone', (.24, .19, .34), rough=.75)); bevel(door, .02, 2)

# ---------- plate base: origin = centre of the base (top stays below 0.07) ----------
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=.4, radius2=.37, depth=.05)
for v in bm.verts: v.co.z += .025
plate = obj_from_bm('Plate', bm, mat('PlateMetal', (.2, .18, .28), rough=.45, metal=.6))
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=.41, radius2=.41, depth=.012)
for v in bm.verts: v.co.z += .056
rim = obj_from_bm('PlateRim', bm, mat('Brass', (.78, .58, .3), rough=.35, metal=.85))
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=.33, radius2=.33, depth=.02)
for v in bm.verts: v.co.z += .056
hole = obj_from_bm('PlateInner', bm, plate.data.materials[0])
select_only([plate, rim, hole]); bpy.ops.object.join()

# ---------- exit dais with two small obelisks: origin = centre of the base ----------
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=.47, radius2=.45, depth=.04)
for v in bm.verts: v.co.z += .02
exitd = obj_from_bm('Exit', bm, mat('ExitStone', SAND, rough=.8))
parts = [exitd]
for s in (-1, 1):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=.07, radius2=.035, depth=.5)
    for v in bm.verts: v.co += Vector((s * .44, 0, .29))
    ob = obj_from_bm('Obelisk', bm, mat('ObeliskStone', STONE_L, rough=.7)); parts.append(ob)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=.04)
    for v in bm.verts: v.co += Vector((s * .44, 0, .58))
    parts.append(obj_from_bm('Light', bm, mat('ExitGlow', (1, .85, .55), emit=(1, .8, .45), strength=6)))
select_only(parts); bpy.ops.object.join()

# ---------- hero: rigid-skinned to a small armature, ~0.95 m, faces -Y (glTF +Z) ----------
COPPER, CREAM, RED, INK = (.86, .46, .2), (.95, .86, .72), (.78, .2, .14), (.06, .05, .1)
M_COP = mat('Copper', COPPER, rough=.45, metal=.35); M_CRM = mat('Face', CREAM, rough=.6)
M_RED = mat('Scarf', RED, rough=.7); M_INK = mat('Eyes', INK, rough=.15)
M_GLW = mat('Tassel', (1, .9, .6), emit=(1, .7, .3), strength=4)

def part(kind, bone, m, loc, scale=(1, 1, 1), **kw):
    if kind == 'sphere': bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16, radius=kw.get('r', .1), location=loc)
    elif kind == 'torus': bpy.ops.mesh.primitive_torus_add(major_radius=kw['R'], minor_radius=kw['r'], major_segments=32, minor_segments=10, location=loc)
    elif kind == 'cyl': bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=kw['r'], depth=kw['d'], location=loc)
    elif kind == 'cube': bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.scale = scale
    if 'rot' in kw: o.rotation_euler = kw['rot']
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.materials.append(m); smooth(o, kind != 'cube')
    o.vertex_groups.new(name=bone).add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    return o

hp = [
    part('sphere', 'body', M_COP, (0, 0, .27), (1, .92, 1.15), r=.2),
    part('sphere', 'root', M_COP, (-.085, -.02, .045), (1, 1.3, .6), r=.065),
    part('sphere', 'root', M_COP, (.085, -.02, .045), (1, 1.3, .6), r=.065),
    part('torus', 'body', M_RED, (0, 0, .47), R=.15, r=.055),
    part('cube', 'scarf', M_RED, (.05, .17, .36), (.09, .04, .22), rot=(.25, 0, .2)),
    part('sphere', 'head', M_CRM, (0, 0, .68), (1, .95, .95), r=.215),
    part('sphere', 'head', M_COP, (0, .03, .74), (1.04, 1.0, .8), r=.215),      # copper hood over the back/top
    part('sphere', 'head', M_INK, (-.075, -.195, .67), (.8, .5, 1.15), r=.04),
    part('sphere', 'head', M_INK, (.075, -.195, .67), (.8, .5, 1.15), r=.04),
    part('cyl', 'antenna', M_COP, (0, 0, .93), r=.012, d=.1),
    part('sphere', 'antenna', M_GLW, (0, 0, .99), r=.045),
]
select_only(hp); bpy.ops.object.join(); body = bpy.context.active_object; body.name = 'HeroMesh'

arm_data = bpy.data.armatures.new('HeroRig'); arm = bpy.data.objects.new('Hero', arm_data)
scene.collection.objects.link(arm); select_only([arm]); bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
def bone(n, h, t, parent=None):
    b = eb.new(n); b.head = h; b.tail = t
    if parent: b.parent = eb[parent]
bone('root', (0, 0, 0), (0, 0, .1)); bone('body', (0, 0, .1), (0, 0, .45), 'root')
bone('head', (0, 0, .45), (0, 0, .86), 'body'); bone('scarf', (0, .15, .48), (0, .2, .26), 'body')
bone('antenna', (0, 0, .88), (0, 0, 1.0), 'head')
bpy.ops.object.mode_set(mode='OBJECT')
body.parent = arm; body.modifiers.new('rig', 'ARMATURE').object = arm

# actions: every bone keyed at first/last frame so each clip is self-contained; bone-local axes (Y = along bone)
BONES = ['root', 'body', 'head', 'scarf', 'antenna']
def clip(name, last, keys, cyclic=False):
    act = bpy.data.actions.new(name); act.use_fake_user = True
    arm.animation_data_create(); arm.animation_data.action = act
    for b in BONES:
        pb = arm.pose.bones[b]; pb.rotation_mode = 'XYZ'
        for f in (0, last):
            pb.location = (0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
            for p in ('location', 'rotation_euler', 'scale'): pb.keyframe_insert(p, frame=f)
    for f, b, p, v in keys:
        pb = arm.pose.bones[b]; setattr(pb, p, v); pb.keyframe_insert(p, frame=f)
    for b in BONES:
        pb = arm.pose.bones[b]; pb.location = (0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
    return act

clip('idle', 120, [
    (30, 'body', 'scale', (1.02, .975, 1.02)), (60, 'body', 'scale', (1, 1.02, 1)), (90, 'body', 'scale', (1.02, .975, 1.02)),
    (40, 'head', 'rotation_euler', (0, 0, .06)), (100, 'head', 'rotation_euler', (0, 0, -.06)),
    (30, 'scarf', 'rotation_euler', (.25, 0, 0)), (90, 'scarf', 'rotation_euler', (-.15, 0, 0)),
    (20, 'antenna', 'rotation_euler', (.25, 0, 0)), (60, 'antenna', 'rotation_euler', (-.2, 0, .1)), (100, 'antenna', 'rotation_euler', (.2, 0, -.1)),
])
clip('hop', 10, [
    (2, 'body', 'scale', (1.14, .82, 1.14)), (5, 'body', 'scale', (.9, 1.16, .9)), (9, 'body', 'scale', (1.08, .9, 1.08)),
    (5, 'head', 'location', (0, .04, 0)), (5, 'scarf', 'rotation_euler', (-.9, 0, 0)), (5, 'antenna', 'rotation_euler', (.6, 0, 0)),
])
clip('bump', 10, [
    (3, 'head', 'rotation_euler', (-.35, 0, 0)), (3, 'body', 'scale', (1.1, .88, 1.1)), (3, 'antenna', 'rotation_euler', (-.8, 0, 0)),
    (6, 'head', 'rotation_euler', (.12, 0, 0)),
])
clip('land', 24, [
    (3, 'body', 'scale', (1.22, .74, 1.22)), (3, 'head', 'location', (0, -.08, 0)), (8, 'body', 'scale', (.94, 1.08, .94)),
    (8, 'head', 'location', (0, .03, 0)), (5, 'scarf', 'rotation_euler', (.8, 0, 0)), (5, 'antenna', 'rotation_euler', (.9, 0, 0)),
])
clip('cheer', 48, [
    (8, 'head', 'rotation_euler', (0, 0, .3)), (20, 'head', 'rotation_euler', (0, 0, -.3)), (32, 'head', 'rotation_euler', (0, 0, .3)),
    (12, 'body', 'scale', (.92, 1.12, .92)), (24, 'body', 'scale', (1.08, .92, 1.08)), (36, 'body', 'scale', (.92, 1.12, .92)),
    (10, 'scarf', 'rotation_euler', (-1.1, 0, .4)), (26, 'scarf', 'rotation_euler', (-1.1, 0, -.4)), (40, 'scarf', 'rotation_euler', (-.9, 0, .3)),
    (12, 'antenna', 'rotation_euler', (0, 2.5, 0)), (24, 'antenna', 'rotation_euler', (0, 5.0, 0)),
])
arm.animation_data.action = bpy.data.actions['idle']

# ---------- export ----------
export('floor', [floor]); export('wall', [wall]); export('door', [door]); export('plate', [plate])
export('exit', [exitd]); export('hero', [arm, body], anim=True)

# ---------- previews (Cycles, CPU) ----------
scene.render.engine = 'CYCLES'; scene.cycles.samples = 48; scene.cycles.device = 'CPU'
scene.render.resolution_x, scene.render.resolution_y = 900, 700
scene.render.film_transparent = False
world = bpy.data.worlds.new('Night'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.03, .025, .08, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.2
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3.5; sun.data.color = (1, .85, .65); sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
rimL = bpy.data.objects.new('Rim', bpy.data.lights.new('Rim', 'SUN')); scene.collection.objects.link(rimL)
rimL.data.energy = 1.2; rimL.data.color = (.45, .55, 1); rimL.rotation_euler = (math.radians(60), 0, math.radians(150))
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 50

def look(target, dist, elev, azim):
    t = Vector(target); e, a = math.radians(elev), math.radians(azim)
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()

def render(name):
    scene.render.filepath = os.path.join(PREV, name + '.png'); bpy.ops.render.render(write_still=True)
    print('[assets] preview', name)

# a small room: 3x3 floor, walls, a door, a plate, the exit and the hero
def place(o, x, y):
    c = o.copy(); c.data = o.data; scene.collection.objects.link(c); c.location = (x, y, 0); return c
for x in range(-1, 3):
    for y in range(-1, 2): place(floor, x, y)
for x in (-1, 0, 2): place(wall, x, 2)
place(door, 1, 2); place(plate, -1, 0); place(exitd, 2, 1)
arm.location = (0.5, -0.5, 0) if False else (0, -1, 0)
for o in (floor, wall, door, plate, exitd): o.location = (50, 50, 0)  # originals out of shot
look((.6, .5, .3), 7.5, 52, 15); render('room')
# hero turnaround
for o in scene.objects:
    if o.type == 'MESH' and o.parent != arm: o.hide_render = True
arm.location = (0, 0, 0)
for az, nm in ((0, 'hero_front'), (90, 'hero_side'), (180, 'hero_back')):
    look((0, 0, .5), 2.6, 12, az); render(nm)
print('[assets] done')
