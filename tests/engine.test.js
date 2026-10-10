'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Engine = require('../engine.js');

function collection(ids = ['a', 'b', 'c'], ballots = []) {
  return { id: 'collection', name: 'Test collection', items: ids.map(id => ({ id, name: 'Item ' + id })), ballots };
}
function ballot(groups, id = 'ballot', skipped = []) {
  return { id, createdAt: '2026-10-09T10:00:00.000Z', groups, skipped };
}
function backup(c = collection()) {
  return { version: 1, collections: [c] };
}
function deepFreeze(value) {
  Object.freeze(value);
  Object.values(value).forEach(child => {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  });
  return value;
}

test('UMD supports both CommonJS and an offline browser global', () => {
  assert.equal(typeof Engine.aggregate, 'function');
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../engine.js'), 'utf8'), context);
  assert.equal(vm.runInContext('typeof RankingEngine.validateBackup', context), 'function');
  assert.equal(vm.runInContext('RankingEngine.aggregate({id:"c", name:"C", items:[], ballots:[]}).possiblePairs', context), 0);
});

test('no evidence leaves every item uncompared and no ranking tiers', () => {
  const result = Engine.aggregate(collection());
  assert.deepEqual(result.tiers, []);
  assert.deepEqual(result.uncompared, ['a', 'b', 'c']);
  assert.equal(result.comparisons, 0);
  assert.equal(result.observedPairs, 0);
  assert.equal(result.possiblePairs, 3);
  assert.equal(result.cycles, false);
  assert.equal(result.pairwise.a.b, 0);
});

test('one ordered ballot supplies all pair comparisons', () => {
  const result = Engine.aggregate(collection(['a', 'b', 'c'], [ballot([['a'], ['b'], ['c']])]));
  assert.deepEqual(result.tiers, [['a'], ['b'], ['c']]);
  assert.deepEqual(result.uncompared, []);
  assert.equal(result.comparisons, 3);
  assert.equal(result.observedPairs, 3);
  assert.equal(result.pairwise.a.c, 1);
  assert.equal(result.pairwise.c.a, 0);
});

test('explicit ties are observed without fractional or strict-preference votes', () => {
  const result = Engine.aggregate(collection(['a', 'b', 'c'], [ballot([['a', 'b'], ['c']])]));
  assert.deepEqual(result.tiers, [['a', 'b'], ['c']]);
  assert.equal(result.observedPairs, 3);
  assert.equal(result.comparisons, 3);
  assert.equal(result.pairwise.a.b, 0);
  assert.equal(result.pairwise.b.a, 0);
  assert.equal(result.pairwise.a.c, 1);
  assert.equal(result.pairwise.b.c, 1);
  for (const row of Object.values(result.pairwise)) for (const count of Object.values(row)) assert.equal(Number.isInteger(count), true);
});

test('an all-tied ballot still establishes observed items and pair coverage', () => {
  const result = Engine.aggregate(collection(['a', 'b', 'c'], [ballot([['a', 'b', 'c']])]));
  assert.deepEqual(result.tiers, [['a', 'b', 'c']]);
  assert.deepEqual(result.uncompared, []);
  assert.equal(result.observedPairs, 3);
  assert.equal(result.cycles, false);
});

test('shared tiers display names in alphabetical natural order', () => {
  const c = collection(['z', 'a', 'b10', 'b2'], [ballot([['z', 'b10', 'a', 'b2']])]);
  c.items[0].name = 'Zebra';
  c.items[1].name = 'apple';
  c.items[2].name = 'Banana 10';
  c.items[3].name = 'Banana 2';
  assert.deepEqual(Engine.aggregate(c).tiers, [['a', 'b2', 'b10', 'z']]);
});

test('skipped and unmentioned items receive neither wins nor losses', () => {
  const result = Engine.aggregate(collection(['a', 'b', 'c', 'd'], [ballot([['b'], ['a']], 'ballot', ['c'])]));
  assert.deepEqual(result.tiers, [['b'], ['a']]);
  assert.deepEqual(result.uncompared, ['c', 'd']);
  assert.equal(result.observedPairs, 1);
  assert.equal(result.possiblePairs, 6);
  assert.equal(result.comparisons, 1);
  assert.equal(result.pairwise.a.c, 0);
});

