# صدى — builds every game model in code from the reference sheets in docs/reference/
# (hero.png, environment.png) and exports one .glb per slot, plus preview renders.
# Run:  blender -b -P tools/blender/make_assets.py -- <out_dir> <preview_dir>
# Units: 1 Blender unit = 1 m = one grid cell. Blender is Z-up / -Y forward; the glTF exporter
# converts to Y-up / +Z forward, which is what the game expects (docs/ASSETS.md).
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Matrix, Euler

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else 'assets')
PREV = os.path.abspath(argv[1] if len(argv) > 1 else 'docs/previews')
os.makedirs(OUT, exist_ok=True); os.makedirs(PREV, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 60

# ---------- palette (hex from the reference sheets) ----------
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)
SAND, SAND_D, SAND_L = lin('D7B48A'), lin('B08A60'), lin('E6CBA3')
PURPLE, PURPLE_D, PURPLE_L = lin('6C4EB3'), lin('4E3784'), lin('9A82D2')
CAP = lin('E8D6C2'); METAL = lin('3B3F4E'); MOSS, MOSS_D = lin('6E9A3A'), lin('4C7428')
WOOD, WOOD_D = lin('5A3C28'), lin('3E2819')
SKIN, HAIR, HAIR_D = lin('F2C39A'), lin('7A4322'), lin('5A2F17')
GOLD, RED, RED_D = lin('E0A43A'), lin('D23A22'), lin('A8281A')
LEATHER, LEATHER_D, PANTS, BOOT = lin('8A5530'), lin('5E361C'), lin('3E3E48'), lin('6A3E20')
IRIS, INK, WHITE = lin('6B3A1E'), lin('1A120E'), lin('FFFFFF')

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

class Builder:
    """bmesh boxes/blobs with a colour per piece -> one mesh, one vertex-coloured material"""
    def __init__(s): s.bm = bmesh.new(); s.col = s.bm.faces.layers.float_color.new('Col') if False else None; s.pieces = []
    def box(s, sx, sy, sz, cx, cy, z0, color, rot=0.):
        r = bmesh.ops.create_cube(s.bm, size=1); vs = r['verts']
        m = Matrix.Rotation(rot, 4, 'Z')
        for v in vs:
            p = Vector((v.co.x * sx, v.co.y * sy, (v.co.z + .5) * sz)); p = m @ p
            v.co = p + Vector((cx, cy, z0))
        s.pieces.append((vs, color)); return vs
    def blob(s, r, cx, cy, cz, color, sub=1, scale=(1, 1, 1)):
        res = bmesh.ops.create_icosphere(s.bm, subdivisions=sub, radius=r); vs = res['verts']
        for v in vs: v.co = Vector((v.co.x * scale[0] + cx, v.co.y * scale[1] + cy, v.co.z * scale[2] + cz))
        s.pieces.append((vs, color)); return vs
    def to_object(s, name, material, bevel_w=0.):
        me = bpy.data.meshes.new(name)
        colors = {}
        for vs, c in s.pieces:
            for v in vs: colors[v.index] = c
        s.bm.verts.index_update()
        idx = {}
        for vs, c in s.pieces:
            for v in vs: idx[v.index] = c
        s.bm.to_mesh(me); s.bm.free()
        o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); me.materials.append(material)
        a = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        for i in range(len(me.vertices)): a.data[i].color = (*idx.get(i, (1, 1, 1)), 1)
        if bevel_w:
            b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel_w; b.segments = 2; b.limit_method = 'ANGLE'
        return o

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

def jit(rng, c, a=.06):
    k = 1 + rng.uniform(-a, a); return tuple(min(1, x * k) for x in c)

def moss(B, rng, cx, cy, cz, n=5, spread=.06):
    for _ in range(n):
        B.blob(rng.uniform(.018, .03), cx + rng.uniform(-spread, spread), cy + rng.uniform(-spread, spread), cz + rng.uniform(0, .02),
               MOSS if rng.random() < .6 else MOSS_D, sub=1, scale=(1, 1, 1.4))

