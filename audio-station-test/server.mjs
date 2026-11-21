import http from 'node:http';
import dgram from 'node:dgram';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, realpath, mkdir, writeFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildAlbums, albumDate } from './library.mjs';
import { readableText } from './public/spine-colour.js';
import { homedir, hostname, networkInterfaces } from 'node:os';
import { sessionCookie, sessionExpired, maintainSessions } from './session-policy.mjs';
import { artworkThumbnail } from './artwork-thumbnail.mjs';
import { completionSample, albumFinished } from './continuous-play.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const port = Number(process.env.PORT || 8787);
const bindAddress = process.env.BIND_ADDRESS || '127.0.0.1';
const origin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin : `http://localhost:${port}`;
const fixedOrigin = Boolean(process.env.PUBLIC_ORIGIN);
const nasLocal = process.env.NAS_LOCAL === 'true';
const extraHosts = (process.env.ALLOWED_HOSTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
function localAddresses() {
  return Object.values(networkInterfaces()).flat().filter(item => item.family === 'IPv4' && !item.internal).map(item => item.address);
}
function requestOrigin(req) {
  let target;
  try { target = new URL(`http://${req.headers.host}`); } catch { throw new ApiError('Invalid host.', 403); }
  const allowed = ['localhost', '127.0.0.1', hostname().toLowerCase(), `${hostname().toLowerCase()}.local`, ...extraHosts, ...localAddresses()];
  if (fixedOrigin) {
    if (target.host.toLowerCase() !== new URL(origin).host.toLowerCase()) throw new ApiError('Use the configured app address.', 403);
    return origin;
  }
  if (!allowed.includes(target.hostname.toLowerCase()) || target.port !== String(port)) throw new ApiError('Use this server’s LAN address or configured hostname.', 403);
  return target.origin;
}
const sessions = new Map();
const playerLocks = new Set();
const continuousPlayers = new Map();
let continuousSerial = 0;
async function claimPlayerLock(key) {
  const deadline = Date.now() + 30000;
  while (playerLocks.has(key)) {
    if (Date.now() > deadline) throw new ApiError('The receiver is still busy. Try again.', 409);
    await delay(25);
  }
  playerLocks.add(key);
}
const mutedVolumes = new Map();
const nasCandidates = new Map();
const catalogues = new Map();
const spineStyles = new Map();
const spineWrites = new Map();
const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/config.js': ['config.js', 'text/javascript; charset=utf-8'],
  '/demo-player.js': ['demo-player.js', 'text/javascript; charset=utf-8'],
  '/carousel.js': ['carousel.js', 'text/javascript; charset=utf-8'],
  '/spine-colour.js': ['spine-colour.js', 'text/javascript; charset=utf-8'],
  '/rack-sort.js': ['rack-sort.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
};

class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function trace(session, api, method, result) {
  session.trace.unshift({ time: new Date().toISOString(), api, method, result });
  session.trace.length = Math.min(session.trace.length, 30);
}

async function discover() {
  nasCandidates.clear();
  // On the NAS itself its current interface addresses do not require multicast discovery.
  if (nasLocal) return { devices: localAddresses().map(address => ({ address: `http://${address}:5000`, name: hostname() })), responses: 0 };
  const socket = dgram.createSocket('udp4');
  const locations = new Set();
  await new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); socket.close(); resolve(); };
    const timer = setTimeout(finish, 2800);
    socket.on('error', finish);
    socket.on('message', (message) => {
      const location = message.toString().match(/^location:\s*(.+)$/im)?.[1].trim();
      if (location) locations.add(location);
    });
    socket.bind(0, () => socket.send(Buffer.from([
      'M-SEARCH * HTTP/1.1', 'HOST: 239.255.255.250:1900',
      'MAN: "ssdp:discover"', 'MX: 2',
      'ST: urn:schemas-upnp-org:device:MediaServer:1', '', '',
    ].join('\r\n')), 1900, '239.255.255.250'));
  });
  const found = await Promise.allSettled([...locations].map(async (location) => {
    const response = await fetch(location, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    const xml = await response.text();
    if (!/<manufacturer>[^<]*Synology/i.test(xml)) return;
    const url = new URL(location);
    const address = `${url.protocol}//${url.hostname}:5000`;
    const name = xml.match(/<friendlyName>([^<]+)</i)?.[1] || url.hostname;
    nasCandidates.set(address, { address, name });
  }));
  // Failed descriptors do not discard other successfully discovered devices.
  return { devices: [...nasCandidates.values()], responses: found.length };
}