test('equally strong Condorcet cycle resolves to one tier and flags cycle', () => {
  const c = collection(['a', 'b', 'c'], [
    ballot([['a'], ['b']], 'ab'),
    ballot([['b'], ['c']], 'bc'),
    ballot([['c'], ['a']], 'ca')
  ]);
  const result = Engine.aggregate(c);
  assert.deepEqual(result.tiers, [['a', 'b', 'c']]);
  assert.equal(result.cycles, true);
});

test('strongest paths resolve an unequal majority cycle', () => {
  const ballots = [];
  for (let i = 0; i < 4; i++) ballots.push(ballot([['a'], ['b']], 'ab' + i));
  for (let i = 0; i < 3; i++) ballots.push(ballot([['b'], ['c']], 'bc' + i));
  for (let i = 0; i < 2; i++) ballots.push(ballot([['c'], ['a']], 'ca' + i));
  const result = Engine.aggregate(collection(['a', 'b', 'c'], ballots));
  assert.deepEqual(result.tiers, [['a'], ['b'], ['c']]);
  assert.equal(result.cycles, true);
  assert.equal(result.comparisons, 9);
  assert.equal(result.observedPairs, 3);
});

test('opposed votes can tie without creating a directed majority cycle', () => {
  const result = Engine.aggregate(collection(['a', 'b'], [
    ballot([['a'], ['b']], 'ab'), ballot([['b'], ['a']], 'ba')
  ]));
  assert.deepEqual(result.tiers, [['a', 'b']]);
  assert.equal(result.pairwise.a.b, 1);
  assert.equal(result.pairwise.b.a, 1);
  assert.equal(result.comparisons, 2);
  assert.equal(result.observedPairs, 1);
  assert.equal(result.cycles, false);
});

test('sparse connected evidence permits transitive paths without inventing observed pairs', () => {
  const result = Engine.aggregate(collection(['a', 'b', 'c', 'd'], [
    ballot([['a'], ['b']], 'ab'), ballot([['b'], ['c']], 'bc')
  ]));
  assert.deepEqual(result.tiers, [['a'], ['b'], ['c']]);
  assert.deepEqual(result.uncompared, ['d']);
  assert.equal(result.pairwise.a.c, 0);
  assert.equal(result.observedPairs, 2);
});

test('disconnected components share provisional maximal tiers', () => {
  const result = Engine.aggregate(collection(['a', 'b', 'c', 'd'], [
    ballot([['a'], ['b']], 'ab'), ballot([['c'], ['d']], 'cd')
  ]));
  assert.deepEqual(result.tiers, [['a', 'c'], ['b', 'd']]);
  assert.equal(result.cycles, false);
  assert.equal(result.observedPairs, 2);
});

test('collection results stay isolated even when other collections reuse IDs', () => {
  const first = collection(['a', 'b'], [ballot([['a'], ['b']])]);
  const second = collection(['a', 'b'], [ballot([['b'], ['a']])]);
  second.id = 'second';
  const saved = Engine.validateBackup({ version: 1, collections: [first, second] });
  assert.deepEqual(Engine.aggregate(saved.collections[0]).tiers, [['a'], ['b']]);
  assert.deepEqual(Engine.aggregate(saved.collections[1]).tiers, [['b'], ['a']]);
});

test('inputs are never mutated and validation returns independent schema-only copies', () => {
  const input = backup(collection(['a', 'b'], [ballot([['a'], ['b']])]));
  input.metadata = { ignore: true };
  input.collections[0].items[0].name = '  Item a  ';
  input.collections[0].items[0].extra = 'removed';
  deepFreeze(input);
  const clean = Engine.validateBackup(input);
  assert.equal(clean.collections[0].items[0].name, 'Item a');
  assert.equal(own(clean, 'metadata'), false);
  assert.equal(own(clean.collections[0].items[0], 'extra'), false);
  assert.notEqual(clean.collections[0].ballots[0].groups[0], input.collections[0].ballots[0].groups[0]);
  Engine.aggregate(input.collections[0]);
  Engine.chooseBatch(input.collections[0]);
  assert.equal(input.collections[0].items[0].name, '  Item a  ');
  clean.collections[0].ballots[0].groups[0][0] = 'changed';
  assert.equal(input.collections[0].ballots[0].groups[0][0], 'a');
});
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }

