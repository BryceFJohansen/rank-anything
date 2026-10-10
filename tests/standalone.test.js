const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rank-anything-standalone-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  for (const file of [
    'index.html',
    'app.js',
    'engine.js',
    'style.css',
    'LICENSE',
    'scripts/standalone.mjs',
  ]) {
    fs.copyFileSync(path.join(__dirname, '..', file), path.join(root, file));
  }
  return {
    root,
    read: (file) => fs.readFileSync(path.join(root, file), 'utf8'),
    run: (...args) =>
      spawnSync(process.execPath, [path.join(root, 'scripts/standalone.mjs'), ...args], {
        encoding: 'utf8',
      }),
  };
}

test('standalone generation embeds the license and sources after the app container', (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const html = f.read('Rank-Anything.html');
  for (const file of ['LICENSE', 'style.css', 'engine.js', 'app.js']) {
    assert.ok(html.includes(f.read(file)), `${file} was not embedded verbatim`);
  }
  assert.doesNotMatch(html, /<script[^>]*\bsrc=|<link[^>]*href="style\.css"/);
  assert.ok(html.indexOf('<div id="app">') < html.indexOf('<script>'));
  assert.ok(html.indexOf(f.read('engine.js')) < html.indexOf(f.read('app.js')));
  assert.equal(f.run('--check').status, 0);
});

test('standalone checks reject stale output without rewriting it', (t) => {
  const f = fixture(t);
  assert.equal(f.run('--check').status, 1, 'Missing output should fail the check');
  assert.equal(fs.existsSync(path.join(f.root, 'Rank-Anything.html')), false);
  assert.equal(f.run().status, 0);
  for (const file of ['index.html', 'app.js', 'engine.js', 'style.css', 'LICENSE']) {
    const before = f.read('Rank-Anything.html');
    const change =
      file === 'index.html' ? '\n<!-- fixture update -->\n' : '\n/* fixture update */\n';
    fs.appendFileSync(path.join(f.root, file), change);
    const check = f.run('--check');
    assert.equal(check.status, 1, `${file} changes should invalidate the generated file`);
    assert.match(check.stderr, /stale/);
    assert.equal(f.read('Rank-Anything.html'), before, 'Checking must not modify output');
    assert.equal(f.run().status, 0);
    assert.equal(f.run('--check').status, 0);
  }
});