# ---------- floor tile (ref: "Floor Tile 1x1"): 3x3 sandstone slabs; origin = centre of the TOP face ----------
rng = random.Random(7)
B = Builder()
B.box(.95, .95, .38, 0, 0, -.5, SAND_D)                        # body under the slabs
for i in range(3):
    for j in range(3):
        h = .12 + rng.uniform(-.006, .006)
        B.box(.3, .3, h, (i - 1) * .315 + rng.uniform(-.004, .004), (j - 1) * .315 + rng.uniform(-.004, .004), -.12 + (h - .12) - .002, jit(rng, SAND, .07))
moss(B, rng, -.47, .47, -.01, n=3, spread=.03)
floor = B.to_object('Floor', mat('Sandstone', (1, 1, 1), rough=.92, vcol=True), bevel_w=.018)

# ---------- wall block (ref: "Wall Block 1x1"): stacked chunky purple bricks; origin = base centre ----------
rng = random.Random(11)
B = Builder()
rows = [.27, .25, .25, .25]; z = 0
for ri, h in enumerate(rows):
    sx = rng.uniform(-.1, .1); sy = rng.uniform(-.1, .1)
    for (x0, x1) in ((-.5, sx), (sx, .5)):
        for (y0, y1) in ((-.5, sy), (sy, .5)):
            w, d = x1 - x0 - .025, y1 - y0 - .025
            top = ri == len(rows) - 1
            hh = h - .02 + (rng.uniform(0, .05) if top else 0)
            c = jit(rng, PURPLE_L if top else PURPLE, .1)
            B.box(w, d, hh, (x0 + x1) / 2 + rng.uniform(-.008, .008), (y0 + y1) / 2 + rng.uniform(-.008, .008), z + .01, c)
    z += h
B.box(.93, .93, .99, 0, 0, 0, PURPLE_D)                         # core fills the gaps
moss(B, rng, .47, -.47, 0, n=6); moss(B, rng, -.45, -.48, 0, n=3)
wall = B.to_object('Wall', mat('PurpleStone', (1, 1, 1), rough=.88, vcol=True), bevel_w=.022)

# ---------- door (ref: "Stone Doors"): static brick frame + sliding wood panel ----------
rng = random.Random(5)
B = Builder()
for s in (-1, 1):                                                # pillars of 4 bricks
    zz = 0
    for h in (.24, .22, .22, .22):
        B.box(.15, .42 + rng.uniform(-.02, .02), h - .02, s * .425, 0, zz + .01, jit(rng, PURPLE, .1)); zz += h
for k, x in enumerate((-.33, 0, .33)):                         # lintel
    B.box(.32, .44, .17, x, 0, .9, jit(rng, PURPLE_L, .08))
moss(B, rng, -.45, -.22, 0, n=5); moss(B, rng, .45, -.2, 0, n=3)
door_frame = B.to_object('DoorFrame', mat('PurpleStone', (1, 1, 1), rough=.88, vcol=True), bevel_w=.02)

B = Builder()
B.box(.7, .14, .86, 0, 0, .02, WOOD)                             # wood panel, faces +-Y (glTF +-Z)
for x in (-.25, -.12, .12, .25):                                 # carved vertical grooves
    for s in (-1, 1): B.box(.018, .01, .7, x, s * .073, .1, WOOD_D)
for zz in (.15, .72):
    for s in (-1, 1): B.box(.6, .01, .02, 0, s * .073, zz, WOOD_D)
door = B.to_object('Door', mat('Wood', (1, 1, 1), rough=.75, vcol=True), bevel_w=.01)

# ---------- pressure plate (ref: "Pressure Plates"): dark octagonal metal base + rim; top stays < .07 ----------
B = Builder()
bm = B.bm
res = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=.43, radius2=.4, depth=.05)
for v in res['verts']: v.co = Matrix.Rotation(math.pi / 8, 4, 'Z') @ v.co + Vector((0, 0, .025))
B.pieces.append((res['verts'], METAL))
res = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=.37, radius2=.37, depth=.016)
for v in res['verts']: v.co = Matrix.Rotation(math.pi / 8, 4, 'Z') @ v.co + Vector((0, 0, .056))
B.pieces.append((res['verts'], tuple(x * 1.25 for x in METAL)))
for k in range(8):                                               # rivets
    a = k * math.pi / 4 + math.pi / 8
    B.blob(.018, math.cos(a) * .39, math.sin(a) * .39, .05, lin('8A8F9E'), sub=1, scale=(1, 1, .6))
