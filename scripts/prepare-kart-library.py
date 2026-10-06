#!/usr/bin/env python3
"""Prepare two inspected Poly Pizza karts using only Python's standard library.

The sources are single meshes without wheel pivots. Connected tyre components
identify each axle, then complete tyre/rim components are separated spatially.
Nothing is downloaded, dropped or generated; every source triangle is retained.
"""
from __future__ import annotations
import argparse
import collections
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).absolute().parent.parent
spec = importlib.util.spec_from_file_location('existing_kart', ROOT / 'scripts/prepare-kart.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
CONFIGS = [
    dict(id='sprint', directory='poly-google', author='Poly by Google', public_id='3hkutVs0AAV',
         sha='3e84c5499309d8582c5fe4d75c4c9f6f897ea59e91d0a82adf4dff016f9d8cad',
         turn=1, tire_material=3, tire_min_triangles=300, tire_max_y=16, axle_margin=1.1,
         seat=[2.5, 8.0, 0], steering=[-13, 21.5, 0.5],
         names=['KartPaint', 'KartSteel', 'KartIvory', 'KartTire']),
    dict(id='retro', directory='ben-harrison', author='Ben Harrison', public_id='bKDlM4mH7rg',
         sha='8e64e0d111a331bfe41002c1fad2bab3e8cf81145224828bd4bf36f5f6058949',
         turn=-1, tire_material=1, tire_min_triangles=70, tire_max_y=1, axle_margin=0.01,
         seat=[-0.6, 0.56, -2.92], steering=[0.16, 1.0, -2.92],
         names=['KartPaint', 'KartTire', 'KartSteel', 'KartRim', 'KartSeat', 'KartEngine', 'KartChrome', 'KartTrim']),
]


def prepare(config):
    directory = ROOT / 'assets/sources' / config['directory']
    original = (directory / 'kart-original.glb').read_bytes()
    assert hashlib.sha256(original).hexdigest() == config['sha'], 'Source changed; inspect before converting.'
    source, binary = base.read_glb(original)
    assert len(source['nodes']) == len(source['meshes']) == 1
    assert not any(k in source['nodes'][0] for k in ['matrix', 'rotation', 'translation', 'scale'])
    assert not any(source.get(k) for k in ['images', 'textures', 'animations', 'skins', 'extensionsRequired'])

    def accessor(index):
        acc = source['accessors'][index]
        view = source['bufferViews'][acc['bufferView']]
        code = {5123: 'H', 5125: 'I', 5126: 'f'}[acc['componentType']]
        fmt = '<' + code * {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[acc['type']]
        stride = view.get('byteStride', struct.calcsize(fmt))
        start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        return [struct.unpack_from(fmt, binary, start + i * stride) for i in range(acc['count'])]

    primitives = []
    for primitive in source['meshes'][0]['primitives']:
        assert primitive.get('mode', 4) == 4
        primitives.append(dict(material=primitive['material'],
                               positions=accessor(primitive['attributes']['POSITION']),
                               normals=accessor(primitive['attributes']['NORMAL']),
                               indices=[v[0] for v in accessor(primitive['indices'])]))

    # Weld positions only for the inspection graph. Flat normals and vertices
    # remain unchanged in exported meshes, preserving the artist's facets.
    def connected_components(primitive):
        keys = [tuple(round(v, 4) for v in p) for p in primitive['positions']]
        parents = {}

        def find(key):
            parents.setdefault(key, key)
            if parents[key] != key:
                parents[key] = find(parents[key])
            return parents[key]

        for i in range(0, len(primitive['indices']), 3):
            a, b, c = [keys[k] for k in primitive['indices'][i:i + 3]]
            parents[find(b)] = find(a)
            parents[find(c)] = find(a)
        components = collections.defaultdict(list)
        for i in range(0, len(primitive['indices']), 3):
            indices = primitive['indices'][i:i + 3]
            components[find(keys[indices[0]])].extend(indices)
        return list(components.values())

    tire = next(p for p in primitives if p['material'] == config['tire_material'])
    tires = []
    inspected_components = []
    for indices in connected_components(tire):
        lo, hi = base.bounds([tire['positions'][i] for i in indices])
        triangles = len(indices) // 3
        selected = triangles >= config['tire_min_triangles'] and hi[1] < config['tire_max_y']
        inspected_components.append(dict(min=lo, max=hi, triangles=triangles, selectedAsTire=selected))
        if selected:
            tires.append(dict(min=lo, max=hi, center=[(a + b) / 2 for a, b in zip(lo, hi)], triangles=triangles))
    assert len(tires) == 4, 'Four unambiguous disconnected tyre components are required.'
    source_points = [p for primitive in primitives for p in primitive['positions']]
    minimum, maximum = base.bounds(source_points)
    scale = 3.8 / (maximum[0] - minimum[0])
    center_x, center_z = [(minimum[k] + maximum[k]) / 2 for k in [0, 2]]
    turn = config['turn']

    def rotate(p):
        return [p[2] * turn, p[1], -p[0] * turn]

    def transform(p):
        return rotate([(p[0] - center_x) * scale, (p[1] - minimum[1]) * scale, (p[2] - center_z) * scale])

    for tire in tires:
        tire['pivot'] = transform(tire['center'])
        tire['radius'] = (tire['max'][1] - tire['min'][1]) * scale / 2
        tire['name'] = 'Wheel_' + ('F' if tire['pivot'][2] > 0 else 'R') + ('L' if tire['pivot'][0] > 0 else 'R')
    assert len({t['name'] for t in tires}) == 4
    tires.sort(key=lambda tire: tire['name'])
    batches = collections.defaultdict(lambda: collections.defaultdict(list))
    for primitive in primitives:
        # A triangle-only bounding-box cut would accidentally capture nearby
        # body trim. Keep each welded component whole: panels and cross-axles
        # remain in Body while complete tyres, rim discs and hub caps rotate.
        for vertices in connected_components(primitive):
            points = [primitive['positions'][j] for j in vertices]
            matches = []
            for tire in tires:
                margins = [0.0002, 0.0002, config['axle_margin']]
                if all(tire['min'][k] - margins[k] <= p[k] <= tire['max'][k] + margins[k]
                       for p in points for k in range(3)):
                    matches.append(tire['name'])
            assert len(matches) <= 1
            role = matches[0] if matches else 'Chassis'
            batches[role][primitive['material']].extend((primitive['positions'][j], primitive['normals'][j]) for j in vertices)

    materials = []
    for name, material in zip(config['names'], source['materials']):
        pbr = dict(material['pbrMetallicRoughness'])
        if name == 'KartPaint':
            pbr.update(baseColorFactor=[1, 1, 1, 1], roughnessFactor=0.38, metallicFactor=0.18)
        elif name == 'KartTire':
            pbr.update(roughnessFactor=0.94, metallicFactor=0)
        elif name in ['KartSteel', 'KartRim', 'KartChrome', 'KartEngine']:
            pbr.update(roughnessFactor=0.4, metallicFactor=0.55)
        materials.append(dict(name=name, pbrMetallicRoughness=pbr))
    doc = dict(asset={'version': '2.0', 'generator': 'Lagon Kart scripts/prepare-kart-library.py v1',
                      'copyright': f"{source['meshes'][0]['name']} by {config['author']}, CC BY 3.0",
                      'extras': {'source': 'https://poly.pizza/m/' + config['public_id'],
                                 'license': 'https://creativecommons.org/licenses/by/3.0/',
                                 'sourceSha256': config['sha'],
                                 'changes': 'Uniform scale and rotation, separated original wheels, axle pivots, driver markers, PBR and paint.'}},
               scene=0, scenes=[dict(name=config['id'], nodes=[0])],
               nodes=[dict(name='Kart', children=[1]), dict(name='Body', children=[])],
               meshes=[], materials=materials, accessors=[], bufferViews=[], buffers=[])
    blob = bytearray()

    def write(values, kind, component=5126):
        blob.extend(b'\0' * (-len(blob) % 4))
        start = len(blob)
        fmt = '<' + {5126: 'f', 5123: 'H'}[component] * {'VEC3': 3, 'SCALAR': 1}[kind]
        for value in values:
            assert all(math.isfinite(v) for v in value)
            blob.extend(struct.pack(fmt, *value))
        doc['bufferViews'].append(dict(buffer=0, byteOffset=start, byteLength=len(blob) - start,
                                       target=34962 if kind == 'VEC3' else 34963))
        acc = dict(bufferView=len(doc['bufferViews']) - 1, componentType=component, count=len(values), type=kind)
        if kind == 'VEC3':
            acc['min'], acc['max'] = base.bounds(values)
        doc['accessors'].append(acc)
        return len(doc['accessors']) - 1

    for role in ['Chassis', *[t['name'] for t in tires]]:
        wheel = next((t for t in tires if t['name'] == role), None)
        pivot = wheel['pivot'] if wheel else [0, 0, 0]
        outputs = []
        for material, pairs in sorted(batches[role].items()):
            unique, positions, normals, indices = {}, [], [], []
            for point, normal in pairs:
                key = (*point, *normal)
                if key not in unique:
                    unique[key] = len(positions)
                    positions.append([v - pivot[k] for k, v in enumerate(transform(point))])
                    normals.append(rotate(normal))
                indices.append((unique[key],))
            outputs.append(dict(attributes={'POSITION': write(positions, 'VEC3'), 'NORMAL': write(normals, 'VEC3')},
                                indices=write(indices, 'SCALAR', 5123), material=material))
        doc['meshes'].append(dict(name=role + 'Mesh', primitives=outputs))
        node = dict(name=role, mesh=len(doc['meshes']) - 1)
        if wheel:
            node.update(translation=pivot, extras=dict(radius=wheel['radius'], spinAxis='X', front='_F' in role))
        doc['nodes'][0 if wheel else 1]['children'].append(len(doc['nodes']))
        doc['nodes'].append(node)
    for name, marker in [('SeatMount', config['seat']), ('SteeringMount', config['steering'])]:
        doc['nodes'][1]['children'].append(len(doc['nodes']))
        doc['nodes'].append(dict(name=name, translation=transform(marker)))
    doc['buffers'] = [dict(byteLength=len(blob))]
    document = json.dumps(doc, separators=(',', ':'), ensure_ascii=True).encode()
    document += b' ' * (-len(document) % 4)
    blob.extend(b'\0' * (-len(blob) % 4))
    output = (struct.pack('<4sII', b'glTF', 2, 28 + len(document) + len(blob))
              + struct.pack('<II', len(document), 0x4e4f534a) + document
              + struct.pack('<II', len(blob), 0x004e4942) + blob)
    triangles = sum(len(p['indices']) // 3 for p in primitives)
    assert sum(len(pairs) // 3 for groups in batches.values() for pairs in groups.values()) == triangles
    report = dict(modelId=config['id'], sourceFile='kart-original.glb', sourceSha256=config['sha'], sourceBytes=len(original),
                  sourceMeshes=1, sourcePrimitiveCount=len(primitives), sourceTriangleCount=triangles,
                  sourceMaterials=[m['name'] for m in source['materials']], sourceBounds=dict(min=minimum, max=maximum),
                  sourceTextures=0, sourceAnimations=0, sourceSkeletons=0,
                  sourcePivots='One mesh at identity; wheel triangles merged into its material primitives. No wheel nodes.',
                  inspectedTireComponents=inspected_components, scale=scale, rotationYDegrees=90 * turn,
                  wheelPivots=[dict(name=t['name'], sourceBounds=dict(min=t['min'], max=t['max']),
                                    pivot=t['pivot'], radius=t['radius'], triangles=sum(len(p)//3 for p in batches[t['name']].values())) for t in tires],
                  outputFile=f"client/public/models/kart-{config['id']}-v1.glb",
                  outputBytes=len(output), outputSha256=hashlib.sha256(output).hexdigest(), outputTriangles=triangles,
                  outputPrimitives=sum(len(m['primitives']) for m in doc['meshes']),
                  orientation=dict(forward='+Z', up='+Y', wheelSpin='+X', frontSteer='+Y'),
                  changes=['Preserve every source triangle and faceted normal', 'Rotate uniformly and scale length to 3.8 m',
                           'Separate whole connected tyre/rim components; recenter wheels on their own axles',
                           'Keep chassis independent from wheels; add driver mount markers',
                           'Name tintable paint and tune existing untextured PBR materials'])
    return output, (json.dumps(report, indent=2) + '\n').encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for config in CONFIGS:
        output, report = prepare(config)
        destination = ROOT / f"client/public/models/kart-{config['id']}-v1.glb"
        inspection = ROOT / 'assets/sources' / config['directory'] / 'inspection.json'
        if args.check:
            assert destination.read_bytes() == output, 'GLB changed; rerun prepare-kart-library.py'
            assert inspection.read_bytes() == report, 'Inspection changed; rerun prepare-kart-library.py'
        else:
            destination.write_bytes(output)
            inspection.write_bytes(report)
        print(f"{config['id']}: {len(output):,} bytes, source verified, four axle pivots, {'reproducible' if args.check else 'prepared'}")


if __name__ == '__main__':
    main()
