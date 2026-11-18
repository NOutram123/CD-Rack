import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createDemoPlayer } from './public/demo-player.js';
import { sortRackAlbums } from './public/rack-sort.js';
import { wrapAlbum, carouselNeighbours, carouselSpineScale, carouselSwipeSteps } from './public/carousel.js';

// Execute the complete browser controller with a small DOM double. In particular,
// fetch is real controller code here, so an accidental demo NAS call fails tests.
async function appHarness(publicDemo = false, nasAlbums = []) {
  const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
  const source = (await readFile(new URL('./public/app.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '');
  class Element {
    hidden = false; open = false; value = ''; textContent = ''; disabled = false; scrollLeft = 0; clientWidth = 800;
    children = []; attributes = {}; handlers = {};
    style = { properties: {}, setProperty(key, value) { this.properties[key] = value; } }; classList = { toggle() {}, remove() {} };
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
    demoOnly: publicDemo, createDemoPlayer, sortRackAlbums, wrapAlbum, carouselNeighbours, carouselSpineScale, carouselSwipeSteps, estimateSpineColour() {},
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
  assert.equal(h.nodes.get('rack').children.length, 97);
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

test('settings default to Rack and Yes; continuous playback follows the applied order and focuses the next album', async () => {
  const h = await appHarness(true);
  await h.nodes.get('demo-button').onclick();
  assert.equal(h.nodes.get('view-rack').attributes['aria-pressed'], 'true');
  assert.equal(h.nodes.get('continuous-yes').attributes['aria-pressed'], 'true');
  await h.run('demoTime = 0; demoPlayer = createDemoPlayer(exampleAlbums.slice(0, 3), () => demoTime); loadLibrary()');
  await h.nodes.get('view-carousel').onclick();
  assert.equal(h.nodes.get('view-carousel').attributes['aria-pressed'], 'true');
  await h.run('selectAlbum(2)');
  await h.run("command('toggle')");
  const next = h.run('rackAlbums[3].id');
  const duration = h.run('selectedTracks.length * 30000');
  await h.run(`demoTime += ${duration}; poll()`);
  assert.equal(h.run('rackAlbums[selected].id'), next);
  assert.equal((await h.run("api('state')")).status.state, 'playing');
  await h.nodes.get('continuous-no').onclick();
  assert.equal(h.storage.get('demo-cd-rack-continuous'), 'no');
  assert.equal(h.nodes.get('continuous-no').attributes['aria-pressed'], 'true');
  await h.run('demoTime += selectedTracks.length * 30000; poll()');
  assert.equal((await h.run("api('state')")).status.state, 'stopped');
  await h.nodes.get('continuous-yes').onclick();
  assert.equal((await h.run("api('state')")).status.state, 'stopped');
  assert.equal(h.requests.length, 0);
});

test('pinned Rack utilities still respond after dragging the album shelf', async () => {
  const h = await appHarness(true);
  await h.nodes.get('demo-button').onclick();
  await h.run('selectAlbum(2)');
  await h.run("command('toggle')");
  const playing = h.run('rackAlbums[selected].id');
  await h.run('selectAlbum(3)');
  const rack = h.nodes.get('rack');
  const dragShelf = () => {
    rack.handlers.pointerdown({ pointerType: 'mouse', button: 0, clientX: 200 });
    rack.handlers.pointermove({ buttons: 1, clientX: 100 });
    rack.handlers.pointerup();
    assert.equal(h.run('dragged'), true);
  };
  dragShelf();
  h.nodes.get('pinned-tools').children[0].handlers.click({ detail: 1 });
  assert.equal(h.nodes.get('settings').open, true, 'a previous shelf drag must not suppress Settings');
  h.nodes.get('settings').close();
  dragShelf();
  h.nodes.get('pinned-tools').children[1].handlers.click({ detail: 1 });
  await new Promise(setImmediate);
  assert.equal(h.run('rackAlbums[selected].id'), playing, 'Now Playing must reopen the playing album after a shelf drag');
  assert.equal((await h.run("api('state')")).status.state, 'playing');
  assert.equal(h.requests.length, 0);
});

test('track popup highlights playing titles and starts the selected track with active transport in both views', async () => {
  for (const mode of ['rack', 'carousel']) {
    const h = await appHarness(true);
    await h.nodes.get('demo-button').onclick();
    await h.nodes.get(`view-${mode}`).onclick();
    await h.run('selectAlbum(2)');
    await h.run("command('toggle')");
    await h.run("command('next')");
    await new Promise(setImmediate);
    const before = await h.run("api('state')");
    await h.nodes.get('open-tracks').onclick({ stopPropagation() {} });
    assert.equal(h.nodes.get('tracks-dialog').open, true);
    const list = h.nodes.get('track-list');
    assert.equal(list.children.length, h.run('selectedTracks.length'));
    assert.equal(list.children[1].children[0].attributes['aria-current'], 'true');
    assert.equal(list.children[0].children[0].attributes['aria-current'], undefined);
    assert.deepEqual(await h.run("api('state')"), before, 'opening the list must not change playback');
    const selected = h.run('selected');
    await h.run("selectAlbum(3); command('next')");
    assert.equal(h.run('selected'), selected, 'modal blocks album changes');
    assert.deepEqual(await h.run("api('state')"), before, 'modal blocks underlying transport');
    await list.children[4].children[0].onclick();
    assert.equal(h.nodes.get('tracks-dialog').open, false);
    const playing = await h.run("api('state')");
    assert.equal(playing.status.index, 4);
    assert.equal(playing.status.state, 'playing');
    assert.equal(playing.queue.songs.length, before.queue.songs.length, 'the full album queue is preserved');
    assert.equal(h.nodes.get('toggle').textContent, 'Pause');
    assert.equal(h.nodes.get('toggle').attributes['aria-pressed'], 'true');
    assert.equal(h.nodes.get('toggle').disabled, false);
    await h.nodes.get('open-tracks').onclick({ stopPropagation() {} });
    assert.equal(list.children[4].children[0].attributes['aria-current'], 'true');
    await h.nodes.get('close-tracks').onclick({ stopPropagation() {} });
    await h.run('selectAlbum(3)');
    await h.nodes.get('open-tracks').onclick({ stopPropagation() {} });
    assert.ok(list.children.every(row => !row.children[0].attributes['aria-current']), 'another album must not inherit the current track highlight');
    h.nodes.get('tracks-dialog').handlers.cancel({ preventDefault() {}, stopPropagation() {} });
    assert.equal(h.nodes.get('tracks-dialog').open, false);
    assert.equal(h.nodes.get('open-tracks').attributes['aria-expanded'], 'false');
    assert.deepEqual(await h.run("api('state')"), playing, 'dismissing leaves playback untouched');
    assert.equal(h.requests.length, 0, 'demo track browsing and playback never contact the NAS');
  }
});

test('an empty NAS rack retains Settings and Now Playing without synthetic albums', async () => {
  const h = await appHarness(false);
  assert.equal(h.nodes.get('library').hidden, false);
  assert.equal(h.nodes.get('rack').children.length, 0);
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
  await h.nodes.get('view-carousel').onclick();
  assert.equal(h.run('selected'), 2);
  assert.equal(h.nodes.get('pinned-tools').children.length, 2);
  assert.ok(h.nodes.get('pinned-tools').children.every(button => !button.hidden));
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
  await h.run('selectAlbum(1)');
  assert.equal(h.run('rackAlbums[selected].id'), playing);
  await h.nodes.get('open-volume').onclick({ stopPropagation() {} });
  const selected = h.run('selected');
  await h.nodes.get('carousel-right').onclick();
  assert.equal(h.run('selected'), selected);
  assert.equal(h.requests.length, 0);
  await h.nodes.get('close-volume').onclick({ stopPropagation() {} });
  await h.nodes.get('view-rack').onclick();
  assert.ok(h.nodes.get('pinned-tools').children.every(button => !button.hidden));
  assert.ok(h.nodes.get('rack').children.every(button => !button.hidden));
});

test('an empty carousel keeps fixed utilities usable and disables album navigation', async () => {
  const h = await appHarness(false);
  await h.nodes.get('view-carousel').onclick();
  assert.equal(h.nodes.get('empty-library').hidden, false);
  assert.equal(h.nodes.get('carousel-left').disabled, true);
  assert.equal(h.nodes.get('carousel-right').disabled, true);
  await h.run('selectAlbum(0)');
  assert.equal(h.nodes.get('settings').open, true);
});

test('cover and spine swipes rotate in both directions without playback; native art dragging is blocked', async () => {
  const h = await appHarness(true);
  await h.nodes.get('demo-button').onclick();
  await h.nodes.get('view-carousel').onclick();
  const deck = h.nodes.get('deck');
  for (const pointerType of ['mouse', 'touch']) {
    for (const dx of [-90, 90]) {
      const before = h.run('selected');
      const event = { pointerType, pointerId: 1, button: 0, clientX: 200, clientY: 100, target: { closest: () => null }, preventDefault() {} };
      deck.handlers.pointerdown(event);
      deck.handlers.pointermove({ ...event, clientX: 200 + dx });
      deck.handlers.pointerup({ ...event, type: 'pointerup', clientX: 200 + dx });
      await new Promise(setImmediate);
      assert.equal(h.run('selected'), wrapAlbum(before - 2 + (dx < 0 ? 1 : -1), 97) + 2);
      assert.equal((await h.run("api('state')")).status.state, 'stopped');
    }
  }
  let prevented = false;
  deck.handlers.dragstart({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(deck.style.properties['--carousel-drag'], undefined, 'swipes never displace the artwork or spines');
  const before = h.run('selected');
  const event = { pointerId: 2, button: 0, clientX: 650, clientY: 100, target: { closest: () => null }, preventDefault() {} };
  deck.handlers.pointerdown(event);
  deck.handlers.pointermove({ ...event, clientX: 150 });
  deck.handlers.pointerup({ ...event, type: 'pointerup', clientX: 150 });
  await new Promise(setImmediate);
  assert.equal(h.run('selected'), wrapAlbum(before - 2 + 4, 97) + 2, 'long swipes advance four albums');
  assert.ok(h.nodes.get('pinned-tools').children.every(button => !button.hidden));
  assert.equal(h.requests.length, 0);
});

test('one, two and three album carousels show each neighbour only once and never start playback', async () => {
  for (const count of [1, 2, 3]) {
    const h = await appHarness(true);
    await h.nodes.get('demo-button').onclick();
    await h.run(`demoPlayer = createDemoPlayer(exampleAlbums.slice(0, ${count})); loadLibrary()`);
    await h.nodes.get('view-carousel').onclick();
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
