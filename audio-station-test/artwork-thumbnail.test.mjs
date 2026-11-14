import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { artworkThumbnail } from './artwork-thumbnail.mjs';

test('thumbnails coalesce, survive release restarts, and refresh after cover changes', async t => {
  const root = path.resolve(os.tmpdir());
  const directory = await mkdtemp(path.join(root, 'home-music-thumb-test-'));
  assert.ok(path.resolve(directory).startsWith(root + path.sep));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const image = Buffer.from('encoded thumbnail');
  const calls = [];
  const run = async (...args) => { calls.push(args); return { stdout: image }; };
  const info = { size: 10000, mtimeMs: 10 };
  const requests = await Promise.all(Array.from({ length: 5 }, () => artworkThumbnail('/music/cover.jpg', info, directory, 'convert', run)));
  assert.equal(calls.length, 1);
  assert.ok(requests.every(result => result.data.equals(image)));
  assert.ok(calls[0][1].includes('512x512>'), 'thumbnail caps size without enlarging small covers');
  const cached = await artworkThumbnail('/music/cover.jpg', info, directory, 'convert', async () => { throw Error('cached cover must not be re-encoded'); });
  assert.ok(cached.data.equals(image));
  assert.equal(calls.length, 1);
  await artworkThumbnail('/music/cover.jpg', { ...info, mtimeMs: 11 }, directory, 'convert', run);
  assert.equal(calls.length, 2, 'new source version invalidates the cache');
  assert.equal(await artworkThumbnail('/music/other.jpg', info, directory, 'missing', async () => { throw Error('unavailable'); }), null);
});
