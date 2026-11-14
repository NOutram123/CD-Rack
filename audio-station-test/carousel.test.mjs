import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapAlbum, carouselNeighbours } from './public/carousel.js';

test('circular album indices and unique neighbours handle empty, tiny and large libraries', () => {
  assert.equal(wrapAlbum(0, 0), -1);
  assert.equal(wrapAlbum(-1, 15), 14);
  assert.equal(wrapAlbum(15, 15), 0);
  assert.equal(wrapAlbum(-100, 15), 5);
  for (const count of [0, 1, 2, 3, 4, 15, 97]) {
    for (let focus = 0; focus < Math.max(1, count); focus++) {
      const neighbours = carouselNeighbours(focus, count);
      assert.equal(neighbours.length, Math.min(8, Math.max(0, count - 1)));
      assert.equal(new Set(neighbours.map(item => item.index)).size, neighbours.length);
      assert.ok(neighbours.every(item => item.index >= 0 && item.index < count && item.index !== focus));
    }
  }
});
