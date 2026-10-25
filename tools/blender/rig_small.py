# Auto-rig for small chibi characters (gnome / hero): bones placed from proportions of the height,
# automatic (heat) weights with a nearest-bone fallback, and short in-place clips the game uses:
# idle, hop (one 165 ms step), bump, land, cheer.  Model must face -Y, feet at z = 0.
import bpy, math
from mathutils import Vector
from mathutils.geometry import intersect_point_line

def _select(objs, active):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active

def build(mesh, H, kind='gnome'):
    scene = bpy.context.scene
    # proportions (fractions of height), measured on the gnome reference renders
    P = dict(hip=.33, chest=.5, neck=.56, head_top=.7, hat_tip=1.0, shoulder=.47, hand=.32, arm_x=.2, sh_x=.12, leg_x=.075, knee=.17)
    hx = lambda f: f * H
    data = bpy.data.armatures.new(mesh.name + 'Rig'); arm = bpy.data.objects.new(mesh.name + '_rig', data)
    scene.collection.objects.link(arm); _select([arm], arm); bpy.ops.object.mode_set(mode='EDIT')
    eb = data.edit_bones
    def bone(n, h, t, parent=None, connect=False):
        b = eb.new(n); b.head = Vector(h); b.tail = Vector(t)
        if parent: b.parent = eb[parent]; b.use_connect = connect
    bone('root', (0, 0, 0), (0, 0, hx(.08)))
    bone('hips', (0, 0, hx(.24)), (0, 0, hx(P['hip'] + .05)), 'root')
    bone('spine', (0, 0, hx(P['hip'] + .05)), (0, 0, hx(P['neck'])), 'hips', True)
    bone('head', (0, 0, hx(P['neck'])), (0, 0, hx(P['head_top'])), 'spine', True)
    bone('hat', (0, 0, hx(P['head_top'])), (0, hx(.05), hx(.88)), 'head', True)
    bone('hat_tip', (0, hx(.05), hx(.88)), (0, hx(.1), hx(P['hat_tip'])), 'hat', True)
    for s, side in ((1, 'L'), (-1, 'R')):
        bone('arm.' + side, (s * hx(P['sh_x']), 0, hx(P['shoulder'])), (s * hx(P['arm_x']), 0, hx(P['hand'] + .05)), 'spine')
        bone('hand.' + side, (s * hx(P['arm_x']), 0, hx(P['hand'] + .05)), (s * hx(P['arm_x'] + .01), 0, hx(P['hand'] - .04)), 'arm.' + side, True)
        bone('leg.' + side, (s * hx(P['leg_x']), 0, hx(.26)), (s * hx(P['leg_x']), 0, hx(.08)), 'hips')
        bone('foot.' + side, (s * hx(P['leg_x']), 0, hx(.08)), (s * hx(P['leg_x']), -hx(.08), hx(.02)), 'leg.' + side, True)
    bpy.ops.object.mode_set(mode='OBJECT')

    # weights: heat diffusion, then nearest-bone for anything it missed
    _select([mesh, arm], arm)
    try: bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    except Exception as e: print('[rig] heat weights failed:', e)
    if not any(m.type == 'ARMATURE' for m in mesh.modifiers):
        mesh.parent = arm; mesh.modifiers.new('rig', 'ARMATURE').object = arm
    groups = {g.index: g.name for g in mesh.vertex_groups}
    segs = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in data.bones if b.name != 'root'}
    for b in segs:
        if b not in mesh.vertex_groups: mesh.vertex_groups.new(name=b)
    missed = 0
    for v in mesh.data.vertices:
        if sum(g.weight for g in v.groups) > 1e-3: continue
        missed += 1
        p = mesh.matrix_world @ v.co
        d = []
        for n, (a, c) in segs.items():
            q, t = intersect_point_line(p, a, c); t = min(1, max(0, t)); d.append(((p - (a + (c - a) * t)).length, n))
        d.sort(); w0 = 1 / (d[0][0] + 1e-4) ** 2; w1 = 1 / (d[1][0] + 1e-4) ** 2
        mesh.vertex_groups[d[0][1]].add([v.index], w0 / (w0 + w1), 'REPLACE')
        mesh.vertex_groups[d[1][1]].add([v.index], w1 / (w0 + w1), 'REPLACE')
    print('[rig] vertices weighted by fallback:', missed, 'of', len(mesh.data.vertices))
    # keep arms out of the head, beard and hat: above the shoulders only head/hat bones may move vertices
    sh_z, neck_z, top_z = hx(P['shoulder']), hx(P['neck']), hx(P['head_top'])
    vg = mesh.vertex_groups
    limb = [vg[n].index for n in ('arm.L', 'arm.R', 'hand.L', 'hand.R') if n in vg]
    moved = 0
    for v in mesh.data.vertices:
        p = mesh.matrix_world @ v.co
        if p.z < sh_z + hx(.02) or abs(p.x) > hx(P['arm_x'] + .06): continue
        w = sum(g.weight for g in v.groups if g.group in limb)
        if w <= 0: continue
        for gi in limb: vg[gi].remove([v.index])
        target = 'hat' if p.z > top_z else ('head' if p.z > neck_z - hx(.06) else 'spine')
        vg[target].add([v.index], w, 'ADD'); moved += 1
    print('[rig] limb weights moved off head/beard/hat:', moved)
    _select([mesh], mesh); bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)

    # clips (60 fps). Bone-local: Y runs along the bone; X rotation = bend forward/back
    scene.render.fps = 60
    names = [b.name for b in data.bones]
    def clip(name, last, keys):
        act = bpy.data.actions.new(name); act.use_fake_user = True
        arm.animation_data_create(); arm.animation_data.action = act
        for b in names:
            pb = arm.pose.bones[b]; pb.rotation_mode = 'XYZ'
            for f in (0, last):
                pb.location = (0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
                for prop in ('location', 'rotation_euler', 'scale'): pb.keyframe_insert(prop, frame=f)
        for f, b, prop, val in keys:
            pb = arm.pose.bones[b]; setattr(pb, prop, val); pb.keyframe_insert(prop, frame=f)
        for b in names:
            pb = arm.pose.bones[b]; pb.location = (0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
    clip('idle', 120, [
        (30, 'spine', 'scale', (1.03, 1.02, 1.03)), (90, 'spine', 'scale', (1.03, 1.02, 1.03)),
        (40, 'head', 'rotation_euler', (0, .16, .04)), (70, 'head', 'rotation_euler', (-.06, 0, 0)), (100, 'head', 'rotation_euler', (0, -.16, -.04)),
        (30, 'hat_tip', 'rotation_euler', (.22, 0, .14)), (90, 'hat_tip', 'rotation_euler', (-.16, 0, -.14)),
        (30, 'arm.L', 'rotation_euler', (.08, 0, .06)), (90, 'arm.R', 'rotation_euler', (.08, 0, -.06)),
    ])
    # walk: one full stride per 0.6 s (two grid steps), loops in the game
    clip('walk', 36, [
        (9, 'leg.L', 'rotation_euler', (.55, 0, 0)), (9, 'leg.R', 'rotation_euler', (-.45, 0, 0)),
        (27, 'leg.L', 'rotation_euler', (-.45, 0, 0)), (27, 'leg.R', 'rotation_euler', (.55, 0, 0)),
        (9, 'arm.L', 'rotation_euler', (-.4, 0, 0)), (9, 'arm.R', 'rotation_euler', (.4, 0, 0)),
        (27, 'arm.L', 'rotation_euler', (.4, 0, 0)), (27, 'arm.R', 'rotation_euler', (-.4, 0, 0)),
        (4, 'root', 'scale', (1.02, .97, 1.02)), (9, 'root', 'scale', (.99, 1.03, .99)), (22, 'root', 'scale', (1.02, .97, 1.02)), (27, 'root', 'scale', (.99, 1.03, .99)),
        (9, 'spine', 'rotation_euler', (0, .08, 0)), (27, 'spine', 'rotation_euler', (0, -.08, 0)),
        (9, 'head', 'rotation_euler', (0, -.05, .04)), (27, 'head', 'rotation_euler', (0, .05, -.04)),
        (12, 'hat_tip', 'rotation_euler', (-.25, 0, .15)), (18, 'hat_tip', 'rotation_euler', (.1, 0, 0)), (30, 'hat_tip', 'rotation_euler', (-.25, 0, -.15)),
    ])
    clip('hop', 10, [
        (2, 'root', 'scale', (1.06, .9, 1.06)), (5, 'root', 'scale', (.96, 1.06, .96)), (9, 'root', 'scale', (1.03, .96, 1.03)),
        (5, 'leg.L', 'rotation_euler', (.5, 0, 0)), (5, 'leg.R', 'rotation_euler', (-.35, 0, 0)),
        (5, 'arm.L', 'rotation_euler', (-.45, 0, 0)), (5, 'arm.R', 'rotation_euler', (.45, 0, 0)),
        (5, 'hat_tip', 'rotation_euler', (-.4, 0, 0)), (8, 'hat_tip', 'rotation_euler', (.25, 0, 0)),
    ])
    clip('bump', 10, [
        (3, 'spine', 'rotation_euler', (-.2, 0, 0)), (3, 'head', 'rotation_euler', (-.15, 0, 0)), (3, 'root', 'scale', (1.05, .93, 1.05)),
        (3, 'arm.L', 'rotation_euler', (-.6, 0, 0)), (3, 'arm.R', 'rotation_euler', (-.6, 0, 0)), (3, 'hat_tip', 'rotation_euler', (.5, 0, 0)),
    ])
    clip('land', 24, [
        (3, 'root', 'scale', (1.12, .84, 1.12)), (9, 'root', 'scale', (.97, 1.04, .97)),
        (3, 'arm.L', 'rotation_euler', (0, 0, .5)), (3, 'arm.R', 'rotation_euler', (0, 0, -.5)), (5, 'hat_tip', 'rotation_euler', (.6, 0, 0)),
    ])
    # cheer without raising the arms overhead: the auto-weighted AI mesh tears when the arms pass the beard
    clip('cheer', 48, [
        (8, 'root', 'scale', (1.06, .92, 1.06)), (16, 'root', 'scale', (.96, 1.06, .96)), (28, 'root', 'scale', (1.05, .94, 1.05)), (38, 'root', 'scale', (.97, 1.04, .97)),
        (10, 'arm.L', 'rotation_euler', (-.35, 0, .45)), (38, 'arm.L', 'rotation_euler', (-.35, 0, .45)),
        (10, 'arm.R', 'rotation_euler', (-.35, 0, -.45)), (38, 'arm.R', 'rotation_euler', (-.35, 0, -.45)),
        (12, 'head', 'rotation_euler', (.12, 0, .14)), (24, 'head', 'rotation_euler', (.12, 0, -.14)), (36, 'head', 'rotation_euler', (.12, 0, .14)),
        (12, 'hat_tip', 'rotation_euler', (-.5, 0, .35)), (28, 'hat_tip', 'rotation_euler', (.45, 0, -.35)), (42, 'hat_tip', 'rotation_euler', (-.2, 0, .1)),
    ])
    arm.animation_data.action = bpy.data.actions['idle']
    arm.rotation_mode = 'XYZ'
    return arm
