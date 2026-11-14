import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateSpineColour, readableText } from './public/spine-colour.js';

test('cover background sampling favours red edges over a black central subject', () => {
  const pixels = new Uint8ClampedArray(40 * 40 * 4);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const centre = x > 6 && x < 33 && y > 6 && y < 33;
    pixels.set(centre ? [0, 0, 0, 255] : [225, 0, 15, 255], (y * 40 + x) * 4);
  }
  assert.deepEqual(estimateSpineColour(pixels, 40, 40), { background: '#e1000f', foreground: '#ffffff' });
  assert.equal(readableText('#ffffff'), '#000000');
  assert.equal(readableText('#111111'), '#ffffff');
  assert.equal(readableText('#ffff00'), '#000000');
});