plate = B.to_object('Plate', mat('PlateMetal', (1, 1, 1), rough=.45, metal=.6, vcol=True), bevel_w=.008)

# ---------- exit (ref: "Exit Ring"): round stepped sandstone dais with a ring of stones ----------
rng = random.Random(3)
B = Builder(); bm = B.bm
for r, z0, h, c in ((.47, 0, .035, SAND_D), (.36, .035, .03, SAND), (.2, .065, .015, SAND_L)):
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=r, radius2=r - .01, depth=h)
    for v in res['verts']: v.co.z += z0 + h / 2
    B.pieces.append((res['verts'], c))
for k in range(10):
    a = k * math.tau / 10
    B.box(.12, .09, .06 + rng.uniform(0, .03), math.cos(a) * .45, math.sin(a) * .45, 0, jit(rng, PURPLE, .1), rot=a)
exitd = B.to_object('Exit', mat('ExitStone', (1, 1, 1), rough=.85, vcol=True), bevel_w=.01)

# ---------- hero (ref: "The Hero"): chibi boy, ~0.95 m, faces -Y (glTF +Z) ----------
M = {k: mat('H_' + k, c, rough=r, metal=m_, emit=e, strength=st) for k, (c, r, m_, e, st) in {
    'skin': (SKIN, .55, 0, None, 0), 'hair': (HAIR, .6, 0, None, 0), 'gold': (GOLD, .3, .8, None, 0),
    'gem': (lin('F2A21E'), .2, .3, lin('FFB13A'), 1.5), 'red': (RED, .7, 0, None, 0), 'leather': (LEATHER, .6, 0, None, 0),
    'leather_d': (LEATHER_D, .6, 0, None, 0), 'pants': (PANTS, .8, 0, None, 0), 'boot': (BOOT, .55, 0, None, 0),
    'white': (WHITE, .2, 0, None, 0), 'iris': (IRIS, .25, 0, None, 0), 'ink': (INK, .3, 0, None, 0), 'brow': (HAIR_D, .7, 0, None, 0),
}.items()}
HERO = []
def hp(kind, bone, m, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), bevel=0., **kw):
    if kind == 'sphere': bpy.ops.mesh.primitive_uv_sphere_add(segments=kw.get('seg', 20), ring_count=kw.get('rings', 12), radius=kw.get('r', .1), location=loc)
    elif kind == 'ico': bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=kw.get('sub', 2), radius=kw.get('r', .1), location=loc)
    elif kind == 'torus': bpy.ops.mesh.primitive_torus_add(major_radius=kw['R'], minor_radius=kw['r'], major_segments=kw.get('seg', 24), minor_segments=8, location=loc)
    elif kind == 'cyl': bpy.ops.mesh.primitive_cylinder_add(vertices=kw.get('seg', 12), radius=kw['r'], depth=kw['d'], location=loc)
    elif kind == 'cone': bpy.ops.mesh.primitive_cone_add(vertices=kw.get('seg', 8), radius1=kw['r1'], radius2=kw.get('r2', 0), depth=kw['d'], location=loc)
    elif kind == 'cube': bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.scale = scale; o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel:
        b = o.modifiers.new('b', 'BEVEL'); b.width = bevel; b.segments = 2; bpy.ops.object.modifier_apply(modifier='b')
    o.data.materials.append(M[m])
    for p in o.data.polygons: p.use_smooth = kind != 'cube' or bevel > 0
    o.vertex_groups.new(name=bone).add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    HERO.append(o); return o

