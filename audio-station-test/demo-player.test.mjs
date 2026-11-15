import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoPlayer } from './public/demo-player.js';

test('continuous demo follows rack order, wraps, and respects No and pause without playing on enable', async () => {
  let time = 0;
  const demo = createDemoPlayer([['A', 'Artist'], ['B', 'Artist'], ['C', 'Artist']], () => time);
  const options = { enabled: true, order: ['demo-0', 'demo-2', 'demo-1'] };
  await demo.request('continuous', options);
  assert.equal((await demo.request('state')).status.state, 'stopped');
  await demo.request('play', { album: 'demo-0' });
  time += 12 * 30000;
  assert.equal((await demo.request('state')).album, 'demo-2');
  time += 8 * 30000;
  assert.equal((await demo.request('state')).album, 'demo-1');
  time += 8 * 30000;
  assert.equal((await demo.request('state')).album, 'demo-0');
  await demo.request('control', { action: 'pause' });
  time += 99 * 30000;
  assert.equal((await demo.request('state')).status.state, 'paused');
  await demo.request('continuous', { ...options, enabled: false });
  await demo.request('play', { album: 'demo-1' });
  time += 8 * 30000;
  assert.equal((await demo.request('state')).status.state, 'stopped');
  await demo.request('continuous', options);
  assert.equal((await demo.request('state')).status.state, 'stopped');
});

test('demo receiver supports silent playback, disc boundaries, pause and queue replacement', async () => {
  let time = 0;
  const demo = createDemoPlayer([['Triple', 'Example'], ['Single', 'Other']], () => time);
  const albums = await demo.request('albums');
  assert.equal(albums[0].discCount, 3);
  assert.equal(albums[0].caseStyle, 'fatbox');
  assert.equal((await demo.request('state')).status.state, 'stopped');
  assert.equal((await demo.request('tracks', { album: 'demo-0' })).length, 12);
  assert.equal((await demo.request('state')).queue.songs.length, 0, 'browsing does not play');
  await demo.request('play', { album: 'demo-0' });
  time += 4 * 30000;
  let state = await demo.request('state');
  assert.equal(state.status.index, 4);
  assert.equal(state.status.song.additional.song_tag.disc, 2);
  await demo.request('control', { action: 'pause' });
  time += 60000;
  assert.equal((await demo.request('state')).status.index, 4);
  state = await demo.request('control', { action: 'next' });
  assert.equal(state.status.state, 'playing');
  assert.equal(state.status.index, 5);
  await demo.request('play', { album: 'demo-1' });
  state = await demo.request('state');
  assert.equal(state.album, 'demo-1');
  assert.equal(state.queue.songs.length, 8);
  assert.equal(state.status.index, 0);
  assert.ok(state.queue.songs.every(song => song.additional.song_tag.disc === 1));
});

test('demo volume cannot change playback or its queue and restores a known mute level', async () => {
  const demo = createDemoPlayer([['Album', 'Example']]);
  await demo.request('play', { album: 'demo-0' });
  const before = await demo.request('state');
  const original = await demo.request('volume');
  assert.equal((await demo.request('volume', { action: 'down' })).level, original.level - 1);
  assert.equal((await demo.request('volume', { action: 'mute' })).level, 0);
  assert.equal((await demo.request('volume', { action: 'mute' })).level, original.level - 1);
  assert.deepEqual(await demo.request('state'), before);
  await assert.rejects(demo.request('login'), /unavailable/);
});
