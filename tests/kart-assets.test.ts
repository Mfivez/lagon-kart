import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { KART_MODELS, getKartModel, isKartModelId, normalizeKartModelId } from '../shared/kart-catalog';

type Accessor = { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string };
type Gltf = {
  asset: { version: string }; buffers: Array<{ byteLength: number; uri?: string }>;
  bufferViews: Array<{ byteOffset?: number; byteLength: number; byteStride?: number }>;
  accessors: Accessor[];
  nodes: Array<{ name: string; mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[];
    matrix?: number[]; children?: number[]; extras?: { radius?: number; spinAxis?: string; front?: boolean } }>;
  meshes: Array<{ primitives: Array<{ attributes: Record<string, number>; indices: number; material: number; mode?: number }> }>;
  materials: Array<{ name: string }>;
  images?: unknown[]; textures?: unknown[]; extensionsRequired?: string[]; skins?: unknown[];
};
const data = await readFile(new URL('../client/public/models/kart-zsky-v1.glb', import.meta.url));
const jsonLength = data.readUInt32LE(12);
const gltf = JSON.parse(data.toString('utf8', 20, 20 + jsonLength)) as Gltf;
const binaryStart = 20 + jsonLength + 8;
function vertices(index: number): number[][] {
  const accessor = gltf.accessors[index]!;
  assert.equal(accessor.componentType, 5126); assert.equal(accessor.type, 'VEC3');
  const view = gltf.bufferViews[accessor.bufferView]!;
  const start = binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? 12;
  assert.ok(start + (accessor.count - 1) * stride + 12 <= data.length);
  return Array.from({ length: accessor.count }, (_, i) =>
    [0, 1, 2].map(axis => data.readFloatLE(start + i * stride + axis * 4)));
}

test('vendored kart is a bounded self-contained GLB with valid positions, normals and triangle indices', () => {
  assert.equal(data.readUInt32LE(0), 0x46546c67); assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length); assert.ok(data.length < 128 * 1024);
  assert.equal(data.readUInt32LE(16), 0x4e4f534a); assert.equal(gltf.asset.version, '2.0');
  assert.equal(gltf.buffers.length, 1); assert.equal(gltf.buffers[0]!.uri, undefined);
  assert.equal(gltf.images?.length ?? 0, 0); assert.equal(gltf.textures?.length ?? 0, 0);
  assert.equal(gltf.extensionsRequired?.length ?? 0, 0); assert.equal(gltf.skins?.length ?? 0, 0);
  let triangles = 0; let primitives = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    primitives++;
    assert.equal(primitive.mode ?? 4, 4);
    const position = gltf.accessors[primitive.attributes.POSITION!]!;
    const indices = gltf.accessors[primitive.indices]!;
    assert.equal(indices.count % 3, 0); triangles += indices.count / 3;
    const size = indices.componentType === 5123 ? 2 : indices.componentType === 5125 ? 4 : 0;
    assert.ok(size > 0);
    const indexView = gltf.bufferViews[indices.bufferView]!;
    const offset = binaryStart + (indexView.byteOffset ?? 0) + (indices.byteOffset ?? 0);
    for (let i = 0; i < indices.count; i++) {
      const index = size === 2 ? data.readUInt16LE(offset + i * size) : data.readUInt32LE(offset + i * size);
      assert.ok(index < position.count);
    }
    assert.ok(vertices(primitive.attributes.POSITION!).flat().every(Number.isFinite));
    for (const normal of vertices(primitive.attributes.NORMAL!)) assert.ok(Math.abs(Math.hypot(...normal) - 1) < .01);
  }
  assert.equal(triangles, 1680); assert.equal(primitives, 15);
  assert.equal(gltf.materials.filter(material => material.name === 'KartPaint').length, 1);
});