test('prototype-shaped IDs are safe in pairwise dictionaries', () => {
  const c = collection(['__proto__', 'constructor', 'toString'], [ballot([['__proto__'], ['constructor'], ['toString']])]);
  const result = Engine.aggregate(c);
  assert.equal(Object.getPrototypeOf(result.pairwise), null);
  assert.equal(result.pairwise.__proto__.constructor, 1);
  assert.deepEqual(result.tiers, [['__proto__'], ['constructor'], ['toString']]);
  assert.equal({}.polluted, undefined);
});

test('validation rejects wrong shapes, missing fields, coercions and unsupported versions', () => {
  for (const input of [null, [], 'text', new Date()]) assert.throws(() => Engine.validateBackup(input), /object/);
  assert.throws(() => Engine.validateBackup({ collections: [] }), /version.*required/);
  assert.throws(() => Engine.validateBackup({ version: '1', collections: [] }), /version/);
  assert.throws(() => Engine.validateBackup({ version: 2, collections: [] }), /version/);
  assert.throws(() => Engine.validateBackup({ version: 1, collections: {} }), /array/);
  const bad = backup();
  bad.collections[0].items[0].id = 42;
  assert.throws(() => Engine.validateBackup(bad), /id.*string/);
  Object.defineProperty(bad, 'version', { get() { throw new Error('Do not execute'); } });
  assert.throws(() => Engine.validateBackup(bad), /accessor/);
});

test('validation rejects duplicate collection, item and ballot IDs', () => {
  assert.throws(() => Engine.validateBackup({ version: 1, collections: [collection(), collection()] }), /collection ID/);
  const duplicateItems = backup(collection(['a', 'a']));
  assert.throws(() => Engine.validateBackup(duplicateItems), /item ID/);
  const duplicateBallots = backup(collection(['a', 'b'], [ballot([['a'], ['b']]), ballot([['b'], ['a']])]));
  assert.throws(() => Engine.validateBackup(duplicateBallots), /ballot ID/);
});

test('validation rejects duplicate normalized item names and blank names', () => {
  const input = backup(collection(['a', 'b']));
  input.collections[0].items[0].name = 'Café';
  input.collections[0].items[1].name = '  CAFE\u0301  ';
  assert.throws(() => Engine.validateBackup(input), /duplicates another item name/);
  input.collections[0].items[1].name = '   ';
  assert.throws(() => Engine.validateBackup(input), /nonempty/);
});

test('validation enforces length and collection-size limits', () => {
  const input = backup();
  input.collections[0].name = 'x'.repeat(Engine.LIMITS.nameLength + 1);
  assert.throws(() => Engine.validateBackup(input), /characters/);
  input.collections[0].name = 'Valid';
  input.collections[0].id = 'x'.repeat(Engine.LIMITS.idLength + 1);
  assert.throws(() => Engine.validateBackup(input), /characters/);
  assert.throws(() => Engine.validateBackup({ version: 1, collections: Array(Engine.LIMITS.collections + 1).fill({}) }), /more than 100/);
  const tooMany = collection(Array.from({ length: Engine.LIMITS.itemsPerCollection + 1 }, (_, i) => 'item' + i));
  assert.throws(() => Engine.validateBackup(backup(tooMany)), /more than 300/);
});

test('validation rejects malformed and non-calendar timestamps, accepts timezone offsets', () => {
  const input = backup(collection(['a', 'b'], [ballot([['a'], ['b']])]));
  for (const date of ['yesterday', '2026-10-09', '2026-02-30T10:00:00Z', '2026-02-29T00:00:00Z', '2026-10-09T24:00:00Z', '2026-10-09T10:00:00+99:00', 123]) {
    input.collections[0].ballots[0].createdAt = date;
    assert.throws(() => Engine.validateBackup(input), /createdAt/);
  }
  input.collections[0].ballots[0].createdAt = '2024-02-29T12:00:00+02:00';
  assert.equal(Engine.validateBackup(input).collections[0].ballots[0].createdAt, '2024-02-29T10:00:00.000Z');
  input.collections[0].ballots[0].createdAt = '0000-01-01T00:00:00+01:00';
  assert.throws(() => Engine.validateBackup(input), /years 0000 through 9999/);
});