function validateNas(address) {
  let url;
  try { url = new URL(address); } catch { throw new ApiError('Enter a local NAS address including http:// and the DSM port, usually 5000.'); }
  const host = url.hostname.toLowerCase();
  const local = /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local') || /^[a-z0-9_-]+$/.test(host);
  if (!local || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new ApiError('Enter a local NAS address, such as http://YourNASName.local:5000.');
  }
  return url.origin;
}

function nasApiAddress(address) {
  const url = new URL(address);
  // DSM advertises mDNS to LAN clients but its Node resolver need not resolve it.
  // Only rewrite this NAS's own HTTP hostname; remote NASes and HTTPS retain their
  // supplied host and certificate checks. Loopback also survives DHCP changes.
  const ownNames = [hostname().toLowerCase(), `${hostname().toLowerCase()}.local`, ...localAddresses()];
  if (nasLocal && url.protocol === 'http:' && ownNames.includes(url.hostname.toLowerCase())) url.hostname = '127.0.0.1';
  return url.origin;
}

async function request(session, api, method, params = {}, authenticated = true) {
  const info = session.apis[api];
  if (!info) throw new ApiError(`The NAS does not advertise ${api}.`);
  const form = new URLSearchParams({ api, method, version: String(Math.min(info.maxVersion, api === 'SYNO.API.Auth' ? 6 : 3)), ...params });
  if (authenticated) form.set('_sid', session.sid);
  let result;
  try {
    const response = await fetch(`${session.address}/webapi/${info.path}`, {
      method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    result = await response.json();
  } catch {
    trace(session, api, method, 'Connection failed');
    throw new ApiError('NAS request failed. A playback command may already have taken effect. Check Audio Station before retrying. Rediscover and sign in if its address changed.', 502);
  }
  if (!result || typeof result !== 'object' || typeof result.success !== 'boolean') {
    trace(session, api, method, 'Invalid API response');
    throw new ApiError(`Audio Station returned an invalid response to ${method}. Check that Audio Station and the selected output are available.`, 502);
  }
  trace(session, api, method, result.success ? 'Success' : `API error ${result.error?.code}`);
  if (!result.success) {
    const code = result.error?.code;
    const hint = code === 403 && api === 'SYNO.API.Auth' ? ' Enter your verification code if two-factor authentication is enabled.' : '';
    throw new ApiError(`${api} ${method} returned error ${code}.${hint}`, [106, 107, 119].includes(code) ? 401 : 400);
  }
  session.nasUsed = Date.now();
  return result.data || {};
}

async function allItems(session, api, key, params = {}) {
  const items = [];
  for (let offset = 0; ; offset += 200) {
    const data = await request(session, api, 'list', { library: 'all', offset, limit: 200, ...params });
    const batch = data[key] || [];
    items.push(...batch);
    if (!batch.length || items.length >= Number(data.total ?? Infinity) || batch.length < 200) return items;
  }
}

async function loadAlbums(session, refresh = false) {
  const key = createHash('sha256').update(JSON.stringify([nasLocal ? 'local' : session.address, session.account])).digest('hex');
  const directory = process.env.CATALOGUE_DIR || (nasLocal ? path.join(homedir(), 'home-music', 'catalogue') : '');
  session.catalogueKey = key;
  session.catalogueDirectory = directory;
  let cached = catalogues.get(key);
  if (!cached && directory && !refresh) {
    try { cached = JSON.parse(await readFile(path.join(directory, key + '.json'), 'utf8')); } catch {}
  }
  if (refresh || !cached || cached.version !== 3 || Date.now() - cached.time > 86400000) {
    // Coalesce simultaneous browser scans for the same NAS account.
    if (!cached?.pending) {
      const pending = (async () => {
        const songs = await allItems(session, 'SYNO.AudioStation.Song', 'songs', { additional: 'song_tag,song_audio', sort_by: 'title', sort_direction: 'ASC' });
        const next = { version: 3, time: Date.now(), albums: buildAlbums(songs) };
        if (directory) {
          await mkdir(directory, { recursive: true, mode: 0o700 });
          const file = path.join(directory, key + '.json');
          await writeFile(file + '.tmp', JSON.stringify(next), { mode: 0o600 });
          await rename(file + '.tmp', file);
        }
        catalogues.set(key, next);
        return next;
      })();
      catalogues.set(key, { pending });
      try { cached = await pending; } catch (error) { catalogues.delete(key); throw error; }
    } else cached = await cached.pending;
  } else if (cached.pending) cached = await cached.pending;
  session.albums = cached.albums;
  const styles = await stylesFor(session);
  return session.albums.map(({ tracks, folders, ...album }) => ({ ...album, date: album.date || albumDate(tracks), spineStyle: styles[album.id] || null }));
}

async function stylesFor(session) {
  const key = session.catalogueKey;
  if (!spineStyles.has(key)) {
    let styles = {};
    if (session.catalogueDirectory) {
      try { styles = JSON.parse(await readFile(path.join(session.catalogueDirectory, key + '-spines.json'), 'utf8')); } catch {}
    }
    spineStyles.set(key, styles);
  }
  return spineStyles.get(key);
}

async function saveSpineStyle(session, albumId, background) {
  if (!session.albums?.some(album => album.id === albumId) || !/^#[0-9a-f]{6}$/i.test(background || '')) throw new ApiError('Invalid album colour.');
  const key = session.catalogueKey;
  const pending = (spineWrites.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const styles = await stylesFor(session);
    const style = styles[albumId] || { background: background.toLowerCase(), foreground: readableText(background), source: 'cover-v1' };
    styles[albumId] = style;
    if (session.catalogueDirectory) {
      await mkdir(session.catalogueDirectory, { recursive: true, mode: 0o700 });
      const file = path.join(session.catalogueDirectory, key + '-spines.json');
      await writeFile(file + '.tmp', JSON.stringify(styles), { mode: 0o600 });
      await rename(file + '.tmp', file);
    }
    return style;
  });
  spineWrites.set(key, pending);
  return pending;
}

async function tracksFor(session, id) {
  const album = session.albums?.find(item => item.id === id);
  if (!album) throw new ApiError('Refresh the library and select an album.');
  return album.tracks;
}

async function artworkFor(session, id, thumbnail = false) {
  const album = session.albums?.find(item => item.id === id);
  if (!album) throw new ApiError('Album not found.', 404);
  const root = await realpath(process.env.MUSIC_ROOT || (nasLocal ? '/volume1/music' : '//YourNASName/music'));
  for (const folder of album.folders) {
    const relative = folder.replace(/^.*?\/music(?:\/|$)/i, '');
    if (relative === folder) continue;
    for (const file of ['Folder.jpg', 'folder.jpg', 'cover.jpg', 'Cover.jpg', 'folder.png', 'cover.png']) {
      try {
        const target = await realpath(path.join(root, relative, file));
        if (!target.startsWith(root + path.sep)) continue;
        const info = await stat(target);
        if (info.size > 10 * 1024 * 1024) continue;
        if (thumbnail && session.catalogueDirectory) {
          const result = await artworkThumbnail(target, info, path.join(session.catalogueDirectory, 'artwork', session.catalogueKey));
          if (result) return result;
        }
        const data = await readFile(target);
        return { data, type: file.endsWith('.png') ? 'image/png' : 'image/jpeg' };
      } catch { /* Missing artwork falls back to the generated jacket. */ }
    }
  }
  throw new ApiError('No cover artwork found.', 404);
}

async function playersFor(session) {
  const data = await request(session, 'SYNO.AudioStation.RemotePlayer', 'list', { type: 'all', additional: 'subplayer_list' });
  session.players = data.players || [];
  return session.players;
}

function assertPlayer(session, id) {
  if (!session.players?.some(player => player.id === id)) throw new ApiError('Select a discovered playback device first.');
}

async function playbackState(session, id) {
  assertPlayer(session, id);
  const status = await request(session, 'SYNO.AudioStation.RemotePlayer', 'getstatus', { id, additional: 'song_tag,song_audio' });
  const queue = await request(session, 'SYNO.AudioStation.RemotePlayer', 'getplaylist', { id, offset: 0, limit: 1000, additional: 'song_tag,song_audio' });
  const current = status.song?.id || queue.songs?.[Number(status.index ?? queue.current)]?.id;
  const album = session.albums?.find(item => item.tracks.some(song => song.id === current));
  return { status, queue, album: album?.id || null };
}

async function startAlbum(session, player, album, startIndex = 0) {
  const tracks = await tracksFor(session, album);
  if (!tracks.length) throw new ApiError('This album has no tracks.');
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= tracks.length) throw new ApiError('Select a track from this album.');
  const status = await request(session, 'SYNO.AudioStation.RemotePlayer', 'getstatus', { id: player });
  // Some versions report the requested page size as getplaylist.total.
  // Use the renderer's full count, with a full-list fallback for older APIs.
  let total = Number(status.playlist_total);
  if (!Number.isInteger(total) || total < 0) {
    const queue = await request(session, 'SYNO.AudioStation.RemotePlayer', 'getplaylist', { id: player, offset: 0, limit: 100000 });
    total = Number(queue.total);
  }
  if (!Number.isInteger(total) || total < 0) throw new ApiError('Could not determine the existing queue length.');
  await request(session, 'SYNO.AudioStation.RemotePlayer', 'updateplaylist', {
    id: player, library: 'all', offset: 0, limit: total, updated_index: -1,
    songs: tracks.map(song => song.id).join(','), containers_json: '[]', play: 'false',
  });
  const confirmed = await request(session, 'SYNO.AudioStation.RemotePlayer', 'getplaylist', { id: player, offset: 0, limit: tracks.length });
  if (!Array.isArray(confirmed.songs) || confirmed.songs.length !== tracks.length
      || !confirmed.songs.every((song, index) => song.id === tracks[index].id)) {
    throw new ApiError('Audio Station did not confirm the selected album queue. Playback was not started.', 502);
  }
  await request(session, 'SYNO.AudioStation.RemotePlayer', 'control', { id: player, action: 'play', value: startIndex });
  return tracks;
}

function continuousOrder(session, order) {
  if (!Array.isArray(order) || order.length > 50000 || order.some(id => typeof id !== 'string')) throw new ApiError('Invalid continuous album order.');
  const available = new Set((session.albums || []).filter(album => album.trackCount > 0).map(album => album.id));
  return [...new Set(order)].filter(id => available.has(id));
}

async function configureContinuous(session, player, enabled, order) {
  assertPlayer(session, player);
  const key = `${session.address}|${player}`;
  await claimPlayerLock(key);
  try {
    if (!enabled) { continuousPlayers.delete(key); return; }
    const ordered = continuousOrder(session, order);
    const existing = continuousPlayers.get(key);
    if (existing?.session === session) { existing.order = ordered; return; }
    // A preference change or rack opening never adopts an existing receiver queue.
    // Only an explicit Play/track command may arm album continuation.
  } finally { playerLocks.delete(key); }
}

async function advanceContinuousPlayers() {
  await Promise.all([...continuousPlayers].map(async ([key, plan]) => {
    if (playerLocks.has(key)) return;
    if (sessionExpired(plan.session) || ![...sessions.values()].includes(plan.session)) { continuousPlayers.delete(key); return; }
    playerLocks.add(key);
    try {
      const state = await playbackState(plan.session, plan.player);
      const current = completionSample(state);
      if (current.ids !== plan.previous.ids || (state.album && state.album !== plan.album)) {
        continuousPlayers.delete(key); return;
      }
      if (albumFinished(plan.previous, current)) {
        const index = plan.order.indexOf(plan.album);
        if (index < 0 || !plan.order.length) { continuousPlayers.delete(key); return; }
        const album = plan.order[(index + 1) % plan.order.length];
        // Claim the transition before issuing any command; failures are not retried.
        continuousPlayers.delete(key);
        const tracks = await startAlbum(plan.session, plan.player, album);
        plan.album = album;
        plan.advance = { serial: ++continuousSerial, album };
        plan.previous = completionSample({ status: { state: 'playing', index: 0, position: 0, song: tracks[0] }, queue: { songs: tracks } });
        continuousPlayers.set(key, plan);
      } else {
        plan.previous = current;
        if (['stopped', 'stop', 'pause', 'paused'].includes(current.state)) continuousPlayers.delete(key);
      }
    } catch {
      continuousPlayers.delete(key);
      // An ambiguous network failure must never issue the same Play twice.
    } finally { playerLocks.delete(key); }
  }));
}

async function readVolume(session, id) {
  assertPlayer(session, id);
  const player = session.players.find(player => player.id === id);
  if ([false, 0, 'false'].includes(player.support_set_volume)) throw new ApiError('This output does not support volume control.');
  const status = await request(session, 'SYNO.AudioStation.RemotePlayer', 'getstatus', { id });
  const level = Number(status.volume);
  if (status.volume === null || status.volume === undefined || status.volume === '' || !Number.isFinite(level) || level < 0 || level > 100) throw new ApiError('The receiver did not report its current volume.', 502);
  const key = `${session.address}|${id}`;
  if (level > 0) mutedVolumes.delete(key);
  return { level, muted: level === 0, canUnmute: mutedVolumes.has(key), name: player.name || 'Volume' };
}

async function changeVolume(session, id, action) {
  assertPlayer(session, id);
  if (action && !['up', 'down', 'mute'].includes(action)) throw new ApiError('Unsupported volume action.');
  const key = `${session.address}|${id}`;
  await claimPlayerLock(key);
  try {
    const current = await readVolume(session, id);
    if (!action) return current;
    let level;
    if (action === 'mute') {
      if (current.level > 0) { mutedVolumes.set(key, current.level); level = 0; }
      else {
        level = mutedVolumes.get(key);
        if (level === undefined) throw new ApiError('Previous volume is unknown. Use + to raise the level from zero.');
      }
    } else level = Math.max(0, Math.min(100, current.level + (action === 'up' ? 1 : -1)));
    if (level !== current.level) await request(session, 'SYNO.AudioStation.RemotePlayer', 'control', { id, action: 'set_volume', value: level });
    // Read back the actual receiver state; never report a requested value as confirmed.
    return await readVolume(session, id);
  } finally { playerLocks.delete(key); }
}

async function bodyOf(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 16384) throw new ApiError('Request too large.', 413);
  }
  return text ? JSON.parse(text) : {};
}