test('four real wheels have centered local axle geometry and independent steering pivots', () => {
  assert.ok(gltf.nodes.some(node => node.name === 'Body'));
  assert.ok(gltf.nodes.some(node => node.name === 'SeatMount'));
  assert.ok(gltf.nodes.some(node => node.name === 'SteeringMount'));
  const wheels = gltf.nodes.filter(node => /^Wheel_[FR][LR]$/.test(node.name));
  assert.equal(wheels.length, 4);
  assert.equal(wheels.filter(node => node.extras?.front).length, 2);
  assert.equal(new Set(wheels.map(node => node.mesh)).size, 4);
  for (const wheel of wheels) {
    assert.equal(wheel.matrix, undefined);
    assert.deepEqual(wheel.rotation ?? [0, 0, 0, 1], [0, 0, 0, 1]);
    assert.deepEqual(wheel.scale ?? [1, 1, 1], [1, 1, 1]);
    assert.equal(wheel.extras?.spinAxis, 'X');
    assert.ok(wheel.extras!.radius! > .2 && wheel.extras!.radius! < .4);
    assert.equal(wheel.translation!.length, 3);
    const points = gltf.meshes[wheel.mesh!]!.primitives.flatMap(primitive => vertices(primitive.attributes.POSITION!));
    const minimum = [0, 1, 2].map(axis => Math.min(...points.map(point => point[axis]!)));
    const maximum = [0, 1, 2].map(axis => Math.max(...points.map(point => point[axis]!)));
    for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(minimum[axis]! + maximum[axis]!) < 1e-5);
    const groundClearance = wheel.translation![1]! + minimum[1]!;
    assert.ok(groundClearance > -1e-5 && groundClearance < .01);
    assert.ok(wheel.extras?.front ? wheel.translation![2]! > .8 : wheel.translation![2]! < -.7);
  }
});

test('source, processed asset and preserved attribution evidence match their recorded fingerprints', async () => {
  const directory = new URL('../assets/sources/zsky/', import.meta.url);
  const inspection = JSON.parse(await readFile(new URL('inspection.json', directory), 'utf8')) as Record<string, unknown>;
  const source = await readFile(new URL('go-kart-original.glb', directory));
  assert.equal(createHash('sha256').update(source).digest('hex'), inspection.sourceSha256);
  assert.equal(createHash('sha256').update(data).digest('hex'), inspection.outputSha256);
  assert.equal(inspection.outputBytes, data.length);
  const evidence = JSON.parse(await readFile(new URL('source-page-evidence.json', directory), 'utf8')) as
    { page: string; sourceSha256: string; modelMetadata: { Creator: { Username: string }; Licence: string } };
  assert.equal(evidence.sourceSha256, inspection.sourceSha256);
  assert.equal(evidence.modelMetadata.Creator.Username, 'Zsky');
  assert.equal(evidence.modelMetadata.Licence, 'CC-BY 3.0');
  assert.equal(evidence.page, 'https://poly.pizza/m/MkByxZCSMA');
  assert.match(await readFile(new URL('LICENSE-CC-BY-3.0.txt', directory), 'utf8'), /Attribution 3\.0 Unported/);
});

test('cosmetic catalogue accepts only bundled model IDs and never an arbitrary URL', () => {
  assert.deepEqual(KART_MODELS.map(model => model.id), ['zsky', 'sprint', 'retro']);
  for (const model of KART_MODELS) {
    assert.equal(isKartModelId(model.id), true);
    assert.equal(getKartModel(model.id).url, model.url);
    assert.match(model.url, /^\/models\/kart-[a-z]+-v\d+\.glb$/);
  }
  for (const invalid of ['', null, undefined, {}, 'constructor', 'https://other.example/model.glb']) {
    assert.equal(isKartModelId(invalid), false);
    assert.equal(normalizeKartModelId(invalid), 'zsky');
  }
});

