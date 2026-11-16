"""Build the 3D body data from the MakeHuman / MPFB2 assets (CC0) as packaged in github.com/naver/anny.

    python3 scripts/build-body.py /path/to/anny/src/anny/data/mpfb2

Writes, for each sex, public/body/<sex>.json (layout, bones) and public/body/<sex>.bin.gz (numbers, gzipped).
The app morphs this mesh in the browser to match a person's measurements, so nothing here is specific to anyone.
"""
import gzip, json, sys
import shutil
from pathlib import Path
import numpy as np

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / 'public' / 'body'
out.mkdir(parents=True, exist_ok=True)

# ---- base mesh: keep the body and the eyeballs; drop clothing helpers
verts, faces, group, cubes, eyes = [], [], '', {}, {'helper-l-eye': set(), 'helper-r-eye': set()}
KEEP = lambda g: g == 'body' or g in ('helper-l-eye', 'helper-r-eye')
for line in (src / '3dobjs' / 'base.obj').read_text().splitlines():
    if line.startswith('v '):
        verts.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '):
        group = line.split()[1]
    elif line.startswith('f ') and group.startswith('joint-'):
        cubes.setdefault(group, set()).update(int(p.split('/')[0]) - 1 for p in line.split()[1:])
    elif line.startswith('f ') and KEEP(group):
        idx = [int(p.split('/')[0]) - 1 for p in line.split()[1:]]
        if group in eyes:
            eyes[group].update(idx)
        faces += [[idx[0], idx[1], idx[2]]] + ([[idx[0], idx[2], idx[3]]] if len(idx) == 4 else [])
verts = np.array(verts, dtype=np.float64)
faces = np.array(faces)

rig = json.loads((src / 'rigs' / 'standard' / 'rig.game_engine.json').read_text())
weights = json.loads((src / 'rigs' / 'standard' / 'weights.game_engine.json').read_text())['weights']

# A joint sits at the centre of a small helper cube in the mesh (or the mean of listed vertices), so it moves with the shape.
def joint(end):
    return sorted(cubes[end['cube_name']]) if end['strategy'] == 'CUBE' else end['vertex_indices']

# ---- compact numbering: vertices that are drawn, plus the helper vertices that place the joints
used = set(faces.flatten().tolist())
for bone in rig.values():
    for end in ('head', 'tail'):
        used.update(joint(bone[end]))
order = sorted(used)
remap = {old: new for new, old in enumerate(order)}
N = len(order)
assert N < 65536
base = verts[order]
tris = np.vectorize(remap.get)(faces).astype(np.uint16)

def target(path):
    full = np.zeros((len(verts), 3))
    with gzip.open(src / 'targets' / path, 'rt') as f:
        for line in f:
            if line.startswith('#') or not line.strip():
                continue
            i, x, y, z = line.split()
            full[int(i)] = [float(x), float(y), float(z)]
    return full[order]

def macro(sex, muscle='average', weight='average'):
    return target(f'macrodetails/universal-{sex}-young-{muscle}muscle-{weight}weight.target.gz')

def pack(sex):
    blob, layout = bytearray(), {}
    def put(name, array, **extra):
        while len(blob) % 4:
            blob.append(0)
        layout[name] = {'offset': len(blob), 'length': int(array.size), 'type': array.dtype.name, **extra}
        blob.extend(array.tobytes())

    # A target is stored as the vertices it moves and how far, in 127ths of its largest movement.
    def put_target(name, delta):
        rows = np.nonzero(np.abs(delta).max(axis=1) > 1e-4)[0]
        peak = float(np.abs(delta).max()) or 1.0
        put(f't:{name}:i', rows.astype(np.uint16))
        put(f't:{name}:d', np.round(delta[rows] / peak * 127).astype(np.int8), scale=peak / 127)

    avg = macro(sex)
    put('position', (base + avg).astype(np.float32))
    put('index', tris.flatten())
    put_target('heavy', macro(sex, weight='max') - avg)
    put_target('light', macro(sex, weight='min') - avg)
    put_target('muscular', macro(sex, muscle='max') - avg)
    put_target('soft', macro(sex, muscle='min') - avg)
    for site, files in MEASURES.items():
        for way in ('incr', 'decr'):
            put_target(f'{site}-{way}', sum(target(f'{f}-{way}.target.gz') for f in files))
    put('skinIndex', skin_i)
    put('skinWeight', np.round(skin_w * 255).astype(np.uint8))
    (out / f'{sex}.bin.gz').write_bytes(gzip.compress(bytes(blob), 9))
    (out / f'{sex}.json').write_text(json.dumps({'source': 'MakeHuman / MPFB2 assets, CC0, via github.com/naver/anny', 'vertices': N, 'bones': bones, 'layout': layout}, separators=(',', ':')))
    print(sex, 'raw', len(blob), 'gz', (out / f'{sex}.bin.gz').stat().st_size)

MEASURES = {
    'neck': ['neck/measure-neck-circ'], 'chest': ['torso/measure-bust-circ', 'torso/measure-underbust-circ'], 'waist': ['torso/measure-waist-circ'],
    'hips': ['torso/measure-hips-circ'], 'shoulders': ['torso/measure-shoulder-dist'], 'bicep': ['arms/measure-upperarm-circ'],
    'forearm': ['arms/l-lowerarm-scale-horiz', 'arms/r-lowerarm-scale-horiz', 'arms/l-lowerarm-scale-depth', 'arms/r-lowerarm-scale-depth'],
    'thigh': ['legs/measure-thigh-circ'], 'calf': ['legs/measure-calf-circ'], 'belly': ['stomach/stomach-pregnant'],
}

# ---- skeleton and skin weights
names = list(rig)
bones = [{'name': n, 'parent': names.index(rig[n]['parent']) if rig[n]['parent'] else -1,
          'head': [remap[i] for i in joint(rig[n]['head'])], 'tail': [remap[i] for i in joint(rig[n]['tail'])]} for n in names]
per = [[] for _ in range(N)]
for b, name in enumerate(names):
    for v, w in weights.get(name, []):
        if v in remap:
            per[remap[v]].append((w, b))
skin_i = np.zeros((N, 4), dtype=np.uint8)
skin_w = np.zeros((N, 4), dtype=np.float32)
for v, ws in enumerate(per):
    for k, (w, b) in enumerate(sorted(ws, reverse=True)[:4]):
        skin_i[v, k], skin_w[v, k] = b, w
    if skin_w[v].sum() > 0:
        skin_w[v] /= skin_w[v].sum()
drawn = np.unique(tris)
print('unweighted drawn vertices:', int((skin_w[drawn].sum(axis=1) == 0).sum()))
for old in out.glob('body.*'):
    old.unlink()
pack('male')
pack('female')
print('vertices', N, 'triangles', len(tris), 'bones', len(bones))