for s, side in ((-1, 'L'), (1, 'R')):
    hp('cube', 'leg.' + side, 'boot', (s * .072, -.012, .045), (.085, .12, .09), bevel=.025)            # boots
    hp('cube', 'leg.' + side, 'gold', (s * .072, -.005, .095), (.088, .1, .02), bevel=.006)             # gold cuff
    hp('cyl', 'leg.' + side, 'pants', (s * .066, 0, .14), r=.045, d=.1)                                  # trousers
    hp('sphere', 'arm.' + side, 'leather', (s * .15, 0, .385), (1, 1, .7), r=.055)                     # shoulder pad
    hp('cyl', 'arm.' + side, 'skin', (s * .17, 0, .32), rot=(0, s * .25, 0), r=.03, d=.12)             # upper arm
    hp('cube', 'arm.' + side, 'leather_d', (s * .185, 0, .255), (.07, .07, .06), bevel=.018)           # bracer
    hp('sphere', 'arm.' + side, 'leather_d', (s * .19, -.005, .21), (1, 1, 1.05), r=.042)              # glove
hp('sphere', 'hips', 'pants', (0, 0, .2), (1.15, .9, .65), r=.1)                                       # shorts
hp('cyl', 'chest', 'pants', (0, 0, .31), (1, .85, 1), r=.11, d=.17)                                   # undershirt
hp('cube', 'chest', 'leather', (0, -.075, .32), (.19, .05, .14), bevel=.02)                            # vest front
for s in (-1, 1): hp('cube', 'chest', 'leather_d', (s * .055, -.1, .33), (.02, .01, .15), rot=(0, s * .35, 0))  # straps
hp('torus', 'hips', 'leather_d', (0, 0, .245), (1, .85, 1), R=.115, r=.022)                           # belt
hp('cube', 'hips', 'gold', (0, -.105, .245), (.05, .02, .05), rot=(0, math.pi / 4, 0), bevel=.006)    # buckle (diamond)
hp('cube', 'hips', 'leather', (.1, -.06, .215), (.06, .045, .065), bevel=.012)                         # pouch
hp('torus', 'chest', 'red', (0, 0, .425), (1, .9, .8), R=.105, r=.05)                                  # scarf ring
hp('cube', 'scarf', 'red', (-.06, .13, .36), (.07, .02, .18), rot=(.3, 0, .2), bevel=.006)             # scarf tails
hp('cube', 'scarf', 'red', (.05, .14, .33), (.07, .02, .22), rot=(.35, 0, -.25), bevel=.006)
hp('cube', 'scarf', 'gold', (.05, .155, .25), (.035, .01, .035), rot=(.35, math.pi / 4, -.25))
# head
hp('sphere', 'head', 'skin', (0, 0, .64), (1, .93, .95), seg=28, rings=16, r=.205)
for s in (-1, 1): hp('sphere', 'head', 'skin', (s * .2, .01, .63), (.5, .8, 1), r=.04)                # ears
for s in (-1, 1):                                                                                       # big eyes
    hp('sphere', 'head', 'white', (s * .072, -.165, .62), (.85, .45, 1.15), r=.045)
    hp('sphere', 'head', 'iris', (s * .072, -.182, .615), (.85, .4, 1.1), r=.034)
    hp('sphere', 'head', 'ink', (s * .072, -.191, .612), (.8, .4, 1.05), r=.018)
    hp('sphere', 'head', 'white', (s * .072 + s * -.012, -.198, .63), (1, .5, 1), r=.008)
    hp('cube', 'head', 'brow', (s * .075, -.168, .688), (.07, .02, .018), rot=(0, s * -.25, 0), bevel=.006)  # brows
hp('sphere', 'head', 'ink', (0, -.188, .545), (1, .4, .35), r=.02)                                     # small smile
hp('sphere', 'head', 'skin', (0, -.2, .585), (1, .8, .8), r=.014)                                     # nose
# hair: cap over top/back + spikes + front bangs (ref: brown spiky hair)
hp('sphere', 'head', 'hair', (0, .025, .675), (1.06, 1.05, .9), seg=24, rings=14, r=.215)
rng = random.Random(21)
for k in range(16):
    a = k / 16 * math.tau; el = rng.uniform(.25, .95)
    d = Vector((math.sin(a) * math.cos(el), math.cos(a) * math.cos(el) * .9 + .25, math.sin(el))).normalized()
    if d.y < -.2 and el < .5: continue                         # keep the face clear
    base = Vector((0, .02, .68)) + d * .17
    q = d.to_track_quat('Z', 'Y').to_euler()
    hp('cone', 'head', 'hair', tuple(base + d * .06), rot=tuple(q), r1=.06, d=.15, seg=6)
