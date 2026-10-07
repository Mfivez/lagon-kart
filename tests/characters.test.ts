import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, DEFAULT_CHARACTER, isCharacterId, normalizeCharacterId } from '../shared/characters';

test('character selection admits fourteen distinct local cartoon identities and safely defaults invalid inputs', () => {
  assert.equal(DEFAULT_CHARACTER, 'racer');
  assert.deepEqual(CHARACTERS.map(character => character.id), ['racer', 'queen', 'obama', 'trump', 'kim',
    'macron', 'merkel', 'napoleon', 'plumber', 'elf', 'hedgehog', 'block', 'chemist', 'space']);
  assert.equal(new Set(CHARACTERS.map(character => character.id)).size, CHARACTERS.length);
  assert.equal(new Set(CHARACTERS.map(character => character.name)).size, CHARACTERS.length);
  for (const character of CHARACTERS) {
    assert.equal(isCharacterId(character.id), true);
    assert.equal(normalizeCharacterId(character.id), character.id);
    assert.ok(character.name && character.description);
  }
  for (const value of [null, undefined, {}, ['queen'], '', 'constructor', '__proto__', '<script>', 'Macron',
    'bean', 'plumber ', 'toString', 'https://example.com/character']) {
    assert.equal(isCharacterId(value), false); assert.equal(normalizeCharacterId(value), DEFAULT_CHARACTER);
  }
});
