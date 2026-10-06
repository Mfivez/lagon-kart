#!/usr/bin/env python3
"""Prepare the vendored Zsky kart using Python's standard library only.

No download, Blender, npm package, or paid service is used. The original GLB is
left intact. --check verifies deterministic output without changing any files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).absolute().parent.parent
SOURCE = ROOT / 'assets/sources/zsky/go-kart-original.glb'
OUTPUT = ROOT / 'client/public/models/kart-zsky-v1.glb'
REPORT = ROOT / 'assets/sources/zsky/inspection.json'
SOURCE_SHA256 = '7b3b06fa1841d1254888ec0443065e3cdbce58ff239bf9cd821b8daef234c0e4'
# Names were identified from actual geometry, not guessed from the source names.
WHEELS = {0: 'Wheel_FL', 2: 'Wheel_RL', 3: 'Wheel_RR', 4: 'Wheel_FR'}


def read_glb(data):
    magic, version, length = struct.unpack_from('<4sII', data)
    assert (magic, version, length) == (b'glTF', 2, len(data))
    json_size, json_type = struct.unpack_from('<II', data, 12)
    assert json_type == 0x4E4F534A
    document = json.loads(data[20:20 + json_size])
    binary_size, binary_type = struct.unpack_from('<II', data, 20 + json_size)
    assert binary_type == 0x004E4942
    return document, data[28 + json_size:28 + json_size + binary_size]


def bounds(points):
    return ([min(p[k] for p in points) for k in range(3)],
            [max(p[k] for p in points) for k in range(3)])


def prepare():
    original = SOURCE.read_bytes()
    assert hashlib.sha256(original).hexdigest() == SOURCE_SHA256, 'Unexpected source; inspect it before adapting the converter.'
    source, binary = read_glb(original)
    assert not any(source.get(key) for key in ('animations', 'skins', 'textures', 'images', 'extensionsRequired'))
    assert all(not any(key in node for key in ('matrix', 'rotation', 'translation', 'scale')) for node in source['nodes'])

    def accessor(index):
        acc = source['accessors'][index]
        view = source['bufferViews'][acc['bufferView']]
        count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[acc['type']]
        format_code = {5123: 'H', 5126: 'f'}[acc['componentType']]
        format_string = '<' + count * format_code
        stride = view.get('byteStride', struct.calcsize(format_string))
        start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        return [struct.unpack_from(format_string, binary, start + i * stride) for i in range(acc['count'])]

    inspected = []
    all_positions = []
    for index, mesh in enumerate(source['meshes']):
        positions = [p for primitive in mesh['primitives'] for p in accessor(primitive['attributes']['POSITION'])]
        lo, hi = bounds(positions)
        all_positions.extend(positions)
        inspected.append({'mesh': index, 'name': mesh['name'], 'boundsMin': lo, 'boundsMax': hi,
                          'triangles': sum(source['accessors'][p['indices']]['count'] // 3 for p in mesh['primitives']),
                          'primitives': len(mesh['primitives']), 'wheel': WHEELS.get(index)})
    minimum, maximum = bounds(all_positions)
    scale = 3.8 / (maximum[2] - minimum[2])
    center_x = (minimum[0] + maximum[0]) / 2
    center_z = (minimum[2] + maximum[2]) / 2

    def transform(p):
        return [(p[0] - center_x) * scale, (p[1] - minimum[1]) * scale, (p[2] - center_z) * scale]

    def material(name, color, roughness, metalness=0, **extra):
        return {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [*color, 1],
                'roughnessFactor': roughness, 'metallicFactor': metalness}, **extra}

    mats = [
        material('KartPaint', [1, 1, 1], 0.29, 0.18),
        material('KartRim', [0.72, 0.48, 0.10], 0.30, 0.68),
        material('KartTire', [0.016, 0.023, 0.029], 0.96),
        material('KartMetal', [0.30, 0.36, 0.38], 0.34, 0.63),
        material('KartIvory', [0.85, 0.83, 0.70], 0.45, 0.04),
        material('KartLamp', [1, 0.78, 0.30], 0.25, 0.04, emissiveFactor=[0.36, 0.19, 0.025]),
        material('KartSeat', [0.022, 0.036, 0.043], 0.82),
    ]
    # Blue_Kart1 and Blue_Hood1 become the single independently tintable paint.
    material_map = {0: 1, 1: 2, 2: 3, 3: 2, 4: 5, 5: 3, 6: 4, 7: 1,
                    8: 3, 9: 6, 10: 0, 11: 0, 12: 3, 13: 1, 14: 6}
    result = {'asset': {'version': '2.0', 'generator': 'Lagon Kart scripts/prepare-kart.py v1',
                        'copyright': 'Go Kart by Zsky, CC BY 3.0; https://www.patreon.com/Zsky',
                        'extras': {'source': 'https://poly.pizza/m/MkByxZCSMA',
                                   'license': 'https://creativecommons.org/licenses/by/3.0/',
                                   'sourceSha256': SOURCE_SHA256,
                                   'changes': 'Uniform scale, ground alignment, wheel pivots, material regrouping and PBR tuning.'}},
              'scene': 0, 'scenes': [{'name': 'ZskyKart', 'nodes': [0]}],
              'nodes': [{'name': 'Kart', 'children': [1]}, {'name': 'Body', 'children': []}],
              'meshes': [], 'materials': mats, 'accessors': [], 'bufferViews': [], 'buffers': []}
    blob = bytearray()

    def write_accessor(name, values, kind, component=5126, target=34962):
        while len(blob) % 4:
            blob.append(0)
        start = len(blob)
        code = {5123: 'H', 5126: 'f'}[component]
        count = {'SCALAR': 1, 'VEC3': 3}[kind]
        for value in values:
            blob.extend(struct.pack('<' + code * count, *value))
        view = len(result['bufferViews'])
        result['bufferViews'].append({'buffer': 0, 'byteOffset': start, 'byteLength': len(blob) - start, 'target': target})
        acc = {'name': name, 'bufferView': view, 'componentType': component, 'count': len(values), 'type': kind}
        if kind == 'VEC3':
            acc['min'], acc['max'] = bounds(values)
        result['accessors'].append(acc)
        return len(result['accessors']) - 1

    def mesh_from(name, mesh_ids, pivot):
        batches = {}
        for mesh_id in mesh_ids:
            for primitive in source['meshes'][mesh_id]['primitives']:
                assert primitive.get('mode', 4) == 4
                mat = material_map[primitive['material']]
                batch = batches.setdefault(mat, {'positions': [], 'normals': [], 'indices': []})
                offset = len(batch['positions'])
                positions = [transform(p) for p in accessor(primitive['attributes']['POSITION'])]
                batch['positions'].extend([[p[k] - pivot[k] for k in range(3)] for p in positions])
                batch['normals'].extend(accessor(primitive['attributes']['NORMAL']))
                batch['indices'].extend([(item[0] + offset,) for item in accessor(primitive['indices'])])
        primitives = []
        for mat, batch in sorted(batches.items()):
            positions = write_accessor(name + '_positions', batch['positions'], 'VEC3')
            normals = write_accessor(name + '_normals', batch['normals'], 'VEC3')
            indices = write_accessor(name + '_indices', batch['indices'], 'SCALAR', 5123, 34963)
            primitives.append({'attributes': {'POSITION': positions, 'NORMAL': normals}, 'indices': indices, 'material': mat})
        result['meshes'].append({'name': name + 'Mesh', 'primitives': primitives})
        return len(result['meshes']) - 1

    # Keep the steering wheel distinct so its inspected location remains explicit.
    for name, mesh_ids in [('Chassis', [1, 6]), ('SteeringWheel', [5])]:
        index = len(result['nodes'])
        result['nodes'].append({'name': name, 'mesh': mesh_from(name, mesh_ids, [0, 0, 0])})
        result['nodes'][1]['children'].append(index)

    wheel_report = []
    for mesh_id, name in WHEELS.items():
        entry = inspected[mesh_id]
        source_center = [(a + b) / 2 for a, b in zip(entry['boundsMin'], entry['boundsMax'])]
        pivot = transform(source_center)
        radius = (entry['boundsMax'][1] - entry['boundsMin'][1]) * scale / 2
        index = len(result['nodes'])
        result['nodes'].append({'name': name, 'translation': pivot,
                                'mesh': mesh_from(name, [mesh_id], pivot),
                                'extras': {'radius': radius, 'spinAxis': 'X', 'front': name in ('Wheel_FL', 'Wheel_FR')}})
        result['nodes'][0]['children'].append(index)
        wheel_report.append({'name': name, 'sourceMesh': mesh_id, 'pivot': pivot, 'radius': radius})

    for name, position in [('SeatMount', transform([0, -0.01059, -1.3])), ('SteeringMount', [0, 1.12, 0.69])]:
        index = len(result['nodes'])
        result['nodes'].append({'name': name, 'translation': position})
        result['nodes'][1]['children'].append(index)

    result['buffers'] = [{'byteLength': len(blob)}]
    document = json.dumps(result, separators=(',', ':'), ensure_ascii=True).encode()
    document += b' ' * (-len(document) % 4)
    blob.extend(b'\0' * (-len(blob) % 4))
    output = (struct.pack('<4sII', b'glTF', 2, 28 + len(document) + len(blob))
              + struct.pack('<II', len(document), 0x4E4F534A) + document
              + struct.pack('<II', len(blob), 0x004E4942) + blob)
    assert all(math.isfinite(v) for node in result['nodes'] for v in node.get('translation', []))
    source_triangles = sum(entry['triangles'] for entry in inspected)
    output_triangles = sum(result['accessors'][p['indices']]['count'] // 3 for m in result['meshes'] for p in m['primitives'])
    assert output_triangles == source_triangles, 'Conversion must preserve every source triangle.'
    report = {'sourceFile': 'go-kart-original.glb', 'sourceSha256': SOURCE_SHA256,
              'sourceBytes': len(original), 'sourceMeshes': inspected,
              'sourceMaterials': [m['name'] for m in source['materials']],
              'sourceTriangleCount': source_triangles, 'sourcePrimitiveCount': sum(m['primitives'] for m in inspected),
              'sourceBounds': {'min': minimum, 'max': maximum},
              'sourcePivots': 'All seven mesh nodes have identity transforms; wheel vertices are in world coordinates.',
              'sourceTextures': 0, 'sourceAnimations': 0, 'sourceSkeletons': 0,
              'orientation': {'forward': '+Z', 'up': '+Y', 'wheelSpin': '+X', 'frontSteer': '+Y'},
              'scale': scale, 'outputFile': 'client/public/models/kart-zsky-v1.glb',
              'outputSha256': hashlib.sha256(output).hexdigest(), 'outputBytes': len(output),
              'outputSize': [(maximum[k] - minimum[k]) * scale for k in range(3)],
              'outputMaterials': [m['name'] for m in mats], 'outputTriangles': output_triangles,
              'outputPrimitives': sum(len(m['primitives']) for m in result['meshes']),
              'wheelPivots': wheel_report,
              'paintSourceMaterials': ['Blue_Kart1', 'Blue_Hood1'],
              'changes': ['Uniform scale to length 3.8; preserve source proportions',
                          'Center X/Z and place lowest tire point at Y=0',
                          'Recenter each real source wheel at its own axle pivot',
                          'Name Body, four wheels, SeatMount and SteeringMount',
                          'Merge body primitives by material; remove unused UVs',
                          'Tune PBR materials and provide one shared paint slot']}
    return output, (json.dumps(report, indent=2) + '\n').encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if committed GLB/report differ from deterministic conversion.')
    args = parser.parse_args()
    output, report = prepare()
    if args.check:
        assert OUTPUT.read_bytes() == output, 'GLB differs; run python3 scripts/prepare-kart.py'
        assert REPORT.read_bytes() == report, 'Inspection report differs; rerun conversion.'
        print('Kart GLB and inspection report are reproducible; source SHA256 verified.')
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(output)
        REPORT.write_bytes(report)
        print(f'Prepared {len(output):,} bytes, source unchanged; report: {REPORT.name}')


if __name__ == '__main__':
    main()
