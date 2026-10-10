/*
 * RankingEngine: local-only, dependency-free ranking and backup validation.
 *
 * Ballot groups are ordered best to worst; members of one group are tied.
 * Skipped and unmentioned items contribute no evidence. Explicit ties count
 * as observed comparisons but add no strict-preference votes in either direction.
 *
 * Aggregation uses Schulze strongest paths with winning-vote strengths.
 * Tiers repeatedly remove the maximal elements of the resulting strict relation.
 * A shared tier is NOT necessarily evidence of equal quality: with sparse data,
 * equally strong paths and disconnected/incomparable items also share a tier.
 * Items never compared to any other item are returned separately as uncompared.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RankingEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LIMITS = Object.freeze({
    collections: 100,
    itemsPerCollection: 300,
    totalItems: 10000,
    ballotsPerCollection: 20000,
    totalBallots: 50000,
    batchSize: 5,
    historicalBatchSize: 10,
    nameLength: 200,
    idLength: 100
  });
  var own = Object.prototype.hasOwnProperty;
  // eslint-disable-next-line no-control-regex -- Reject control characters in imported names and IDs.
  var controls = /[\u0000-\u001f\u007f]/;

  function fail(path, message) {
    throw new Error(path + ': ' + message);
  }

  function record(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail(path, 'must be an object.');
    }
    var proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      fail(path, 'must be a plain data object.');
    }
  }

  function field(value, key, path) {
    if (!own.call(value, key)) fail(path + '.' + key, 'is required.');
    var descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!own.call(descriptor, 'value')) {
      fail(path + '.' + key, 'must be a data value, not an accessor.');
    }
    return descriptor.value;
  }

  function array(value, path, maximum) {
    if (!Array.isArray(value)) fail(path, 'must be an array.');
    if (value.length > maximum) fail(path, 'cannot contain more than ' + maximum + ' entries.');
    return value;
  }

  function identifier(value, path) {
    if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a nonempty string.');
    if (value.length > LIMITS.idLength) fail(path, 'cannot exceed ' + LIMITS.idLength + ' characters.');
    if (value !== value.trim() || controls.test(value)) fail(path, 'cannot contain surrounding whitespace or control characters.');
    return value;
  }

  function name(value, path) {
    if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a nonempty string.');
    if (value.length > LIMITS.nameLength) fail(path, 'cannot exceed ' + LIMITS.nameLength + ' characters.');
    if (controls.test(value)) fail(path, 'cannot contain control characters.');
    var clean = value.trim().normalize('NFC');
    if (clean.length > LIMITS.nameLength) fail(path, 'cannot exceed ' + LIMITS.nameLength + ' normalized characters.');
    return clean;
  }

  function nameKey(value) {
    // Stable Unicode normalization plus case folding for common duplicate names.
    return value.normalize('NFKC').toLowerCase().replace(/\u00df/g, 'ss').replace(/\u03c2/g, '\u03c3');
  }

  function timestamp(value, path) {
    if (typeof value !== 'string') fail(path, 'must be an ISO 8601 date-time string.');
    var parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!parts) fail(path, 'must be an ISO 8601 date-time with a timezone.');
    var year = Number(parts[1]);
    var month = Number(parts[2]);
    var day = Number(parts[3]);
    var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] ||
        Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59) {
      fail(path, 'contains an invalid calendar date or time.');
    }
    if (parts[8] !== 'Z' && (Number(parts[8].slice(1, 3)) > 23 || Number(parts[8].slice(4, 6)) > 59)) {
      fail(path, 'contains an invalid timezone offset.');
    }
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) fail(path, 'must be a valid ISO 8601 date-time.');
    if (date.getUTCFullYear() < 0 || date.getUTCFullYear() > 9999) fail(path, 'must fall within years 0000 through 9999 in UTC.');
    return date.toISOString();
  }

  function validateCollection(input, path) {
    record(input, path);
    var output = {
      id: identifier(field(input, 'id', path), path + '.id'),
      name: name(field(input, 'name', path), path + '.name'),
      items: [],
      ballots: []
    };
    var items = array(field(input, 'items', path), path + '.items', LIMITS.itemsPerCollection);
    var ids = new Set();
    var names = new Set();
    for (var i = 0; i < items.length; i++) {
      var itemPath = path + '.items[' + i + ']';
      record(items[i], itemPath);
      var itemId = identifier(field(items[i], 'id', itemPath), itemPath + '.id');
      var itemName = name(field(items[i], 'name', itemPath), itemPath + '.name');
      if (ids.has(itemId)) fail(itemPath + '.id', 'duplicates another item ID in this collection.');
      if (names.has(nameKey(itemName))) fail(itemPath + '.name', 'duplicates another item name in this collection (ignoring case).');
      ids.add(itemId);
      names.add(nameKey(itemName));
      output.items.push({ id: itemId, name: itemName });
    }
    var ballots = array(field(input, 'ballots', path), path + '.ballots', LIMITS.ballotsPerCollection);
    var ballotIds = new Set();
    for (var b = 0; b < ballots.length; b++) {
      var ballotPath = path + '.ballots[' + b + ']';
      var ballot = ballots[b];
      record(ballot, ballotPath);
      var ballotId = identifier(field(ballot, 'id', ballotPath), ballotPath + '.id');
      if (ballotIds.has(ballotId)) fail(ballotPath + '.id', 'duplicates another ballot ID in this collection.');
      ballotIds.add(ballotId);
      var createdAt = timestamp(field(ballot, 'createdAt', ballotPath), ballotPath + '.createdAt');
      var groups = array(field(ballot, 'groups', ballotPath), ballotPath + '.groups', LIMITS.historicalBatchSize);
      if (!groups.length) fail(ballotPath + '.groups', 'must contain at least one ranked group.');
      var seen = new Set();
      var cleanGroups = [];
      var rankedCount = 0;
      for (var g = 0; g < groups.length; g++) {
        var groupPath = ballotPath + '.groups[' + g + ']';
        var group = array(groups[g], groupPath, LIMITS.historicalBatchSize);
        if (!group.length) fail(groupPath, 'cannot be empty.');
        var cleanGroup = [];
        for (var r = 0; r < group.length; r++) {
          var ref = identifier(group[r], groupPath + '[' + r + ']');
          if (!ids.has(ref)) fail(groupPath, 'refers to an unknown item ID: ' + ref + '.');
          if (seen.has(ref)) fail(groupPath, 'ranks the same item more than once: ' + ref + '.');
          seen.add(ref);
          cleanGroup.push(ref);
          rankedCount++;
        }
        cleanGroups.push(cleanGroup);
      }
      if (rankedCount < 2) fail(ballotPath + '.groups', 'must rank at least 2 items; skipped items do not count.');
      var skipped = array(field(ballot, 'skipped', ballotPath), ballotPath + '.skipped', LIMITS.historicalBatchSize);
      if (rankedCount + skipped.length > LIMITS.historicalBatchSize) fail(ballotPath, 'cannot include more than ' + LIMITS.historicalBatchSize + ' ranked and skipped items combined.');
      var cleanSkipped = [];
      for (var s = 0; s < skipped.length; s++) {
        var skippedRef = identifier(skipped[s], ballotPath + '.skipped[' + s + ']');
        if (!ids.has(skippedRef)) fail(ballotPath + '.skipped', 'refers to an unknown item ID: ' + skippedRef + '.');
        if (seen.has(skippedRef)) fail(ballotPath + '.skipped', 'duplicates a ranked or skipped item: ' + skippedRef + '.');
        seen.add(skippedRef);
        cleanSkipped.push(skippedRef);
      }
      output.ballots.push({ id: ballotId, createdAt: createdAt, groups: cleanGroups, skipped: cleanSkipped });
    }
    return output;
  }

  function validateBackup(input) {
    record(input, 'Backup');
    if (field(input, 'version', 'Backup') !== 1) fail('Backup.version', 'must be 1; this backup version is not supported.');
    var collections = array(field(input, 'collections', 'Backup'), 'Backup.collections', LIMITS.collections);
    var result = { version: 1, collections: [] };
    var ids = new Set();
    var totalItems = 0;
    var totalBallots = 0;
    for (var i = 0; i < collections.length; i++) {
      var path = 'Backup.collections[' + i + ']';
      var collection = validateCollection(collections[i], path);
      if (ids.has(collection.id)) fail(path + '.id', 'duplicates another collection ID.');
      ids.add(collection.id);
      totalItems += collection.items.length;
      totalBallots += collection.ballots.length;
      if (totalItems > LIMITS.totalItems) fail('Backup.collections', 'cannot contain more than ' + LIMITS.totalItems + ' items in total.');
      if (totalBallots > LIMITS.totalBallots) fail('Backup.collections', 'cannot contain more than ' + LIMITS.totalBallots + ' ballots in total.');
      result.collections.push(collection);
    }
    // Copy only the schema's own data fields, dropping unknown imported metadata.
    return result;
  }

  function evidence(collection) {
    var size = collection.items.length;
    var indices = new Map();
    collection.items.forEach(function (item, index) { indices.set(item.id, index); });
    var wins = new Float64Array(size * size);
    var observations = new Float64Array(size * size);
    var itemObservations = new Float64Array(size);
    var comparisons = 0;
    collection.ballots.forEach(function (ballot) {
      var ranked = [];
      ballot.groups.forEach(function (group, tier) {
        group.forEach(function (id) { ranked.push({ index: indices.get(id), tier: tier }); });
      });
      for (var a = 0; a < ranked.length; a++) {
        for (var b = a + 1; b < ranked.length; b++) {
          var first = ranked[a];
          var second = ranked[b];
          observations[first.index * size + second.index]++;
          observations[second.index * size + first.index]++;
          itemObservations[first.index]++;
          itemObservations[second.index]++;
          comparisons++;
          if (first.tier < second.tier) wins[first.index * size + second.index]++;
          else if (second.tier < first.tier) wins[second.index * size + first.index]++;
        }
      }
    });
    return { size: size, wins: wins, observations: observations, itemObservations: itemObservations, comparisons: comparisons };
  }

  function majorityHasCycle(wins, size) {
    var incoming = new Uint32Array(size);
    for (var i = 0; i < size; i++) {
      for (var j = 0; j < size; j++) if (wins[i * size + j] > wins[j * size + i]) incoming[j]++;
    }
    var ready = [];
    for (var n = 0; n < size; n++) if (incoming[n] === 0) ready.push(n);
    var processed = 0;
    while (processed < ready.length) {
      var node = ready[processed++];
      for (var next = 0; next < size; next++) {
        if (wins[node * size + next] > wins[next * size + node] && --incoming[next] === 0) ready.push(next);
      }
    }
    return processed !== size;
  }

  function aggregate(input) {
    var collection = validateCollection(input, 'Collection');
    var data = evidence(collection);
    var size = data.size;
    var paths = new Float64Array(size * size);
    var pairwise = Object.create(null);
    var uncompared = [];
    var remaining = [];
    var observedPairs = 0;
    for (var i = 0; i < size; i++) {
      var row = Object.create(null);
      pairwise[collection.items[i].id] = row;
      for (var j = 0; j < size; j++) {
        row[collection.items[j].id] = data.wins[i * size + j];
        if (data.wins[i * size + j] > data.wins[j * size + i]) paths[i * size + j] = data.wins[i * size + j];
        if (j > i && data.observations[i * size + j] > 0) observedPairs++;
      }
      if (data.itemObservations[i] === 0) uncompared.push(collection.items[i].id);
      else remaining.push(i);
    }
    // Floyd–Warshall over the max/min semiring: the strongest path's weakest edge.
    for (var pivot = 0; pivot < size; pivot++) {
      for (var from = 0; from < size; from++) {
        if (from === pivot || paths[from * size + pivot] === 0) continue;
        for (var to = 0; to < size; to++) {
          if (to === pivot || to === from) continue;
          var through = Math.min(paths[from * size + pivot], paths[pivot * size + to]);
          if (through > paths[from * size + to]) paths[from * size + to] = through;
        }
      }
    }
    var tiers = [];
    while (remaining.length) {
      var maximal = remaining.filter(function (candidate) {
        return !remaining.some(function (other) {
          return paths[other * size + candidate] > paths[candidate * size + other];
        });
      });
      // Schulze's strict strongest-path relation is acyclic, so this is nonempty.
      if (!maximal.length) throw new Error('Could not resolve the strongest-path ordering.');
      maximal.sort(function (a, b) {
        return collection.items[a].name.localeCompare(collection.items[b].name, 'en', { sensitivity: 'base', numeric: true }) || a - b;
      });
      tiers.push(maximal.map(function (index) { return collection.items[index].id; }));
      var removed = new Set(maximal);
      remaining = remaining.filter(function (index) { return !removed.has(index); });
    }
    return {
      tiers: tiers,
      uncompared: uncompared,
      pairwise: pairwise,
      comparisons: data.comparisons, // Repeated pair observations, including ties.
      possiblePairs: size < 2 ? 0 : size * (size - 1) / 2,
      observedPairs: observedPairs,
      cycles: majorityHasCycle(data.wins, size) // Direct strict-majority graph.
    };
  }

  function chooseBatch(input, limit) {
    if (limit === undefined) limit = LIMITS.batchSize;
    if (!Number.isInteger(limit) || limit < 1 || limit > LIMITS.batchSize) {
      throw new Error('Batch limit must be an integer from 1 to ' + LIMITS.batchSize + '.');
    }
    var collection = validateCollection(input, 'Collection');
    var data = evidence(collection);
    var selected = [];
    var indices = new Map(collection.items.map(function (item, index) { return [item.id, index]; }));
    var shown = new Uint32Array(data.size);
    var lastShown = new Int32Array(data.size).fill(-1);
    var lastSkipped = new Int32Array(data.size).fill(-100);
    var lastRanked = new Int32Array(data.size).fill(-100);
    collection.ballots.forEach(function (ballot, round) {
      ballot.groups.flat().forEach(function (id) { var i = indices.get(id); shown[i]++; lastShown[i] = round; lastRanked[i] = round; });
      ballot.skipped.forEach(function (id) { var i = indices.get(id); shown[i]++; lastShown[i] = round; lastSkipped[i] = round; });
    });
    var previous = collection.ballots[collection.ballots.length - 1];
    var previousRanked = new Set(previous ? previous.groups.flat().map(function (id) { return indices.get(id); }) : []);
    var previousAll = new Set(previous ? previous.groups.flat().concat(previous.skipped).map(function (id) { return indices.get(id); }) : []);
    // A skip affects scheduling only: rest it for the next two saved rounds,
    // when at least two alternatives exist. It never enters ranking evidence.
    var cooling = function (i) { return lastSkipped[i] > lastRanked[i] && collection.ballots.length - lastSkipped[i] <= 2; };
    var available = collection.items.map(function (_, index) { return index; });
    var rested = available.filter(function (i) { return !cooling(i); });
    if (rested.length >= 2) available = rested;
    var target = Math.min(limit, available.length);
    // If all alternatives are resting, vary a full repeated round with a smaller
    // subset rather than immediately reintroducing unfamiliar items.
    if (target > 2 && collection.items.length > target && previousAll.size === target &&
        available.length === target && available.every(function (i) { return previousAll.has(i); })) target--;
    function take(index) { selected.push(index); available.splice(available.indexOf(index), 1); }
    // One familiar anchor joins rounds into a connected body of evidence.
    // Tiny collections simply use the available items; there is no forced anchor.
    if (collection.items.length > limit && target >= 2) {
      var anchors = available.filter(function (i) { return previousRanked.has(i); });
      anchors.sort(function (a, b) { return data.itemObservations[a] - data.itemObservations[b] || shown[a] - shown[b] || a - b; });
      if (anchors.length) take(anchors[0]);
    }
    while (selected.length < target && available.length) {
      var bestPosition = 0;
      var bestScore = null;
      // Guarantee a changed set whenever a non-resting alternative exists.
      var requireFresh = previousAll.size && !selected.some(function (i) { return !previousAll.has(i); }) &&
        available.some(function (i) { return !previousAll.has(i); });
      available.forEach(function (candidate, position) {
        var newPairs = 0;
        var pairCount = 0;
        selected.forEach(function (other) {
          var count = data.observations[candidate * data.size + other];
          if (count === 0) newPairs++;
          pairCount += count;
        });
        var score = [cooling(candidate) ? 1 : 0, requireFresh && previousAll.has(candidate) ? 1 : 0,
          -newPairs, pairCount, data.itemObservations[candidate], shown[candidate], lastShown[candidate], candidate];
        for (var k = 0; k < score.length; k++) {
          if (bestScore === null || score[k] < bestScore[k]) { bestScore = score; bestPosition = position; break; }
          if (score[k] > bestScore[k]) break;
        }
      });
      take(available[bestPosition]);
    }
    return selected.map(function (index) { return collection.items[index].id; });
  }

  return Object.freeze({
    LIMITS: LIMITS,
    validateBackup: validateBackup,
    aggregate: aggregate,
    chooseBatch: chooseBatch
  });
});
