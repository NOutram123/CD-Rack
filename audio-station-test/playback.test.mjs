import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

test('Audio Station album playback replaces duplicate queues and keeps track controls bounded', async () => {
  let queue = ['old', 'old', 'old'];
  let current = 0;
  let playback = 'stopped';
  let replacementCalls = 0;
  let libraryScans = 0;
  let volume = 40;
  let position = 0;
  const songs = [1, 2].map(index => ({ id: `music_${index}`, title: `Track ${index}`, path: `/volume1/music/Test Artist/Test Album/${index}.flac`, additional: { song_audio: { duration: 30 }, song_tag: { album: 'Test Album', album_artist: 'Test Artist', track: index, disc: 1 } } }));
  const names = ['SYNO.API.Auth', 'SYNO.AudioStation.Album', 'SYNO.AudioStation.Song', 'SYNO.AudioStation.RemotePlayer'];
  const apis = Object.fromEntries(names.map(name => [name, { path: 'entry.cgi', maxVersion: 3 }]));
  const nas = http.createServer(async (req, res) => {
    const query = new URL(req.url, 'http://localhost');
    let result;
    if (query.pathname === '/webapi/query.cgi') result = { data: apis, success: true };
    else {
      let body = '';
      for await (const chunk of req) body += chunk;
      const params = new URLSearchParams(body);
      const api = params.get('api');
      const method = params.get('method');
      let data = {};
      if (api === 'SYNO.API.Auth') data = { sid: 'test-session-only' };
      if (api === 'SYNO.AudioStation.Album') data = { albums: [{ name: 'music' }], total: 1 };
      if (api === 'SYNO.AudioStation.Song') { libraryScans++; data = { songs, total: 2 }; }
      if (api === 'SYNO.AudioStation.RemotePlayer') {
        if (method === 'list') data = { players: [{ id: 'denon-test', name: 'Denon', type: 'dlna' }] };
        if (method === 'getplaylist') data = { total: Math.min(queue.length, Number(params.get('limit') || queue.length)), current, songs: queue.map(id => songs.find(song => song.id === id) || { id }) };
        if (method === 'getstatus') data = { volume, position, playlist_total: queue.length, index: current, state: playback, song: songs.find(song => song.id === queue[current]) };
        if (method === 'updateplaylist') {
          replacementCalls++;
          queue.splice(Number(params.get('offset')), Number(params.get('limit')), ...params.get('songs').split(','));
          current = 0;
          playback = 'stopped';
        }
        if (method === 'control') {
          if (params.get('action') === 'set_volume') volume = Number(params.get('value'));
          if (params.get('action') === 'pause') playback = 'paused';
          if (params.get('action') === 'play') {
            playback = 'playing';
            if (params.has('value')) current = Number(params.get('value'));
          }
          if (params.get('action') === 'next') current++;
          if (params.get('action') === 'prev') current--;
        }
      }
      result = { data, success: true };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  });
  await new Promise(resolve => nas.listen(0, '127.0.0.1', resolve));
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  let cookie = '';
  async function call(endpoint, body = {}, requestOrigin = origin) {
    const response = await fetch(`${origin}/api/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: requestOrigin, Cookie: cookie }, body: JSON.stringify(body),
    });
    if (response.headers.has('set-cookie')) {
      const header = response.headers.get('set-cookie');
      assert.match(header, /HttpOnly/);
      assert.match(header, /SameSite=Strict/);
      assert.match(header, /Max-Age=2592000/);
      cookie = header.split(';')[0];
    }
    return { status: response.status, data: await response.json() };
  }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { await fetch(origin); ready = true; break; } catch { await delay(50); }
    }
    assert.ok(ready, 'test server starts');
    assert.equal((await call('login', { address: `http://localhost:${nas.address().port}`, account: 'test', password: 'dummy' })).status, 200);
    const albums = (await call('albums')).data;
    assert.equal(albums[0].name, 'Test Album');
    assert.equal(albums[0].caseStyle, 'standard');
    assert.ok(!('tracks' in albums[0]), 'rack payload contains summaries only');
    assert.ok(!('folders' in albums[0]), 'rack does not receive filesystem details');
    await call('albums');
    assert.equal(libraryScans, 1, 'opening the rack again uses the server catalogue');
    await call('albums', { refresh: true });
    assert.equal(libraryScans, 2, 'explicit library refresh rescans Audio Station');
    const colour = await call('spine-colour', { album: albums[0].id, background: '#e1000f' });
    assert.deepEqual(colour.data, { background: '#e1000f', foreground: '#ffffff', source: 'cover-v1' });
    assert.deepEqual((await call('albums')).data[0].spineStyle, colour.data, 'rack summaries reuse the saved colour');
    assert.equal((await call('spine-colour', { album: 'missing', background: '#ffffff' })).status, 400);
    assert.equal((await call('spine-colour', { album: albums[0].id, background: 'red; color:transparent' })).status, 400);
    assert.equal((await call('tracks', { album: albums[0].id })).data.length, 2);
    await call('players');
    const volumeArgs = { player: 'denon-test' };
    assert.equal((await call('volume', volumeArgs)).data.level, 40, 'reads actual volume without changing it');
    volume = 27;
    assert.equal((await call('volume', { ...volumeArgs, action: 'up' })).data.level, 28, 'relative changes read fresh receiver state');
    assert.equal((await call('volume', { ...volumeArgs, action: 'down' })).data.level, 27);
    const beforeVolumeQueue = [...queue];
    assert.equal((await call('volume', { ...volumeArgs, action: 'mute' })).data.level, 0);
    assert.equal((await call('volume', { ...volumeArgs, action: 'mute' })).data.level, 27, 'unmute restores the known previous level');
    assert.deepEqual(queue, beforeVolumeQueue, 'volume never alters the track queue');
    assert.equal(playback, 'stopped', 'volume never starts playback');
    volume = 100;
    assert.equal((await call('volume', { ...volumeArgs, action: 'up' })).data.level, 100);
    volume = 0;
    assert.equal((await call('volume', { ...volumeArgs, action: 'down' })).data.level, 0);
    assert.equal((await call('volume', { ...volumeArgs, action: 'mute' })).status, 400, 'no invented restoration level');
    assert.equal((await call('volume', { ...volumeArgs, action: 'set_volume', value: 99 })).status, 400);
    const play = { player: 'denon-test', album: albums[0].id };
    assert.equal((await call('play', play)).status, 200);
    assert.deepEqual(queue, ['music_1', 'music_2']);
    assert.equal(playback, 'playing', 'explicit Play starts the loaded album');
    assert.equal((await call('state', { player: 'denon-test' })).data.album, albums[0].id, 'Now Playing identifies the shared current album');
    assert.equal((await call('play', play)).status, 200);
    assert.deepEqual(queue, ['music_1', 'music_2'], 'repeated Play album does not duplicate tracks');
    assert.equal(replacementCalls, 2);
    assert.equal((await call('control', { player: 'denon-test', action: 'prev' })).status, 400);
    await call('control', { player: 'denon-test', action: 'next' });
    assert.equal(current, 1);
    assert.equal((await call('control', { player: 'denon-test', action: 'next' })).status, 400);
    await call('control', { player: 'denon-test', action: 'pause' });
    assert.equal(playback, 'paused');
    const activity = JSON.stringify((await call('trace')).data);
    assert.ok(!activity.includes('dummy') && !activity.includes('test-session-only'));
    assert.equal((await call('control', { player: 'denon-test', action: 'play' }, 'https://unrelated.example')).status, 403);
    // NAS-side continuation advances with no browser state polling at all.
    songs.push(...[3, 4].map(index => ({ id: `music_${index}`, title: `Track ${index}`, path: `/volume1/music/Test Artist/Second Album/${index}.flac`, additional: { song_audio: { duration: 30 }, song_tag: { album: 'Second Album', album_artist: 'Test Artist', track: index - 2, disc: 1 } } })));
    const all = (await call('albums', { refresh: true })).data;
    const nextAlbum = all.find(album => album.name === 'Second Album');
    const config = { player: 'denon-test', enabled: true, order: [albums[0].id, 'artwork-preview', nextAlbum.id] };
    playback = 'stopped';
    assert.equal((await call('continuous', config)).status, 200);
    assert.equal(playback, 'stopped', 'enabling never starts a stopped receiver');
    playback = 'playing'; current = 1; position = 29;
    assert.equal((await call('continuous', config)).status, 200);
    playback = 'stopped'; position = 0;
    const beforeAdvance = replacementCalls;
    for (let i = 0; i < 120 && (replacementCalls === beforeAdvance || playback !== 'playing'); i++) await delay(50);
    assert.equal(replacementCalls, beforeAdvance + 1, 'server advances without browser polling');
    assert.deepEqual(queue, ['music_3', 'music_4'], 'next playable album follows browser rack order');
    assert.equal(playback, 'playing');
    await delay(2100);
    assert.equal(replacementCalls, beforeAdvance + 1, 'one completion issues one Play');
    assert.equal((await call('state', { player: 'denon-test' })).data.continuousAdvance.album, nextAlbum.id);
    await call('continuous', { ...config, enabled: false });
    current = 1; position = 29; playback = 'playing';
    await delay(2100);
    playback = 'stopped';
    await delay(2100);
    assert.equal(replacementCalls, beforeAdvance + 1, 'No prevents another album starting');
    playback = 'playing';
    await call('continuous', config);
    await call('control', { player: 'denon-test', action: 'pause' });
    await delay(2100);
    playback = 'stopped';
    await delay(2100);
    assert.equal(replacementCalls, beforeAdvance + 1, 'pause followed by stop never advances');

  } finally {
    child.kill();
    await new Promise(resolve => nas.close(resolve));
  }
});