test('validation rejects unknown, duplicate or overlapping ballot references and empty groups', () => {
  const cases = [
    [ballot([['a'], ['missing']]), /unknown item/],
    [ballot([['a'], ['a']]), /more than once/],
    [ballot([['a', 'b']], 'b', ['b']), /ranked or skipped/],
    [ballot([['a', 'b']], 'b', ['c', 'c']), /ranked or skipped/],
    [ballot([['a', 'b']], 'b', ['missing']), /unknown item/],
    [ballot([['a'], []]), /empty/],
    [ballot([]), /at least one/],
    [ballot([['a']], 'b', ['b', 'c']), /at least 2/]
  ];
  for (const [entry, message] of cases) assert.throws(() => Engine.validateBackup(backup(collection(['a', 'b', 'c'], [entry]))), message);
});

test('validation enforces ten ranked plus skipped items combined', () => {
  const ids = Array.from({ length: 11 }, (_, i) => 'i' + i);
  const c = collection(ids, [ballot([ids.slice(0, 10)], 'b', [ids[10]])]);
  assert.throws(() => Engine.validateBackup(backup(c)), /ranked and skipped items combined/);
  c.ballots[0].skipped = [];
  assert.equal(Engine.validateBackup(backup(c)).collections[0].ballots[0].groups[0].length, 10);
});

test('chooseBatch is deterministic, bounded, unique, and works with tiny collections', () => {
  const c = collection(Array.from({ length: 15 }, (_, i) => 'i' + i));
  const first = Engine.chooseBatch(c);
  assert.equal(first.length, 5);
  assert.equal(new Set(first).size, 5);
  assert.deepEqual(Engine.chooseBatch(c), first);
  assert.equal(Engine.chooseBatch(c, 4).length, 4);
  assert.deepEqual(Engine.chooseBatch(collection([])), []);
  assert.deepEqual(Engine.chooseBatch(collection(['a'])), ['a']);
  for (const limit of [0, -1, 6, 1.5, '10', null, NaN]) assert.throws(() => Engine.chooseBatch(c, limit), /integer/);
});

test('chooseBatch prioritizes unseen items and bridges unobserved pairs', () => {
  const c = collection(['a', 'b', 'c', 'd'], [ballot([['a'], ['b']], 'ab')]);
  assert.deepEqual(Engine.chooseBatch(c, 2), ['a', 'c']);
  c.ballots.push(ballot([['c'], ['d']], 'cd'));
  assert.deepEqual(Engine.chooseBatch(c, 2), ['c', 'a']);
  c.ballots.push(ballot([['a', 'c']], 'ac'));
  assert.deepEqual(Engine.chooseBatch(c, 2), ['a', 'd']);
});

test('chooseBatch counts ties as evidence and rests recently skipped items', () => {
  const c = collection(['a', 'b', 'c', 'd'], [ballot([['a', 'b']], 'tie', ['c'])]);
  assert.deepEqual(Engine.chooseBatch(c, 2), ['a', 'd']);
});