for k, x in enumerate((-.11, -.04, .04, .11)):                 # bangs falling over the forehead
    hp('cone', 'head', 'hair', (x, -.15, .74), rot=(math.radians(200), 0, x * 2), r1=.05, d=.13, seg=6)
hp('torus', 'head', 'gold', (0, .005, .705), (1.02, .97, 1), rot=(-.12, 0, 0), R=.208, r=.018, seg=32)  # headband
hp('ico', 'head', 'gem', (0, -.215, .71), (.6, .35, .75), rot=(0, math.pi / 4, 0), sub=1, r=.05)     # diamond gem
hp('cube', 'head', 'gold', (0, -.205, .71), (.075, .015, .075), rot=(0, math.pi / 4, 0), bevel=.005)

select_only(HERO); bpy.ops.object.join(); body = bpy.context.active_object; body.name = 'HeroMesh'

arm_data = bpy.data.armatures.new('HeroRig'); arm = bpy.data.objects.new('Hero', arm_data)
scene.collection.objects.link(arm); select_only([arm]); bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
def bone(n, h, t, parent=None):
    b = eb.new(n); b.head = h; b.tail = t
    if parent: b.parent = eb[parent]
bone('root', (0, 0, 0), (0, 0, .08)); bone('hips', (0, 0, .08), (0, 0, .26), 'root')
bone('chest', (0, 0, .26), (0, 0, .43), 'hips'); bone('head', (0, 0, .43), (0, 0, .9), 'chest')
bone('arm.L', (-.15, 0, .39), (-.19, 0, .2), 'chest'); bone('arm.R', (.15, 0, .39), (.19, 0, .2), 'chest')
bone('leg.L', (-.07, 0, .2), (-.07, 0, .02), 'hips'); bone('leg.R', (.07, 0, .2), (.07, 0, .02), 'hips')
bone('scarf', (0, .12, .43), (0, .17, .25), 'chest')
bpy.ops.object.mode_set(mode='OBJECT')
body.parent = arm; body.modifiers.new('rig', 'ARMATURE').object = arm

BONES = ['root', 'hips', 'chest', 'head', 'arm.L', 'arm.R', 'leg.L', 'leg.R', 'scarf']
def clip(name, last, keys):
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

# arm bones point down: local X rotation swings the arm forward/back, local Z swings it out sideways
clip('idle', 120, [
    (30, 'chest', 'scale', (1.02, 1.02, 1.02)), (90, 'chest', 'scale', (1.02, 1.02, 1.02)),
    (45, 'head', 'rotation_euler', (0, .05, .04)), (105, 'head', 'rotation_euler', (0, -.05, -.04)),
    (30, 'arm.L', 'rotation_euler', (0, 0, -.06)), (90, 'arm.R', 'rotation_euler', (0, 0, .06)),
    (30, 'scarf', 'rotation_euler', (.25, 0, 0)), (90, 'scarf', 'rotation_euler', (-.1, 0, 0)),
])
clip('hop', 10, [
    (2, 'root', 'scale', (1.1, .85, 1.1)), (5, 'root', 'scale', (.94, 1.1, .94)), (9, 'root', 'scale', (1.05, .93, 1.05)),
    (5, 'leg.L', 'rotation_euler', (.6, 0, 0)), (5, 'leg.R', 'rotation_euler', (-.4, 0, 0)),
    (5, 'arm.L', 'rotation_euler', (-.5, 0, -.5)), (5, 'arm.R', 'rotation_euler', (.5, 0, .5)),
    (5, 'scarf', 'rotation_euler', (-.9, 0, 0)),
])
clip('bump', 10, [
    (3, 'head', 'rotation_euler', (-.3, 0, 0)), (3, 'root', 'scale', (1.08, .9, 1.08)),
    (3, 'arm.L', 'rotation_euler', (-.8, 0, 0)), (3, 'arm.R', 'rotation_euler', (-.8, 0, 0)), (6, 'head', 'rotation_euler', (.1, 0, 0)),
])
clip('land', 24, [
    (3, 'root', 'scale', (1.18, .78, 1.18)), (9, 'root', 'scale', (.96, 1.05, .96)),
    (3, 'arm.L', 'rotation_euler', (0, 0, -.7)), (3, 'arm.R', 'rotation_euler', (0, 0, .7)), (5, 'scarf', 'rotation_euler', (.8, 0, 0)),
])
clip('cheer', 48, [
    (8, 'arm.R', 'rotation_euler', (-2.6, 0, .3)), (40, 'arm.R', 'rotation_euler', (-2.6, 0, .3)),
    (8, 'arm.L', 'rotation_euler', (0, 0, -.5)), (40, 'arm.L', 'rotation_euler', (0, 0, -.5)),
    (12, 'head', 'rotation_euler', (.15, 0, .15)), (24, 'head', 'rotation_euler', (.15, 0, -.15)), (36, 'head', 'rotation_euler', (.15, 0, .15)),
    (10, 'scarf', 'rotation_euler', (-1.1, 0, .4)), (26, 'scarf', 'rotation_euler', (-1.1, 0, -.4)),
])
arm.animation_data.action = bpy.data.actions['idle']

