import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completionSample, albumFinished } from './continuous-play.mjs';

const queue = { songs: [1, 2].map(id => ({ id: String(id), additional: { song_audio: { duration: 180 } } })) };
const sample = (state, position, index = 1, at = 1000) => completionSample({ status: { state, position, index }, queue }, at);

test('continuous playback requires the final track to finish naturally in the same queue', () => {
  assert.equal(albumFinished(sample('playing', 178), sample('stopped', 0, 1, 3000)), true);
  assert.equal(albumFinished(sample('playing', 178), sample('stopped', 0, 0, 3000)), true, 'receiver may reset its index on completion');
  assert.equal(albumFinished(sample('playing', 50), sample('stopped', 0, 1, 3000)), false, 'early stop does not restart music');
  assert.equal(albumFinished(sample('playing', 178, 0), sample('stopped', 0, 0, 3000)), false, 'middle-of-album stop does not advance');
  assert.equal(albumFinished(sample('pause', 178), sample('stopped', 0, 1, 3000)), false);
  assert.equal(albumFinished(sample('paused', 178), sample('stopped', 0, 1, 3000)), false);
  assert.equal(albumFinished(sample('playing', 178), sample('pause', 178, 1, 3000)), false);
  assert.equal(albumFinished(sample('playing', 178), sample('stopped', 0, 1, 20000)), false, 'stale observations never restart playback');
  assert.equal(albumFinished(undefined, sample('stopped', 0)), false, 'startup cannot start playback');
  assert.equal(albumFinished(sample('playing', 178), { ...sample('stopped', 0, 1, 3000), ids: 'another queue' }), false);
  assert.equal(albumFinished({ ...sample('playing', 178), duration: NaN }, sample('stopped', 0, 1, 3000)), false);
});