for (const [id, directory, triangleCount, author] of [
  ['sprint', 'poly-google', 3828, 'Poly by Google'],
  ['retro', 'ben-harrison', 1916, 'Ben Harrison'],
] as const) test(`${id}: original triangles, four isolated axle pivots and preserved CC BY evidence`, async () => {
  const buffer = await readFile(new URL(`../client/public${getKartModel(id).url}`, import.meta.url));
  const length = buffer.readUInt32LE(12);
  const doc = JSON.parse(buffer.toString('utf8', 20, 20 + length)) as Gltf;
  const start = 28 + length;
  assert.equal(buffer.readUInt32LE(0), 0x46546c67);
  assert.equal(buffer.readUInt32LE(8), buffer.length);
  assert.ok(buffer.length < 150_000);
  assert.equal(doc.buffers[0]!.uri, undefined);
  assert.equal(doc.images?.length ?? 0, 0);
  assert.equal(doc.extensionsRequired?.length ?? 0, 0);
  const getVectors = (index: number) => {
    const accessor = doc.accessors[index]!;
    const view = doc.bufferViews[accessor.bufferView]!;
    assert.equal(accessor.componentType, 5126); assert.equal(accessor.type, 'VEC3');
    const offset = start + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count }, (_, row) => [0, 1, 2].map(axis =>
      buffer.readFloatLE(offset + row * (view.byteStride ?? 12) + axis * 4)));
  };
  let actualTriangles = 0;
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
    const points = getVectors(primitive.attributes.POSITION!);
    assert.ok(points.flat().every(Number.isFinite));
    for (const normal of getVectors(primitive.attributes.NORMAL!)) assert.ok(Math.abs(Math.hypot(...normal) - 1) < .01);
    const accessor = doc.accessors[primitive.indices]!;
    const view = doc.bufferViews[accessor.bufferView]!;
    assert.equal(accessor.componentType, 5123); assert.equal(accessor.count % 3, 0);
    actualTriangles += accessor.count / 3;
    for (let i = 0; i < accessor.count; i++) {
      assert.ok(buffer.readUInt16LE(start + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * 2) < points.length);
    }
  }
  assert.equal(actualTriangles, triangleCount);
  const wheels = doc.nodes.filter(node => /^Wheel_[FR][LR]$/.test(node.name));
  assert.equal(wheels.length, 4);
  const body = doc.nodes.find(node => node.name === 'Body')!;
  for (const wheel of wheels) {
    assert.ok(!body.children!.includes(doc.nodes.indexOf(wheel)), 'body lean must not move the wheel pivots');
    assert.equal(wheel.rotation, undefined); assert.equal(wheel.scale, undefined);
    assert.equal(wheel.extras?.spinAxis, 'X');
    assert.ok(wheel.extras!.radius! > .2 && wheel.extras!.radius! < .5);
    assert.ok(doc.meshes[wheel.mesh!]!.primitives.every(p => doc.materials[p.material]!.name !== 'KartPaint'),
      'a wheel extraction must not capture nearby painted body panels');
    const points = doc.meshes[wheel.mesh!]!.primitives.flatMap(p => getVectors(p.attributes.POSITION!));
    const lo = [0, 1, 2].map(axis => Math.min(...points.map(p => p[axis]!)));
    const hi = [0, 1, 2].map(axis => Math.max(...points.map(p => p[axis]!)));
    for (const radialAxis of [1, 2]) assert.ok(Math.abs(lo[radialAxis]! + hi[radialAxis]!) < 1e-4,
      'wheel vertices must revolve around the real axle');
    assert.ok(Math.abs(wheel.translation![1]! + lo[1]!) < .002, 'all original tyres touch the ground');
    assert.ok(wheel.extras!.front ? wheel.translation![2]! > .5 : wheel.translation![2]! < -.5);
  }
  assert.ok(doc.nodes.some(node => node.name === 'SeatMount'));
  assert.ok(doc.nodes.some(node => node.name === 'SteeringMount'));
  const base = new URL(`../assets/sources/${directory}/`, import.meta.url);
  const source = await readFile(new URL('kart-original.glb', base));
  const report = JSON.parse(await readFile(new URL('inspection.json', base), 'utf8'));
  const evidence = JSON.parse(await readFile(new URL('source-page-evidence.json', base), 'utf8'));
  assert.equal(createHash('sha256').update(source).digest('hex'), report.sourceSha256);
  assert.equal(createHash('sha256').update(buffer).digest('hex'), report.outputSha256);
  assert.equal(report.outputTriangles, report.sourceTriangleCount);
  assert.equal(evidence.modelMetadata.Creator.Username, author);
  assert.equal(evidence.modelMetadata.Licence, 'CC-BY 3.0');
  assert.match(await readFile(new URL('LICENSE-CC-BY-3.0.txt', base), 'utf8'), /Attribution 3\.0 Unported/);
});