function reply(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

async function route(req, res) {
  const expectedOrigin = requestOrigin(req);
  const url = new URL(req.url, expectedOrigin);
  if (req.method === 'GET' && url.pathname === '/health') return reply(res, 200, { ok: true, release: process.env.RELEASE_ID || 'development' });
  if (req.method === 'GET' && staticFiles[url.pathname]) {
    const [file, type] = staticFiles[url.pathname];
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    return res.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
  }
  const artworkRequest = req.method === 'GET' && url.pathname === '/api/artwork';
  if (!artworkRequest && (req.method !== 'POST' || req.headers.origin !== expectedOrigin || !req.headers['content-type']?.startsWith('application/json'))) throw new ApiError('Unsupported request.', 403);
  const body = artworkRequest ? {} : await bodyOf(req);
  if (url.pathname === '/api/discover') return reply(res, 200, await discover());
  if (url.pathname === '/api/login') {
    const address = validateNas(body.address);
    const apiAddress = nasApiAddress(address);
    let discovery;
    try {
      const response = await fetch(`${apiAddress}/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query&query=SYNO.API.Auth,SYNO.AudioStation.Album,SYNO.AudioStation.Song,SYNO.AudioStation.RemotePlayer`, { signal: AbortSignal.timeout(6000), redirect: 'error' });
      if (!response.ok) throw Error('NAS API discovery failed');
      discovery = await response.json();
    } catch {
      throw new ApiError('Could not reach the Audio Station login service. Check the NAS address and DSM port (usually 5000 for HTTP or 5001 for HTTPS), then try Find NAS.', 502);
    }
    if (!discovery.success) throw new ApiError('Could not discover the NAS APIs.');
    const session = { address: apiAddress, account: String(body.account), apis: discovery.data, trace: [], used: Date.now() };
    const auth = await request(session, 'SYNO.API.Auth', 'login', {
      account: body.account, passwd: body.password, otp_code: body.otp || '', session: 'AudioStation', format: 'sid',
    }, false);
    session.sid = auth.sid;
    if (!session.sid) throw new ApiError('The NAS did not return an authenticated session.');
    const token = randomBytes(32).toString('hex');
    sessions.set(token, session);
    return reply(res, 200, { address, apis: session.apis }, { 'Set-Cookie': sessionCookie(token, expectedOrigin.startsWith('https:')) });
  }
  const token = req.headers.cookie?.match(/(?:^|;\s*)audio_test=([a-f0-9]{64})/)?.[1];
  const session = sessions.get(token);
  if (!session || sessionExpired(session)) {
    sessions.delete(token);
    throw new ApiError('Sign in to Audio Station first.', 401);
  }
  session.used = Date.now();
  res.setHeader('Set-Cookie', sessionCookie(token, expectedOrigin.startsWith('https:')));
  if (artworkRequest) {
    const art = await artworkFor(session, url.searchParams.get('album'), url.searchParams.get('size') === '512');
    res.writeHead(200, { 'Content-Type': art.type, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    return res.end(art.data);
  }
  if (url.pathname === '/api/logout') {
    sessions.delete(token);
    await request(session, 'SYNO.API.Auth', 'logout', { session: 'AudioStation' }).catch(() => {});
    return reply(res, 200, {}, { 'Set-Cookie': 'audio_test=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  if (url.pathname === '/api/trace') return reply(res, 200, session.trace);
  if (url.pathname === '/api/albums') return reply(res, 200, await loadAlbums(session, body.refresh === true));
  if (url.pathname === '/api/spine-colour') return reply(res, 200, await saveSpineStyle(session, body.album, body.background));
  if (url.pathname === '/api/tracks') return reply(res, 200, await tracksFor(session, body.album));
  if (url.pathname === '/api/players') return reply(res, 200, await playersFor(session));
  if (url.pathname === '/api/state') {
    const state = await playbackState(session, body.player);
    state.continuousAdvance = continuousPlayers.get(`${session.address}|${body.player}`)?.advance;
    return reply(res, 200, state);
  }
  if (url.pathname === '/api/continuous') {
    if (typeof body.enabled !== 'boolean') throw new ApiError('Choose Yes or No for continuous play.');
    await configureContinuous(session, body.player, body.enabled, body.order);
    return reply(res, 200, { success: true });
  }
  if (url.pathname === '/api/volume') return reply(res, 200, await changeVolume(session, body.player, body.action));
  if (!['/api/play', '/api/control'].includes(url.pathname)) throw new ApiError('Unknown endpoint.', 404);
  assertPlayer(session, body.player);
  const lock = `${session.address}|${body.player}`;
  await claimPlayerLock(lock);
  try {
    if (url.pathname === '/api/play') {
      const order = body.continuous === true ? continuousOrder(session, body.order) : [];
      continuousPlayers.delete(lock);
      const startIndex = body.startIndex ?? 0;
      const tracks = await startAlbum(session, body.player, body.album, startIndex);
      if (body.continuous === true) {
        continuousPlayers.set(lock, { session, player: body.player, album: body.album, order,
          previous: completionSample({ status: { state: 'playing', index: startIndex, position: 0, song: tracks[startIndex] }, queue: { songs: tracks } }) });
      }
    } else {
      if (!['play', 'pause', 'prev', 'next'].includes(body.action)) throw new ApiError('Unsupported playback action.');
      if (['prev', 'next'].includes(body.action)) {
        const { status, queue } = await playbackState(session, body.player);
        const index = Number(status.index ?? queue.current);
        if (!Number.isInteger(index) || index < 0 || (body.action === 'prev' && index === 0) || (body.action === 'next' && index >= queue.total - 1)) throw new ApiError('You have reached the end of this album.');
      }
      if (body.action === 'pause') continuousPlayers.delete(lock);
      await request(session, 'SYNO.AudioStation.RemotePlayer', 'control', { id: body.player, action: body.action });
      const plan = continuousPlayers.get(lock);
      if (plan) plan.previous = { ...plan.previous, state: 'command' };
      if (body.action !== 'pause' && body.continuous === true && body.album) {
        const order = continuousOrder(session, body.order);
        const tracks = await tracksFor(session, body.album);
        const state = await playbackState(session, body.player);
        if (state.status.state === 'playing' && state.queue.songs?.length === tracks.length
            && state.queue.songs.every((song, index) => song.id === tracks[index].id)) {
          continuousPlayers.set(lock, { session, player: body.player, album: body.album, order, previous: completionSample(state) });
        }
      }
    }
    return reply(res, 200, { success: true });
  } finally { playerLocks.delete(lock); }
}

const server = http.createServer((req, res) => {
  route(req, res).catch(error => {
    const endpoint = String(req.url || '').split('?')[0];
    const reference = randomBytes(4).toString('hex');
    // Never log request bodies, cookies, credentials, API results or error messages
    // (JSON parse errors can include part of the offending request body).
    if (!error.status || error.status >= 500) console.error(JSON.stringify({ time: new Date().toISOString(), event: 'request-failed', endpoint,
      reference, type: error.name, code: error.code || error.cause?.code,
      frames: String(error.stack || '').split('\n').filter(line => /^\s+at /.test(line)).slice(0, 4) }));
    const operations = { '/api/login': 'signing in', '/api/players': 'finding output devices', '/api/albums': 'loading the album catalogue', '/api/continuous': 'preparing continuous play', '/api/state': 'reading receiver status' };
    reply(res, error.status || 500, { error: error.status ? error.message : `An internal error occurred while ${operations[endpoint] || 'handling this request'}. Reference: ${reference}.` });
  });
});
server.listen(port, bindAddress, () => console.log(`Home Music is listening on ${bindAddress}:${port}${fixedOrigin ? ` (${origin})` : ''}`));
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  // A stalled browser/NAS request must not leave deployment waiting forever.
  setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 5000).unref();
});
setInterval(() => {
  void maintainSessions(sessions, session => request(session, 'SYNO.AudioStation.Song', 'list', { library: 'all', offset: 0, limit: 1 }));
}, 60000).unref();

setInterval(() => { void advanceContinuousPlayers(); }, 2000).unref();
