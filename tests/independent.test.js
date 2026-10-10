const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const collection = (ballots = [], ids = ['a', 'b', 'c', 'd']) => ({
  id: 'set-1',
  name: 'My list',
  items: ids.map((id) => ({ id, name: id.toUpperCase() })),
  ballots,
});
const ballot = (groups, skipped = [], n = 1) => ({
  id: `ballot-${n}`,
  createdAt: '2026-10-09T12:00:00.000Z',
  groups,
  skipped,
});
const backup = (c) => ({ version: 1, collections: [c] });
const listed = (r) => r.tiers.flat();
test('empty comparisons leave every item uncompared', () => {
  const r = E.aggregate(collection());
  assert.equal(r.observedPairs, 0);
  assert.deepEqual(new Set(r.uncompared), new Set(['a', 'b', 'c', 'd']));
});
test('strict ballot ranks best first and skipped never becomes loser', () => {
  const r = E.aggregate(collection([ballot([['b'], ['a']], ['c'])]));
  assert.equal(r.observedPairs, 1);
  assert.ok(r.tiers.findIndex((t) => t.includes('b')) < r.tiers.findIndex((t) => t.includes('a')));
  assert.deepEqual(new Set(r.uncompared), new Set(['c', 'd']));
  assert.ok(!listed(r).includes('c'));
});
test('explicit ties are compared, yet neither direction preferred', () => {
  const r = E.aggregate(collection([ballot([['a', 'b']])]));
  assert.equal(r.observedPairs, 1);
  assert.ok(!r.uncompared.includes('a'));
  assert.ok(!r.uncompared.includes('b'));
  assert.equal(r.pairwise.a.b, r.pairwise.b.a);
  assert.ok(r.tiers.some((t) => t.includes('a') && t.includes('b')));
});
test('incomplete unrelated comparisons do not create cross pair evidence', () => {
  const r = E.aggregate(collection([ballot([['a'], ['b']], [], 1), ballot([['c'], ['d']], [], 2)]));
  assert.equal(r.observedPairs, 2);
  assert.equal(r.possiblePairs, 6);
  assert.equal(r.pairwise.a.c || 0, 0);
  assert.equal(r.pairwise.c.a || 0, 0);
});
test('rock-paper-scissors returns unresolved tier, does not fabricate winner', () => {
  const r = E.aggregate(
    collection(
      [ballot([['a'], ['b']], [], 1), ballot([['b'], ['c']], [], 2), ballot([['c'], ['a']], [], 3)],
      ['a', 'b', 'c'],
    ),
  );
  assert.ok(r.tiers.some((t) => t.length === 3));
  assert.ok(r.cycles);
});
test('aggregate never mutates stored data and is deterministic', () => {
  const c = collection([ballot([['a', 'b'], ['c']])]);
  const original = JSON.stringify(c);
  const first = E.aggregate(c);
  assert.equal(JSON.stringify(c), original);
  assert.deepEqual(E.aggregate(c), first);
});
test('batch unique, constrained to collection and up to five', () => {
  const c = collection(
    [],
    Array.from({ length: 22 }, (_, i) => `item-${i}`),
  );
  for (let i = 0; i < 20; i++) {
    const ids = E.chooseBatch(c, 5);
    assert.ok(ids.length <= 5);
    assert.equal(ids.length, new Set(ids).size);
    assert.ok(ids.every((id) => c.items.some((x) => x.id === id)));
  }
});
test('valid backup round trips', () => {
  const b = backup(collection([ballot([['a', 'b'], ['c']], ['d'])]));
  assert.deepEqual(E.validateBackup(JSON.parse(JSON.stringify(b))), b);
});
test('reject invalid or cross collection ballot references', () => {
  assert.throws(() => E.validateBackup(backup(collection([ballot([['a'], ['unknown']])]))));
});
test('reject item repeated in groups or group and skips', () => {
  assert.throws(() => E.validateBackup(backup(collection([ballot([['a'], ['a']])]))));
  assert.throws(() => E.validateBackup(backup(collection([ballot([['a'], ['b']], ['a'])]))));
});
test('reject duplicate collection ids, item ids, and ballot ids', () => {
  const c = collection();
  assert.throws(() => E.validateBackup({ version: 1, collections: [c, c] }));
  assert.throws(() => E.validateBackup(backup(collection([], ['a', 'a']))));
  assert.throws(() =>
    E.validateBackup(backup(collection([ballot([['a'], ['b']]), ballot([['b'], ['c']])]))),
  );
});
test('reject null malformed roots and unsupported versions', () => {
  for (const b of [
    null,
    [],
    {},
    { version: 2, collections: [] },
    { version: 1, collections: {} },
    { version: 1, collections: [null] },
  ])
    assert.throws(() => E.validateBackup(b));
});
test('prototype-shaped item ids rejected or safely handled', () => {
  for (const id of ['__proto__', 'constructor', 'prototype', 'toString']) {
    const b = backup(collection([ballot([[id], ['a']])], [id, 'a']));
    let validated;
    try {
      validated = E.validateBackup(b);
    } catch {
      continue;
    }
    const r = E.aggregate(validated.collections[0]);
    assert.equal(r.observedPairs, 1);
    assert.ok(listed(r).includes(id));
    assert.equal({}.polluted, undefined);
  }
});
