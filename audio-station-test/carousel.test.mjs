import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapAlbum, carouselNeighbours, carouselSpineScale, carouselSwipeSteps } from './public/carousel.js';

test('swipe distance advances one to four albums in either direction, scaling with cover size', () => {
  for (const size of [150, 450, 900]) {
    const stride = Math.max(55, size * .28);
    assert.equal(carouselSwipeSteps(30, size), 0);
    assert.equal(carouselSwipeSteps(-36, size), 1);
    for (let count = 1; count <= 4; count++) {
      const distance = 36 + stride * (count - 1) + 1;
      assert.equal(carouselSwipeSteps(-distance, size), count);
      assert.equal(carouselSwipeSteps(distance, size), -count);
    }
    assert.equal(carouselSwipeSteps(-10000, size), 4);
  }
});

test('projected spines recede in five steps on either side and preserve fatbox proportions', () => {
  const widths = [1, 2, 3, 4, 5].map(carouselSpineScale);
  assert.equal(widths[0], 1);
  assert.equal(widths[1], 1);
  assert.ok(widths.every((width, i) => width > 0 && (i < 2 || width < widths[i - 1])));
  for (const { distance } of carouselNeighbours(10, 97)) {
    assert.ok(Math.abs(carouselSpineScale(distance) * 2.25 / carouselSpineScale(distance) - 2.25) < 1e-12);
  }
});

test('circular album indices and unique neighbours handle empty, tiny and large libraries', () => {
  assert.equal(wrapAlbum(0, 0), -1);
  assert.equal(wrapAlbum(-1, 15), 14);
  assert.equal(wrapAlbum(15, 15), 0);
  assert.equal(wrapAlbum(-100, 15), 5);
  for (const count of [0, 1, 2, 3, 4, 15, 97]) {
    for (let focus = 0; focus < Math.max(1, count); focus++) {
      const neighbours = carouselNeighbours(focus, count);
      assert.equal(neighbours.length, Math.min(10, Math.max(0, count - 1)));
      assert.equal(new Set(neighbours.map(item => item.index)).size, neighbours.length);
      assert.ok(neighbours.every(item => item.index >= 0 && item.index < count && item.index !== focus));
    }
  }
});
