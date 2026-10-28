# Cuts the art sheets in mobile2d/art_src into single sprites for the game (mobile2d/art/*.png).
# The generated PNGs have near-zero-alpha coloured noise around the objects and ~252 alpha inside:
# clean the alpha first, then split each sheet into its objects (left to right), trim, and scale.
#   python3 -I mobile2d/tools/slice.py mobile2d/art_src mobile2d/art
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

def clean(im):
    a = np.array(im.convert('RGBA')).astype(np.float32)
    al = a[..., 3]
    al = np.clip((al - 40) / (240 - 40), 0, 1) * 255          # noise (alpha < 40) -> 0, body (~252) -> 255
    a[..., 3] = al
    return a

def pieces(a, min_area, gap):
    mask = a[..., 3] > 128
    grown = ndimage.binary_dilation(mask, iterations=gap)       # join a sprite's own bits (sparkles, beams)
    lab, n = ndimage.label(grown)
    boxes = []
    for sl in ndimage.find_objects(lab):
        ys, xs = sl
        if (ys.stop - ys.start) * (xs.stop - xs.start) < min_area: continue
        sub = mask[sl]
        if sub.sum() < min_area * .15: continue
        boxes.append((xs.start, ys.start, xs.stop, ys.stop))
    boxes.sort(key=lambda b: b[0])
    return boxes

def crop(a, b, pad=4):
    x0, y0, x1, y1 = b
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad); x1, y1 = min(a.shape[1], x1 + pad), min(a.shape[0], y1 + pad)
    sub = a[y0:y1, x0:x1].copy()
    m = sub[..., 3] > 8
    ys, xs = np.where(m)
    sub = sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return Image.fromarray(sub.astype(np.uint8), 'RGBA'), (x0 + xs.min(), y0 + ys.min())

meta = {}
def sheet(name, names, min_area=4000, gap=6, width=None, height=None):
    a = clean(Image.open(os.path.join(SRC, name)))
    bs = pieces(a, min_area, gap)
    if len(bs) != len(names):
        print(f'!! {name}: found {len(bs)} pieces, expected {len(names)}: {bs}')
    for b, nm in zip(bs, names):
        im, org = crop(a, b)
        if nm == 'face_sleep':   # the generated sheet drew "zzz" over the sleeping face: remove the blue letters
            arr = np.array(im).astype(np.int32)
            blue = (arr[..., 2] > arr[..., 0] + 40) & (arr[..., 2] > arr[..., 1] + 10)
            blue = ndimage.binary_dilation(blue, iterations=2)
            arr[blue, 3] = 0
            im = Image.fromarray(arr.astype(np.uint8), 'RGBA')
        if width and im.width > width: im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        if height and im.height > height: im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
        im.save(os.path.join(OUT, nm + '.png'), optimize=True)
        meta[nm] = {'w': im.width, 'h': im.height, 'src': name, 'box': [int(v) for v in b]}
        print(f'{nm:16s} {im.width}x{im.height}')

sheet('tiles.png', ['floor', 'floor4', 'wall', 'wall_moss', 'floor_crack'], width=300)
sheet('objects.png', ['door_frame', 'door_panel', 'plate', 'plate_down', 'exit'], width=300, gap=10)
sheet('island_pieces.png', ['isl_long', 'isl_small_a', 'isl_small_b', 'isl_side', 'isl_mid_a', 'isl_mid_b'], width=420, gap=4)
sheet('fox_turnaround.png', ['fox_front', 'fox_34', 'fox_side', 'fox_back'], height=420, gap=4)
sheet('fox_faces.png', ['face_calm', 'face_happy', 'face_oops', 'face_worry', 'face_cheer', 'face_sleep'], height=330, gap=4)
sheet('fox_walk.png', [f'walk{k}' for k in range(8)], height=380, gap=3)
json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)

# one script with every sprite as a WebP data URI (the page must be a single self-contained file)
import base64, io, glob
art = {}
for f in sorted(glob.glob(os.path.join(OUT, '*.png'))):
    buf = io.BytesIO(); Image.open(f).save(buf, 'WEBP', quality=88, method=6)
    art[os.path.splitext(os.path.basename(f))[0]] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()
open(os.path.join(OUT, 'art.js'), 'w').write('window.ART = ' + json.dumps(art) + ';\n')
print('art.js', sum(len(v) for v in art.values()) // 1024, 'KB')
