import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('volume polling leaves buttons enabled and a tap waits for the read without being lost', async () => {
  const source = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
  const requestFunction = source.slice(source.indexOf('async function volumeRequest('), source.indexOf("byId('open-volume').onclick"));
  const calls = [];
  const renders = [];
  const context = vm.createContext({
    volumeBusy: false, volumeRead: null, volumeDialog: { open: true }, volumeGeneration: 1,
    volumeState: { level: 41 }, device: 'denon',
    byId: () => ({ textContent: '' }),
    api: (endpoint, body) => new Promise(resolve => calls.push({ body, resolve })),
    renderVolume: () => renders.push(context.volumeBusy),
  });
  vm.runInContext(requestFunction, context);
  const poll = context.volumeRequest();
  assert.equal(context.volumeBusy, false, 'background read does not disable buttons');
  await context.volumeRequest();
  assert.equal(calls.length, 1, 'polls do not overlap');
  const adjustment = context.volumeRequest('down');
  assert.equal(context.volumeBusy, true, 'a real command disables duplicate taps');
  assert.equal(calls.length, 1, 'adjustment waits for in-flight poll');
  calls[0].resolve({ level: 41 });
  await poll;
  await Promise.resolve();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.action, 'down');
  calls[1].resolve({ level: 40 });
  await adjustment;
  assert.equal(context.volumeState.level, 40);
  assert.equal(context.volumeBusy, false);
  renders.length = 0;
  const nextPoll = context.volumeRequest();
  calls[2].resolve({ level: 40 });
  await nextPoll;
  assert.ok(renders.every(busy => !busy), 'routine poll never applies a busy appearance');
});
