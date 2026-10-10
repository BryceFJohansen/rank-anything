const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor(tag, text = '') {
    this.tagName = tag;
    this._text = text;
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.value = '';
    this.disabled = false;
    this.className = '';
    this.parent = null;
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(s) {
    this._text = String(s);
    this.children = [];
  }
  append(...cs) {
    for (const c of cs) {
      this.children.push(c);
      c.parent = this;
    }
  }
  replaceChildren(...cs) {
    this.children.forEach((c) => (c.parent = null));
    this.children = [];
    this._text = '';
    this.append(...cs);
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'value') this.value = String(v);
    if (k === 'id') this.id = String(v);
  }
  addEventListener(k, v) {
    this.listeners[k] = v;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  click() {
    if (!this.disabled) return this.listeners.click?.({ target: this });
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  focus() {}
  select() {}
  setCustomValidity() {}
  reportValidity() {}
}
function app(initial, failWrites = false) {
  const body = new Element('body'),
    root = new Element('div');
  root.id = 'app';
  body.append(root);
  let stored = initial ?? null;
  const timers = [];
  const urls = [];
  const all = (n = body) => [n, ...n.children.flatMap((c) => all(c))];
  const document = {
    body,
    createElement: (t) => new Element(t),
    createTextNode: (s) => new Element('#text', s),
    getElementById: (id) => all().find((n) => n.id === id),
    querySelector: (s) =>
      s[0] === '.'
        ? all().find((n) => n.className.split(' ').includes(s.slice(1)))
        : all().find((n) => n.tagName === s),
  };
  const window = {
    listeners: {},
    addEventListener(k, v) {
      this.listeners[k] = v;
    },
  };
  const ctx = vm.createContext({
    document,
    window,
    Node: Element,
    localStorage: {
      getItem: () => stored,
      setItem: (k, v) => {
        if (failWrites) throw Error('quota');
        stored = v;
      },
    },
    setTimeout: (fn, n) => {
      if (n === 0) timers.push(fn);
      return timers.length;
    },
    clearTimeout: () => {},
    Blob,
    URL: {
      createObjectURL: (b) => {
        urls.push(b);
        return 'blob:test';
      },
      revokeObjectURL() {},
    },
    console,
  });
  vm.runInContext(
    fs.readFileSync(require('node:path').join(__dirname, '../engine.js'), 'utf8'),
    ctx,
  );
  window.RankingEngine = ctx.RankingEngine;
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8'), ctx);
  const button = (txt) => {
    const e = all().find((n) => n.tagName === 'button' && n.textContent === txt);
    assert.ok(e, 'Button missing: ' + txt);
    return e;
  };
  const click = (txt) => {
    const r = button(txt).click();
    while (timers.length) timers.shift()();
    return r;
  };
  return {
    all,
    root,
    document,
    window,
    button,
    click,
    urls,
    saved: () => stored,
    data: () => JSON.parse(stored),
    fill: (id, value) => (document.getElementById(id).value = value),
    dialogInput: (value) => {
      const d = all().find((n) => n.tagName === 'dialog');
      d.children.find((n) => n.tagName === 'input').value = value;
    },
    flush: () => {
      while (timers.length) timers.shift()();
    },
  };
}
function create(a, name = 'Collection') {
  a.click('Create a collection');
  a.dialogInput(name);
  a.click('Create collection');
}
function add(a, items) {
  a.fill('bulk-items', items.join('\n'));
  a.click('Add to collection');
}
function choose(a, indices) {
  a.click('Choose items');
  const inputs = a.all().filter((n) => n.tagName === 'input' && n.attrs.type === 'checkbox');
  for (const i of indices) {
    inputs[i].checked = true;
    inputs[i].listeners.change({ target: inputs[i] });
  }
  a.click('Start chosen ballot');
}
function removeItem(a, name, confirm = true) {
  const row = a
    .all()
    .find(
      (node) =>
        node.className === 'list-item' &&
        node.children.some(
          (child) => child.className === 'item-name' && child.textContent === name,
        ),
    );
  assert.ok(row, 'Item missing: ' + name);
  a.all(row)
    .find((node) => node.tagName === 'button' && node.textContent === 'Remove')
    .click();
  a.click(confirm ? 'Remove item' : 'Cancel');
}
test('create, add, chosen ballot, tie, skip, save, reload and undo', () => {
  const a = app();
  create(a);
  add(a, ['Alpha', 'Beta', 'Gamma']);
  a.click('Rank');
  choose(a, [0, 1, 2]);
  a.all()
    .find((n) => n.tagName === 'button' && n.attrs['aria-label'] === 'Tie Beta with the rank above')
    .click();
  a.all()
    .find((n) => n.tagName === 'button' && n.attrs['aria-label']?.startsWith('Skip Gamma'))
    .click();
  a.click('Save ballot →');
  let c = a.data().collections[0];
  assert.equal(c.ballots.length, 1);
  assert.deepEqual(c.ballots[0].groups, [[c.items[0].id, c.items[1].id]]);
  assert.deepEqual(c.ballots[0].skipped, [c.items[2].id]);
  const reloaded = app(a.saved());
  reloaded.click('History');
  assert.match(reloaded.root.textContent, /Alpha = Beta/);
  reloaded.click('Undo this ballot');
  reloaded.click('Remove ballot');
  assert.equal(reloaded.data().collections[0].ballots.length, 0);
});
test('Unicode duplicates are skipped and invalid pasted input survives rollback', () => {
  const a = app();
  create(a);
  add(a, ['Straße', 'Other']);
  add(a, ['Strasse', 'New item', 'Ｎｅｗ item']);
  assert.deepEqual(
    a.data().collections[0].items.map((item) => item.name),
    ['Straße', 'Other', 'New item'],
  );
  assert.match(a.root.textContent, /2 duplicate names skipped/);
  const before = a.saved();
  add(a, ['Valid addition', 'bad\tname']);
  assert.equal(a.saved(), before);
  assert.match(a.root.textContent, /Change not saved/);
  assert.equal(a.document.getElementById('bulk-items').value, 'Valid addition\nbad\tname');
  add(a, ['Valid addition', 'Corrected name']);
  assert.equal(a.data().collections[0].items.length, 5);
  a.click('Rank');
  choose(a, [0, 1]);
  a.click('Save ballot →');
  assert.equal(a.data().collections[0].ballots.length, 1);
});
test('new collection cancellation preserves a draft, including after accepting the warning', () => {
  const a = app();
  create(a, 'First');
  add(a, ['Alpha', 'Beta']);
  a.click('Rank');
  choose(a, [0, 1]);
  a.click('+ New collection');
  assert.match(a.all().find((node) => node.tagName === 'dialog').textContent, /Leave this ballot/);
  a.click('Cancel');
  assert.ok(a.button('Save ballot →'));
  a.click('+ New collection');
  a.click('Leave ballot');
  a.dialogInput('bad\tname');
  a.click('Create collection');
  assert.equal(a.data().collections.length, 1);
  a.click('Cancel');
  a.click('Save ballot →');
  assert.equal(a.data().collections[0].ballots.length, 1);
  a.click('Next round');
  a.click('+ New collection');
  a.click('Leave ballot');
  a.dialogInput('Second');
  a.click('Create collection');
  assert.equal(a.data().collections.length, 2);
  assert.equal(a.data().collections[0].ballots.length, 1);
});
test('renaming uses the same duplicate-name rules as adding and importing', () => {
  const a = app();
  create(a);
  add(a, ['Other', 'Straße']);
  const before = a.saved();
  a.click('Edit');
  a.dialogInput('Strasse');
  a.click('Save name');
  assert.equal(a.saved(), before);
  assert.ok(a.button('Save name'));
  assert.match(a.root.textContent, /Another item already uses that name/);
  a.dialogInput('Renamed');
  a.click('Save name');
  assert.equal(a.data().collections[0].items[0].name, 'Renamed');
});
test('unreadable raw local save survives new work until explicit replace', () => {
  const a = app('{corrupt raw');
  assert.equal(a.saved(), '{corrupt raw');
  create(a);
  add(a, ['A', 'B']);
  assert.equal(a.saved(), '{corrupt raw');
  a.click('Replace previous save');
  a.click('Cancel');
  assert.equal(a.saved(), '{corrupt raw');
  a.click('Replace previous save');
  a.click('Replace save');
  assert.equal(a.data().collections[0].items.length, 2);
});
test('storage write failure stays usable and warns', () => {
  const a = app(undefined, true);
  create(a);
  add(a, ['A', 'B']);
  a.click('Rank');
  choose(a, [0, 1]);
  a.click('Save ballot →');
  assert.match(a.root.textContent, /cannot save these changes locally/);
  assert.equal(a.saved(), null);
});
test('manual chooser limits five and can reach items beyond automatic batch', () => {
  const a = app();
  create(a);
  add(
    a,
    Array.from({ length: 12 }, (_, i) => `Item ${i}`),
  );
  a.click('Rank');
  a.click('Choose items');
  const cs = a.all().filter((n) => n.attrs.type === 'checkbox');
  assert.equal(a.button('Start chosen ballot').disabled, true);
  for (const c of cs) {
    c.checked = true;
    c.listeners.change({ target: c });
  }
  assert.equal(cs[5].checked, false);
  assert.equal(cs[10].checked, false);
  assert.equal(cs[11].checked, false);
  a.click('Cancel');
  choose(a, [10, 11]);
  a.click('Save ballot →');
  const c = a.data().collections[0];
  assert.deepEqual(c.ballots[0].groups, [[c.items[10].id], [c.items[11].id]]);
});
test('deleting item cleans ballot references and keeps backups valid', () => {
  const a = app();
  create(a);
  add(a, ['A', 'B', 'C']);
  a.click('Rank');
  choose(a, [0, 1, 2]);
  a.click('Save ballot →');
  a.click('Items');
  a.click('Remove');
  a.click('Remove item');
  const c = a.data().collections[0];
  assert.equal(c.items.length, 2);
  assert.equal(c.ballots[0].groups.length, 2);
  a.click('Remove');
  a.click('Remove item');
  assert.equal(a.data().collections[0].ballots.length, 0);
});
test('cancelling deletion and removing an unrelated item preserve draft ties and skips', () => {
  const a = app();
  create(a);
  add(a, ['Alpha', 'Beta', 'Gamma', 'Delta']);
  const [alpha, beta, gamma] = a.data().collections[0].items.map((item) => item.id);
  a.click('Rank');
  choose(a, [0, 1, 2]);
  a.all()
    .find((node) => node.attrs['aria-label'] === 'Tie Beta with the rank above')
    .click();
  a.all()
    .find((node) => node.attrs['aria-label']?.startsWith('Skip Gamma'))
    .click();
  a.click('Items');
  const before = a.saved();
  removeItem(a, 'Alpha', false);
  assert.equal(a.saved(), before);
  removeItem(a, 'Delta');
  a.click('Rank');
  a.click('Save ballot →');
  const ballot = a.data().collections[0].ballots[0];
  assert.deepEqual(ballot.groups, [[alpha, beta]]);
  assert.deepEqual(ballot.skipped, [gamma]);
});
test('deleting ranked, tied, and skipped items removes only their draft references', () => {
  const a = app();
  create(a);
  add(a, ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']);
  const [, , gamma, delta] = a.data().collections[0].items.map((item) => item.id);
  a.click('Rank');
  choose(a, [0, 1, 2, 3, 4]);
  a.all()
    .find((node) => node.attrs['aria-label'] === 'Move Gamma up')
    .click();
  a.all()
    .find((node) => node.attrs['aria-label'] === 'Tie Beta with the rank above')
    .click();
  a.all()
    .find((node) => node.attrs['aria-label']?.startsWith('Skip Epsilon'))
    .click();
  a.click('Items');
  for (const name of ['Alpha', 'Beta', 'Epsilon']) removeItem(a, name);
  a.click('Rank');
  a.click('Save ballot →');
  const ballot = a.data().collections[0].ballots[0];
  assert.deepEqual(ballot.groups, [[gamma], [delta]]);
  assert.deepEqual(ballot.skipped, []);
});
test('deletion leaves an incomplete draft available for restoring skipped items', () => {
  const a = app();
  create(a);
  add(a, ['Alpha', 'Beta', 'Gamma']);
  const [alpha, , gamma] = a.data().collections[0].items.map((item) => item.id);
  a.click('Rank');
  choose(a, [0, 1, 2]);
  a.all()
    .find((node) => node.attrs['aria-label']?.startsWith('Skip Gamma'))
    .click();
  a.click('Items');
  removeItem(a, 'Beta');
  a.click('Rank');
  assert.equal(a.button('Save ballot →').disabled, true);
  assert.match(a.root.textContent, /At least two ranked items are needed/);
  a.click('Save ballot →');
  assert.equal(a.data().collections[0].ballots.length, 0);
  a.click('Restore');
  a.click('Save ballot →');
  assert.deepEqual(a.data().collections[0].ballots[0].groups, [[alpha], [gamma]]);
});
test('draft remains visible with one or no collection items and can be discarded', () => {
  const a = app();
  create(a);
  add(a, ['Alpha', 'Beta']);
  a.click('Rank');
  choose(a, [0, 1]);
  for (const name of ['Beta', 'Alpha']) {
    a.click('Items');
    removeItem(a, name);
    a.click('Rank');
    assert.equal(a.button('Save ballot →').disabled, true);
    assert.match(a.root.textContent, /Add more items in Items/);
  }
  assert.equal(a.data().collections[0].ballots.length, 0);
  a.click('Discard ballot');
  a.click('Discard');
  assert.ok(a.button('Add your items'));
});
test('malicious names remain text, no injected DOM', () => {
  const a = app();
  create(a, '<img src=x onerror=alert(1)>');
  add(a, ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>']);
  assert.equal(a.all().filter((n) => n.tagName === 'script' || n.tagName === 'img').length, 0);
  assert.match(a.root.textContent, /<script>/);
  a.click('Rank');
  choose(a, [0, 1]);
  a.click('Save ballot →');
  assert.equal(a.all().filter((n) => n.tagName === 'script' || n.tagName === 'img').length, 0);
});
test('collection switch cancellation preserves draft, confirmation discards only draft', () => {
  const a = app();
  create(a, 'First');
  add(a, ['A', 'B']);
  a.click('+ New collection');
  a.dialogInput('Second');
  a.click('Create collection');
  add(a, ['C', 'D']);
  a.click('Rank');
  choose(a, [0, 1]);
  a.click('First2');
  a.click('Cancel');
  assert.ok(a.button('Save ballot →'));
  a.click('Save ballot →');
  const d = a.data();
  assert.equal(d.collections[0].ballots.length, 0);
  assert.equal(d.collections[1].ballots.length, 1);
  a.click('Next round');
  a.click('First2');
  a.click('Leave ballot');
  assert.ok(a.button('Start a ballot'));
  assert.equal(a.data().collections[1].ballots.length, 1);
});
test('import is additive, cancel is inert, invalid backup leaves state unchanged', async () => {
  const a = app();
  create(a, 'Original');
  add(a, ['A', 'B']);
  const before = a.saved();
  const input = () => a.all().find((n) => n.attrs.type === 'file');
  const importFile = async (text) => {
    const n = input();
    n.files = [{ size: text.length, text: async () => text }];
    await n.listeners.change({ target: n });
  };
  await importFile(before);
  a.click('Cancel');
  assert.equal(a.saved(), before);
  await importFile('{bad');
  assert.equal(a.saved(), before);
  assert.match(a.root.textContent, /Import stopped/);
  await importFile(before);
  a.click('Import collections');
  const d = a.data();
  assert.equal(d.collections.length, 2);
  assert.notEqual(d.collections[0].id, d.collections[1].id);
  assert.deepEqual(d.collections[0].items, d.collections[1].items);
});

test('save confirmation, next round, results and undo preserve exactly one ballot per save', () => {
  const a = app();
  create(a);
  add(
    a,
    Array.from({ length: 9 }, (_, i) => 'Item ' + i),
  );
  a.click('Rank');
  a.click('Start a ballot');
  const save = a.button('Save ballot →');
  save.click();
  save.click();
  assert.equal(a.data().collections[0].ballots.length, 1);
  assert.match(a.root.textContent, /Ballot saved/);
  assert.ok(a.button('Next round'));
  assert.ok(a.button('View results'));
  const first = a.data().collections[0].ballots[0].groups.flat();
  const next = a.button('Next round');
  next.click();
  next.click();
  assert.equal(a.data().collections[0].ballots.length, 1);
  a.click('Save ballot →');
  let c = a.data().collections[0];
  assert.equal(c.ballots.length, 2);
  const second = c.ballots[1].groups.flat();
  assert.equal(second.length, 5);
  assert.ok(second.some((id) => !first.includes(id)));
  assert.ok(second.some((id) => first.includes(id)));
  a.click('View results');
  assert.match(a.root.textContent, /ballots contributing/);
  a.click('History');
  a.click('Undo this ballot');
  a.click('Remove ballot');
  c = a.data().collections[0];
  assert.equal(c.ballots.length, 1);
  assert.deepEqual(c.ballots[0].groups.flat(), first);
});
test('v1 local storage and additive import retain historical ten-item ballots', async () => {
  const ids = Array.from({ length: 10 }, (_, i) => 'i' + i);
  const original = {
    version: 1,
    collections: [
      {
        id: 'old',
        name: 'Old',
        items: ids.map((id) => ({ id, name: id })),
        ballots: [
          {
            id: 'legacy',
            createdAt: '2026-10-09T12:00:00.000Z',
            groups: ids.map((id) => [id]),
            skipped: [],
          },
        ],
      },
    ],
  };
  const a = app(JSON.stringify(original));
  assert.equal(a.data().collections[0].ballots[0].groups.length, 10);
  a.click('Start a ballot');
  a.click('Save ballot →');
  assert.equal(a.data().collections[0].ballots[1].groups.length, 5);
  const n = a.all().find((n) => n.attrs.type === 'file');
  n.files = [{ size: 500, text: async () => JSON.stringify(original) }];
  await n.listeners.change({ target: n });
  a.click('Import collections');
  const c = a.data().collections;
  assert.equal(c.length, 2);
  assert.equal(c[1].ballots[0].groups.length, 10);
  assert.equal(c[0].ballots.length, 2);
});
