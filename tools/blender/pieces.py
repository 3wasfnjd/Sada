# صدى — turns the artist's combined scene (models_src/pieces/all.gltf, one root object per piece) into
# light game pieces: every piece is joined into ONE mesh, flat faces are merged without changing the
# shape (planar dissolve only), material colours move into vertex colours so each piece draws with
# 1-3 materials (stone / glow / haze), point lights are dropped (the game uses emissive), and each
# piece gets the pivot the game expects. Doors are split into a static frame and a sinking panel.
# Run:  blender -b -P tools/blender/pieces.py -- <scene.gltf> <out_dir> <preview_dir>
import bpy, bmesh, sys, os, json, math
from mathutils import Vector, Matrix

SRC, OUT, PREV = sys.argv[sys.argv.index('--') + 1:][:3]
OUT, PREV = os.path.abspath(OUT), os.path.abspath(PREV)
os.makedirs(OUT, exist_ok=True); os.makedirs(PREV, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=SRC)

# piece -> how the game uses it
FLOORS = ['FloorTile_1x1']
WALLS = ['WallBlock_1x1']
DOORS = ['CircleDoor', 'TriangleDoor', 'SquareDoor', 'DiamondDoor']   # same order as the game's door colours
PLATES = ['AmberPlate', 'PinkPlate', 'MintPlate', 'VioletPlate']
EXITS = ['ExitRing']
WANT = FLOORS + WALLS + DOORS + PLATES + EXITS

def descendants(o):
    out = []
    for c in o.children: out.append(c); out += descendants(c)
    return out

def sel(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]

def mat_info(m):
    col, emi, alpha = (1, 1, 1), (0, 0, 0), 1.0
    if m and m.use_nodes:
        b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b:
            c = b.inputs['Base Color'].default_value; col = (c[0], c[1], c[2]); alpha = b.inputs['Alpha'].default_value
            e = b.inputs['Emission Color'].default_value; s = b.inputs['Emission Strength'].default_value
            emi = (e[0] * s, e[1] * s, e[2] * s)
    return col, emi, alpha

def kind_of(m):
    n = (m.name if m else '')
    if 'Haze' in n: return 'haze'
    if n.startswith('Glow_'): return 'glow'
    return 'stone'

NEW = {}
def new_mat(kind):
    if kind in NEW: return NEW[kind]
    m = bpy.data.materials.new('Sada_' + kind); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .85 if kind == 'stone' else .4
    if kind in ('glow', 'haze'):
        nt.links.new(vc.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 2.5
    if kind == 'haze':
        b.inputs['Alpha'].default_value = .18; m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    NEW[kind] = m; return m

def build(name, parts):
    """join parts -> one mesh, planar-dissolve, vertex colours from materials, 1-3 materials"""
    meshes = [p for p in parts if p.type == 'MESH']
    for p in meshes:
        p.data = p.data.copy()
    sel(meshes); bpy.ops.object.duplicate(); dup = list(bpy.context.selected_objects)
    for d in dup: d.parent = None
    for d in dup:
        mw = d.matrix_world.copy(); d.parent = None; d.matrix_world = mw
    sel(dup); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(dup) > 1: bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name
    before = sum(len(p.vertices) - 2 for p in o.data.polygons)
    # merge coplanar faces only (keeps the silhouette), never across materials
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1.0), verts=bm.verts, edges=bm.edges, delimit={'MATERIAL', 'SEAM', 'SHARP'})
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()
    # colours -> vertex colours (per face corner), materials -> stone/glow/haze
    me = o.data; slots = [s.material for s in o.material_slots]
    info = [mat_info(m) for m in slots]; kinds = [kind_of(m) for m in slots]
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    order = []
    for k in ('stone', 'glow', 'haze'):
        if k in kinds: order.append(k)
    for poly in me.polygons:
        mi = poly.material_index if poly.material_index < len(slots) else 0
        col, emi, alpha = info[mi]
        c = emi if kinds[mi] != 'stone' and max(emi) > 0 else col
        if kinds[mi] != 'stone': c = tuple(min(1, x) for x in c)
        for li in poly.loop_indices: attr.data[li].color = (*c, 1)
        poly.material_index = order.index(kinds[mi]) if kinds[mi] in order else 0
    me.materials.clear()
    for k in order: me.materials.append(new_mat(k))
    for p in me.polygons: p.use_smooth = False
    after = sum(len(p.vertices) - 2 for p in me.polygons)
    return o, before, after

def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi

def place(objs, lo, hi, top=False, scale=(1, 1, 1)):
    c = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, hi.z if top else lo.z))
    for o in objs:
        o.location -= c; o.scale = scale
        sel([o]); bpy.ops.object.transform_apply(location=True, scale=True)

def export(o, name):
    sel([o])
    kw = dict(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
    try: bpy.ops.export_scene.gltf(**kw, export_vertex_color='MATERIAL', export_lights=False)
    except TypeError: bpy.ops.export_scene.gltf(**kw)

roots = {o.name: o for o in scene.objects if o.parent is None}
report = {}
for name in WANT:
    root = roots.get(name)
    if not root: print('[pieces] missing', name); continue
    parts = [p for p in descendants(root) if p.type == 'MESH']
    if name in DOORS:
        panel = [p for p in parts if any(k in p.name for k in ('_panel', '_glow'))]
        frame = [p for p in parts if p not in panel]
        f, b1, a1 = build(name + '_frame', frame); d, b2, a2 = build(name + '_panel', panel)
        lo, hi = bounds([f, d]); place([f, d], lo, hi)
        export(f, name + '_frame'); export(d, name + '_panel')
        report[name] = {'source_tris': b1 + b2, 'game_tris': a1 + a2, 'size': [round(v, 3) for v in (hi - lo)], 'materials': len(f.data.materials) + len(d.data.materials)}
        continue
    o, b, a = build(name, parts)
    lo, hi = bounds([o])
    if name in FLOORS: place([o], lo, hi, top=True)
    elif name in WALLS:
        sx, sy = 1.0 / (hi.x - lo.x), 1.0 / (hi.y - lo.y); place([o], lo, hi, scale=(sx, sy, 1))
    else: place([o], lo, hi)
    export(o, name)
    report[name] = {'source_tris': b, 'game_tris': a, 'size': [round(v, 3) for v in (hi - lo)], 'materials': len(o.data.materials)}

json.dump(report, open(os.path.join(OUT, 'pieces.report.json'), 'w'), indent=1)
print('[pieces]', json.dumps(report, indent=1))