# ---------- export ----------
export('floor', [floor]); export('wall', [wall]); export('door', [door]); export('door_frame', [door_frame])
export('plate', [plate]); export('exit', [exitd]); export('hero', [arm, body], anim=True)

# ---------- previews (Cycles, CPU), lit and framed like the reference sheets ----------
scene.render.engine = 'CYCLES'; scene.cycles.samples = 64; scene.cycles.device = 'CPU'
scene.render.resolution_x, scene.render.resolution_y = 1000, 760
world = bpy.data.worlds.new('Studio'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*lin('C9C6CC'), 1); bg.inputs['Strength'].default_value = .9
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3.2; sun.data.color = (1, .9, .78); sun.data.angle = .3; sun.rotation_euler = (math.radians(45), 0, math.radians(-40))
fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'SUN')); scene.collection.objects.link(fill)
fill.data.energy = .8; fill.data.color = (.75, .8, 1); fill.rotation_euler = (math.radians(60), 0, math.radians(140))
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 50

def look(target, dist, elev, azim):
    t = Vector(target); e, a = math.radians(elev), math.radians(azim)
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
def render(name):
    scene.render.filepath = os.path.join(PREV, name + '.png'); bpy.ops.render.render(write_still=True); print('[assets] preview', name)
def place(o, x, y, rz=0):
    c = o.copy(); c.data = o.data; scene.collection.objects.link(c); c.location = (x, y, 0); c.rotation_euler = (0, 0, rz); return c

# 1) asset line-up like the environment sheet
ORIG = [floor, wall, door, door_frame, plate, exitd]
for o in ORIG: o.hide_render = True
arm.hide_render = body.hide_render = True
line = [place(floor, 0, 0), place(wall, 1.4, 0), place(door_frame, 2.8, 0), place(door, 2.8, 0), place(plate, 4.2, 0), place(exitd, 5.6, 0)]
look((2.8, 0, .35), 8.5, 28, 35); render('assets_lineup')
for o in line: o.hide_render = True

# 2) a small room like "Path to Exit" / "In Game Example", with the hero
room = []
for x in range(0, 4):
    for y in range(0, 3): room.append(place(floor, x, y))
for x in (0, 1, 3): room.append(place(wall, x, 3))
room += [place(door_frame, 2, 3), place(door, 2, 3), place(plate, 0, 1), place(exitd, 3, 2)]
for y in (0, 1, 2): room.append(place(wall, -1, y))
arm.hide_render = body.hide_render = False; arm.location = (1.2, .6, 0)
look((1.5, 1.5, .3), 8.0, 50, 25); render('room')
for o in room: o.hide_render = True

# 3) hero turnaround + two poses
arm.location = (0, 0, 0)
for az, nm in ((0, 'hero_front'), (180, 'hero_back'), (40, 'hero_34')):
    look((0, 0, .48), 2.4, 8, az); render(nm)
for act, f in (('cheer', 20), ('hop', 5)):
    arm.animation_data.action = bpy.data.actions[act]; scene.frame_set(f)
    look((0, 0, .5), 2.6, 8, 20); render('hero_' + act)
print('[assets] done')
