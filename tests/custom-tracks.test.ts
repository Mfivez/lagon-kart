import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_TRACK_TEMPLATES, compileCustomTrack, customTrackRuntimeId, isCustomTrackRuntimeId,
  registerCustomTrack, sampleCustomTrackAnchors, validateCustomTrackDraft, type StoredCustomTrack } from '../shared/custom-tracks.js';
import { TRACKS, getAvailableTracks, getTrack, isTrackId, nearestTrack, spawnPoint, trackPoint, trackSurface } from '../shared/track.js';
import { COLORS, TOTAL_LAPS, createKart, createWorld, startRace, stepWorld } from '../shared/game.js';
import { getTrackEvent } from '../shared/track-events.js';
import { applyConfiguration, createTournament } from '../shared/tournament.js';
import { autopilot } from '../shared/autopilot.js';

function record(id: string, template = 0, revision = 1): StoredCustomTrack {
  return { id: `custom-${id}`, revision, draft: structuredClone(CUSTOM_TRACK_TEMPLATES[template]!.draft),
    createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z' };
}
test('templates compile deterministically into smooth complete routes with a safe eight-player grid', () => {
  for (let index = 0; index < CUSTOM_TRACK_TEMPLATES.length; index++) {
    const source = record(`geometry-${index}`, index), input = structuredClone(source);
    const validation = validateCustomTrackDraft(source.draft);
    assert.deepEqual(validation.errors, []); assert.equal(validation.ok, true);
    assert.deepEqual(compileCustomTrack(source), compileCustomTrack(source));
    assert.deepEqual(source, input, 'validation and compilation do not mutate editor state');
    const track = registerCustomTrack(source);
    assert.equal(track.checkpoints.length, 12); assert.deepEqual(track.elevations, []); assert.deepEqual(track.loops, []);
    assert.deepEqual(track.points, sampleCustomTrackAnchors(source.draft.anchors));
    for (let grid = 0; grid < 8; grid++) {
      const start = spawnPoint(grid, track.id), near = nearestTrack(start.x, start.z, track.id);
      assert.ok(near.distance + 1 < track.width / 2); assert.ok(near.progress > track.length - 25);
    }
    for (const checkpoint of track.checkpoints) {
      const near = nearestTrack(checkpoint.x, checkpoint.z, track.id);
      assert.ok(near.distance < 1e-6); assert.ok(Math.abs(near.progress - checkpoint.progress) < 1e-6);
    }
    assert.equal(trackSurface(spawnPoint(0,track.id).x,spawnPoint(0,track.id).z,track.id).surface, 'road');
    for (const zone of track.zones) {
      const point = trackPoint((zone.start+zone.end)/2,track.id);
      assert.equal(trackSurface(point.x + Math.cos(point.angle)*zone.offset,point.z-Math.sin(point.angle)*zone.offset,track.id).surface, zone.kind);
    }
  }
});

test('untrusted drafts reject malformed points, names, zones and shapes with helpful errors', () => {
  for (const input of [null, [], {}, { ...record('bad').draft, name: '' }, { ...record('bad').draft, width: 2 },
    { ...record('bad').draft, theme: '__proto__' }, { ...record('bad').draft, anchors: [{x:NaN,z:Infinity}] },
    { ...record('bad').draft, anchors: Array.from({length:33},()=>({x:0,z:0})) },
    { ...record('bad').draft, zones: [{kind:'boost',start:0,end:.1,offset:0,width:8}] },
    { ...record('bad').draft, zones: [{kind:'boost',start:.1,end:.9,offset:0,width:8}] },
    { ...record('bad').draft, zones: [{kind:'boost',start:.1,end:.12,offset:20,width:8}] },
    { ...record('bad').draft, zones: [{kind:'boost',start:.1,end:.12,offset:0,width:8},{kind:'ice',start:.11,end:.13,offset:0,width:8}] },
  ]) {
    const result = validateCustomTrackDraft(input);
    assert.equal(result.ok, false); assert.ok(result.errors.length > 0);
  }
  const cross = record('cross').draft;
  [cross.anchors[2], cross.anchors[6]] = [cross.anchors[6]!, cross.anchors[2]!];
  assert.match(validateCustomTrackDraft(cross).errors.join(' '), /croisent/);
  const narrow = record('narrow').draft; narrow.anchors.forEach(point => { point.z *= .08; });
  assert.match(validateCustomTrackDraft(narrow).errors.join(' '), /proches/);
  const hairpin = record('hairpin').draft; hairpin.anchors[1] = {x:-15,z:-180};
  assert.match(validateCustomTrackDraft(hairpin).errors.join(' '), /virage/);
  const duplicate = record('duplicate').draft; duplicate.anchors[1] = {...duplicate.anchors[0]!};
  assert.match(validateCustomTrackDraft(duplicate).errors.join(' '), /18 m/);
  assert.deepEqual(sampleCustomTrackAnchors([]), []);
});

test('editing previews cannot overwrite an existing race or immutable published revision', () => {
  const first = record('versions'), track = registerCustomTrack(first), start = trackPoint(120, track.id);
  const newer = record('versions', 1, 2); newer.draft.name = 'Nouvelle version';
  const next = registerCustomTrack(newer);
  const newestOnly = getAvailableTracks().filter(candidate => candidate.id.startsWith('custom-versions-'));
  assert.deepEqual(newestOnly, [next]); assert.equal(getTrack(track.id), track); assert.equal(getTrack(next.id), next);
  assert.equal(isTrackId(track.id), true); assert.equal(isTrackId(next.id), true);
  assert.equal(TRACKS.length, 12, 'the builtin catalogue and career stay fixed');
  for (const template of CUSTOM_TRACK_TEMPLATES) validateCustomTrackDraft(template.draft);
  assert.deepEqual(trackPoint(120, track.id), start, 'a preview never modifies a cached arc table');
  assert.equal(registerCustomTrack(first), track, 'receiving the same immutable snapshot is idempotent');
  const collision = {...first,draft:{...first.draft,name:'Changed without increment'}};
  assert.throws(()=>registerCustomTrack(collision),/déjà publiée/);
  assert.equal(registerCustomTrack(first), track); assert.deepEqual(getAvailableTracks().filter(t=>t.id.startsWith('custom-versions-')), [next]);
  assert.equal(isTrackId('custom-not-saved-v1'), false);
  assert.equal(isCustomTrackRuntimeId('custom-not-saved-v1'), true);
  for (const invalid of ['lagon','../custom-test-v1','custom-x-v0','custom-x-v10001','custom-x-v1-suffix','custom-x-vNaN']) assert.equal(isCustomTrackRuntimeId(invalid),false);
  assert.throws(()=>customTrackRuntimeId({...first,id:'../escape'}));
});

test('published custom routes can join mixed tournaments and never receive unsafe generated closures', () => {
  const saved = record('tournament'), track = registerCustomTrack(saved);
  const result = applyConfiguration(createTournament(), {mode:'tournament',selection:'manual',raceCount:2,schedule:['lagon',track.id]}, 'lagon');
  assert.deepEqual(result.tournament.schedule, ['lagon',track.id]);
  const random = applyConfiguration(createTournament(), {mode:'tournament',selection:'random',raceCount:2,trackPool:['lagon',track.id]}, 'lagon', ()=>.1);
  assert.deepEqual(new Set(random.tournament.schedule), new Set(['lagon',track.id]));
  for (const level of [0,1,2,3]) for (const stage of [0,1,2]) {
    const event = getTrackEvent(track.id,stage,level); assert.deepEqual(event.branches,[]); assert.deepEqual(event.blockers,[]);
    assert.equal(event.level,0); assert.equal(event.weather,'clear');
  }
});

for (const [label, template] of [['oval',0],['kidney',1],['ice',0],['reverse',1]] as const) test(`custom ${label}: eight CPU drivers finish three laps with normal items, collisions and checkpoints`, t => {
  const source = record(`cpu-${label}`,template);
  if (label === 'ice') {
    source.draft.theme = 'ice'; source.draft.width = 24;
    source.draft.zones.push({ kind:'ice',start:.3,end:.4,width:24,offset:0 },{ kind:'mud',start:.65,end:.7,width:8,offset:7 });
  }
  if (label === 'reverse') source.draft.anchors = [source.draft.anchors[0]!, ...source.draft.anchors.slice(1).reverse()];
  const track = registerCustomTrack(source);
  const world = createWorld(false, track.id);
  world.eventLevel = 3;
  world.players = Array.from({length:8},(_,index)=>createKart(String(index),`CPU ${index}`,COLORS[index]!,index,track.id));
  startRace(world);
  for(let tick=0;tick<30*200 && world.phase !== 'finished';tick++) {
    stepWorld(world,new Map(world.players.map(kart=>[kart.id,autopilot(kart,tick,true)])),1/30);
  }
  assert.equal(world.phase,'finished');
  assert.equal(world.players.filter(kart=>kart.finished && kart.lap===TOTAL_LAPS).length,8);
  assert.equal(new Set(world.players.map(kart=>kart.rank)).size,8);
  t.diagnostic(`${track.name}: 8/8 finish in ${world.raceTime.toFixed(2)} simulated seconds`);
});
