# Reads every .glb in assets/ and writes assets/report.json: meshes, materials, triangles, bounds, animations.
import json, struct, glob, os
out = {}
for path in sorted(glob.glob('assets/*.glb')):
    data = open(path, 'rb').read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    g = json.loads(data[20:20 + jlen])
    acc = g.get('accessors', [])
    tris, lo, hi = 0, [1e9] * 3, [-1e9] * 3
    for m in g.get('meshes', []):
        for p in m['primitives']:
            if 'indices' in p: tris += acc[p['indices']]['count'] // 3
            a = acc[p['attributes']['POSITION']]
            lo = [min(x, y) for x, y in zip(lo, a['min'])]; hi = [max(x, y) for x, y in zip(hi, a['max'])]
    anims = {}
    for an in g.get('animations', []):
        anims[an.get('name')] = round(max(acc[s['input']]['max'][0] for s in an['samplers']), 3)
    out[os.path.basename(path)] = {
        'bytes': len(data), 'meshes': len(g.get('meshes', [])), 'materials': [m.get('name') for m in g.get('materials', [])],
        'triangles': tris, 'min': [round(v, 3) for v in lo], 'max': [round(v, 3) for v in hi],
        'skins': len(g.get('skins', [])), 'animations': anims,
        'vertex_colors': any('COLOR_0' in p['attributes'] for m in g.get('meshes', []) for p in m['primitives']),
    }
json.dump(out, open('assets/report.json', 'w'), indent=1, ensure_ascii=False)
print(json.dumps(out, indent=1, ensure_ascii=False))
