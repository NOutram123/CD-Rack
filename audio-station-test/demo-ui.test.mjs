import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createDemoPlayer } from './public/demo-player.js';
import { sortRackAlbums } from './public/rack-sort.js';
import { wrapAlbum, carouselNeighbours } from './public/carousel.js';

// Execute the complete browser controller with a small DOM double. In particular,
// fetch is real controller code here, so an accidental demo NAS call fails tests.
async function appHarness(publicDemo = false, nasAlbums = []) {
  const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
  const source = (await readFile(new URL('./public/app.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '');
  class Element {
    hidden = false; open = false; value = ''; textContent = ''; disabled = false; scrollLeft = 0;
    children = []; attributes = {}; handlers = {};
    style = { setProperty() {} }; classList = { toggle() {} };
    addEventListener(name, fn) { this.handlers[name] = fn; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    getBoundingClientRect() { return { left: 0, right: 800, top: 0, height: 450, width: 450 }; }
    focus() {} scrollIntoView() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.handlers.close?.(); }
    getContext() { return new Proxy({}, { get: () => () => {} }); }
    get selectedOptions() { return [{ textContent: 'Denon' }]; }
    get isConnected() { return true; }
  }
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
  nodes.get('library').hidden = true;
  nodes.get('album').hidden = true;
  if (publicDemo) nodes.delete('login');
  const requests = [], storage = new Map([['cd-rack-ready', 'yes'], ['cd-rack-sort', 'album']]);
  const context = vm.createContext({
    demoOnly: publicDemo, createDemoPlayer, sortRackAlbums, wrapAlbum, carouselNeighbours, estimateSpineColour() {},
    document: { addEventListener() {}, getElementById: id => nodes.get(id) || null, createElement: () => new Element(), querySelectorAll: () => [...nodes.values()].filter(node => node.open), body: new Element() },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    ResizeObserver: class { observe() {} },
    Option: class extends Element { constructor(title, value) { super(); this.textContent = title; this.value = value; } },
    navigator: {}, window: {}, addEventListener() {}, setInterval() {}, setTimeout() {}, clearTimeout() {},
    performance: { now: () => 1000 }, matchMedia: () => ({ matches: false }), innerWidth: 800, innerHeight: 600, AbortController,
    fetch: async (url, options) => {
      requests.push(url);
      const result = url.endsWith('/discover') ? { devices: [] } : url.endsWith('/players') ? [{ id: 'denon', name: 'Denon', type: 'dlna' }] : url.endsWith('/albums') ? nasAlbums : [];
      return { ok: true, json: async () => result };
    },
  });
  vm.runInContext(source, context);
  await new Promise(setImmediate);
  return { context, nodes, requests, storage, run: expression => vm.runInContext(expression, context) };
}

test('public demo UI makes zero NAS calls through browsing, transport, volume, settings and exit', async () => {
  const h = await appHarness(true);
  assert.equal(h.requests.length, 0, 'public landing page skips discovery and sessions');
  await h.nodes.get('demo-button').onclick();
  assert.equal(h.nodes.get('rack').children.length, 99);
  assert.equal(h.nodes.get('demo-banner').hidden, false);
  await h.run('selectAlbum(2)');
  assert.equal(h.nodes.get('real-art').attributes.src, undefined);
  assert.equal(h.nodes.get('toggle').textContent, 'Play');
  await h.run("command('toggle')");
  assert.equal(h.nodes.get('toggle').textContent, 'Pause');
  await h.run("command('next')");
  await h.nodes.get('open-volume').onclick({ stopPropagation() {} });
  await h.run("volumeRequest('up')");
  assert.equal(h.nodes.get('volume-level').textContent, '36');
  const selected = h.run('selected');
  await h.run('selectAlbum(3)');
  assert.equal(h.run('selected'), selected, 'volume modal blocks album taps');
  await h.nodes.get('close-volume').onclick({ stopPropagation() {} });
  h.nodes.get('sort-by').value = 'date';
  await h.nodes.get('refresh-rack').onclick();
  assert.equal(h.storage.get('demo-cd-rack-sort'), 'date');
  assert.equal(h.storage.get('cd-rack-sort'), 'album', 'real preferences are preserved');
  h.nodes.get('exit-demo').onclick();
  assert.equal(h.nodes.get('library').hidden, true);
  assert.equal(h.requests.length, 0, 'no API requests in public demo, including exit');
});

test('an empty NAS rack retains Settings and Now Playing without synthetic albums', async () => {
  const h = await appHarness(false);
  assert.equal(h.nodes.get('library').hidden, false);
  assert.equal(h.nodes.get('rack').children.length, 2);
  assert.equal(h.nodes.get('empty-library').hidden, false);
  assert.equal(h.run('rackAlbums[0].title'), 'Settings');
  assert.equal(h.run('rackAlbums[1].title'), 'Now Playing');
  assert.ok(h.requests.includes('/api/albums'));
  const count = h.requests.length;
  await h.nodes.get('demo-button').onclick();
  await h.run('selectAlbum(2)');
  await h.run("command('toggle')");
  assert.equal(h.requests.length, count, 'NAS-hosted demo actions do not contact the NAS');
});

test('carousel browsing wraps silently, Now Playing restores focus and volume blocks navigation', async () => {
  const h = await appHarness(true);
  await h.nodes.get('demo-button').onclick();
  h.nodes.get('view-mode').value = 'carousel';
  await h.nodes.get('view-mode').onchange();
  assert.equal(h.run('selected'), 2);
  assert.equal(h.nodes.get('carousel-tools').hidden, false);
  assert.equal(h.nodes.get('toggle').textContent, 'Play', 'entering carousel does not play');
  await h.nodes.get('carousel-left').onclick();
  assert.equal(h.run('selected'), 98, 'previous wraps to last album');
  await h.nodes.get('carousel-right').onclick();
  assert.equal(h.run('selected'), 2, 'next wraps to first');
  await h.run("command('toggle')");
  const playing = h.run('rackAlbums[selected].id');
  await h.nodes.get('carousel-right').onclick();
  assert.equal(h.run('rackAlbums[selected].id') === playing, false, 'selection stays separate from playback');
  assert.equal((await h.run("api('state')")).album, playing);
  await h.nodes.get('carousel-now-playing').onclick();
  assert.equal(h.run('rackAlbums[selected].id'), playing);
  await h.nodes.get('open-volume').onclick({ stopPropagation() {} });
  const selected = h.run('selected');
  await h.nodes.get('carousel-right').onclick();
  assert.equal(h.run('selected'), selected);
  assert.equal(h.requests.length, 0);
  await h.nodes.get('close-volume').onclick({ stopPropagation() {} });
  h.nodes.get('view-mode').value = 'rack';
  await h.nodes.get('view-mode').onchange();
  assert.equal(h.nodes.get('carousel-tools').hidden, true);
  assert.ok(h.nodes.get('rack').children.every(button => !button.hidden));
});

test('an empty carousel keeps fixed utilities usable and disables album navigation', async () => {
  const h = await appHarness(false);
  h.nodes.get('view-mode').value = 'carousel';
  await h.nodes.get('view-mode').onchange();
  assert.equal(h.nodes.get('empty-library').hidden, false);
  assert.equal(h.nodes.get('carousel-left').disabled, true);
  assert.equal(h.nodes.get('carousel-right').disabled, true);
  h.nodes.get('carousel-settings').onclick();
  assert.equal(h.nodes.get('settings').open, true);
});

test('one, two and three album carousels show each neighbour only once and never start playback', async () => {
  for (const count of [1, 2, 3]) {
    const h = await appHarness(true);
    await h.nodes.get('demo-button').onclick();
    await h.run(`demoPlayer = createDemoPlayer(exampleAlbums.slice(0, ${count})); loadLibrary()`);
    h.nodes.get('view-mode').value = 'carousel';
    await h.nodes.get('view-mode').onchange();
    assert.equal(h.nodes.get('rack').children.filter(button => !button.hidden).length, count - 1);
    assert.equal(h.nodes.get('carousel-left').disabled, count === 1);
    for (let i = 0; i < count; i++) await h.nodes.get('carousel-right').onclick();
    assert.equal(h.run('selected'), 2);
    assert.equal((await h.run("api('state')")).status.state, 'stopped');
    assert.equal(h.requests.length, 0);
  }
});

test('NAS covers show a neutral loading state, using generated art only on failure; stale events are ignored', async () => {
  const h = await appHarness(false, [
    { id: 'real-a', name: 'A', artist: 'Artist', trackCount: 1 },
    { id: 'real-b', name: 'B', artist: 'Artist', trackCount: 1 },
  ]);
  const image = h.nodes.get('real-art');
  const fallback = h.nodes.get('art');
  const loading = h.nodes.get('artwork-loading');
  await h.run('selectAlbum(2)');
  assert.equal(fallback.hidden, true, 'no synthetic cover flashes before NAS image loads');
  assert.equal(loading.hidden, false);
  assert.equal(image.hidden, true);
  const staleError = image.onerror;
  const staleLoad = image.onload;
  await h.run('selectAlbum(3)');
  staleError(); staleLoad();
  assert.equal(fallback.hidden, true);
  assert.equal(loading.hidden, false, 'old image events cannot alter the new cover');
  assert.equal(image.hidden, true);
  image.onload();
  assert.equal(image.hidden, false);
  assert.equal(loading.hidden, true);
  assert.equal(fallback.hidden, true);
  await h.run('selectAlbum(2)');
  image.onerror();
  assert.equal(loading.hidden, true);
  assert.equal(image.hidden, true);
  assert.equal(fallback.hidden, false, 'missing real artwork still gets a generated fallback');
});