test('randomized rankings match exhaustive strongest simple paths', () => {
  let seed = 719231;
  function random(max) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed % max;
  }
  for (let trial = 0; trial < 80; trial++) {
    const n = 2 + random(5);
    const ids = Array.from({ length: n }, (_, i) => 'i' + i);
    const ballots = [];
    for (let k = 0; k < 18; k++) {
      const order = ids.slice();
      for (let i = order.length - 1; i > 0; i--) {
        const j = random(i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
      const rankedCount = 2 + random(n - 1);
      const groups = [[order[0]]];
      for (let i = 1; i < rankedCount; i++) {
        if (random(3) === 0) groups[groups.length - 1].push(order[i]);
        else groups.push([order[i]]);
      }
      ballots.push(ballot(groups, 'b' + k, order.slice(rankedCount)));
    }
    const result = Engine.aggregate(collection(ids, ballots));
    const strengths = Array.from({ length: n }, () => Array(n).fill(0));
    for (let start = 0; start < n; start++) {
      function visit(current, visited, strength) {
        for (let next = 0; next < n; next++) {
          if (visited.has(next)) continue;
          const edge = result.pairwise[ids[current]][ids[next]];
          if (edge <= result.pairwise[ids[next]][ids[current]]) continue;
          const through = Math.min(strength, edge);
          strengths[start][next] = Math.max(strengths[start][next], through);
          visit(next, new Set([...visited, next]), through);
        }
      }
      visit(start, new Set([start]), Infinity);
    }
    let remaining = ids.map((_, i) => i).filter(i => !result.uncompared.includes(ids[i]));
    const expected = [];
    while (remaining.length) {
      const maxima = remaining.filter(i => remaining.every(j => strengths[j][i] <= strengths[i][j]));
      assert.ok(maxima.length > 0);
      expected.push(maxima.map(i => ids[i]));
      remaining = remaining.filter(i => !maxima.includes(i));
    }
    assert.deepEqual(result.tiers, expected, 'Trial ' + trial);
    const flattened = result.tiers.flat().concat(result.uncompared);
    assert.equal(new Set(flattened).size, n);
    assert.equal(flattened.length, n);
  }
});

test('five-item collections have no duplicate items, even over repeated rounds', () => {
  const c = collection(['a','b','c','d','e']);
  for (let i=0;i<8;i++) {
    const ids=Engine.chooseBatch(c);
    assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);
    c.ballots.push(ballot(ids.map(id=>[id]),'round'+i));
  }
});
test('six or more items produce changed rounds with evidence-connecting overlap', () => {
  for (const size of [6,7,10,24,80]) {
    const c=collection(Array.from({length:size},(_,i)=>'i'+i));let prev=[];
    for(let round=0;round<15;round++) {
      const ids=Engine.chooseBatch(c);
      assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);
      if(prev.length){assert.ok(ids.some(id=>!prev.includes(id)));assert.ok(ids.some(id=>prev.includes(id)));}
      c.ballots.push(ballot(ids.map(id=>[id]),'round'+round));prev=ids;
    }
    // All observed items form one evidence component through round overlap.
    const observed=new Set(c.ballots[0].groups.flat());
    for(const b of c.ballots.slice(1)){assert.ok(b.groups.flat().some(id=>observed.has(id)));b.groups.flat().forEach(id=>observed.add(id));}
  }
});
test('skip cooldown lasts two saved rounds without loss evidence or permanent exclusion', () => {
  const c=collection(['a','b','c','d','e','f','g','h'],[ballot([['a'],['b'],['c'],['d']],'first',['e'])]);
  for(let i=0;i<2;i++){
    const ids=Engine.chooseBatch(c);assert.ok(!ids.includes('e'));
    c.ballots.push(ballot(ids.map(id=>[id]),'rest'+i));
  }
  const r=Engine.aggregate(c);assert.ok(r.uncompared.includes('e'));
  assert.ok(Object.values(r.pairwise.e).every(v=>v===0));
  assert.ok(Engine.chooseBatch(c).includes('e'));
});
test('small collections remain usable when skips leave few alternatives', () => {
  const c=collection(['a','b','c'],[ballot([['a'],['b']],'first',['c'])]);
  assert.deepEqual(new Set(Engine.chooseBatch(c)),new Set(['a','b']));
});
test('legacy ten-item ballots still validate and contribute fully after five-item update', () => {
  const ids=Array.from({length:10},(_,i)=>'i'+i);
  const c=collection(ids,[ballot(ids.map(id=>[id]),'legacy')]);
  assert.equal(Engine.validateBackup(backup(c)).collections[0].ballots[0].groups.length,10);
  assert.equal(Engine.aggregate(c).observedPairs,45);
  assert.equal(Engine.chooseBatch(c).length,5);
  assert.throws(()=>Engine.chooseBatch(c,6),/integer/);
});
