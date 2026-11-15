import { sortRackAlbums } from './rack-sort.js';
import { estimateSpineColour } from './spine-colour.js';
import { demoOnly } from './config.js';
import { createDemoPlayer } from './demo-player.js';
import { wrapAlbum, carouselNeighbours, carouselSpineScale, carouselSwipeSteps } from './carousel.js';
let demoMode = false;
let demoPlayer;
let connectionGeneration = 0;
const pendingRequests = new Set();
const exampleAlbums = [
    ["Low Sun","Juniper Relay"],["Night Swim","Mara Vale"],["Paper Satellites","The Quiet Hours"],
    ["Orchard Static","Glass Antenna"],["Blue Transit","Northbound Trio"],["Soft Voltage","Violet Circuit"],
    ["The Long Way Home","Isla Field"],["Salt Geometry","Tidal Index"],["After the Rain","Lena Moss"],
    ["Small Hours","The Lantern Room"],["Copper Lines","Miles Calder"],["Sunday Signal","Common Air"],
    ["Atlas of Dust","Dune Choir"],["Porcelain City","Mika Ellery"],["Radio Haze","Velvet Beacon"],
    ["Basement Bloom","Ivy Junction"],["Mirror Lake","Pine Archive"],["Late Checkout","Hotel Neon"],
    ["Amber Weather","Wren & Birch"],["Gravity Garden","Orbit Season"],["Borderless","North Meridian"],
    ["Glass Harbour","Edie Rowan"],["Still Life in Stereo","The Colour Office"],["Quiet Engines","Daybreak Assembly"],
    ["Red Horizon","Aster Parade"],["Field Notes","Elliot Creek"],["Parallel Light","Signal Meadow"],
    ["Moth Season","Cinder Atlas"],["April in Mono","Nora Finch"],["Cloud Museum","Sable Air"],
    ["Silver Footsteps","The Night Bureau"],["Vernal Tapes","Willow Service"],["Slow Arcade","Tape District"],
    ["Halflight","Sol Renner"],["High Water Mark","Estuary Club"],["Oblique Hours","Frame Delay"],
    ["Pollen & Wire","Garden Receiver"],["Under Glass","Vera Solis"],["Coastline","Jules Linden"],
    ["Dry Season","Ochre Valley"],["Strange Maps","The Folded Room"],["Off the Grid","Relay Coast"],
    ["Neon Orchard","Satellite Palm"],["Waking the Lake","Anna Bracken"],["North Exit","Linden Exchange"],
    ["Soft Focus","Etta Park"],["Aerial Survey","Mono Vista"],["Last Tram","Echo Passage"],
    ["Deep Blue Motel","Sam Bellweather"],["First Light Again","Hearth Assembly"],
    ["Telescope Weather","Mira Coast"],["West of Morning","The Signal Fires"],["Sundial Letters","Lark Avenue"],
    ["Concrete Lilies","Paloma West"],["Quiet Current","Tern Society"],["Lemon Season","Sylvie Banks"],
    ["Violet Mile","Asphalt Choir"],["Mercury Glass","Ada Finch"],["Borrowed Time","North Loop"],
    ["Contour Lines","Eamon Wells"],["The Green Hour","Luca Heath"],["Room for Rain","Cedar Assembly"],
    ["Islands in Ink","Selene March"],["Fallow Ground","Tess Rowan"],["Bicycle Weather","The Open Windows"],
    ["Black Sand Radio","Dalia North"],["Midnight Postcard","Samira Vale"],["Windswept","The Shorebirds"],
    ["Colour Study","Arlo Reed"],["Last Broadcast","Marconi Lane"],["Still Moving","Saffron Twin"],
    ["Stone Fruit","Holly Street"],["Equinox Drive","Cosmo Way"],["Shore Leave","The Paper Boats"],
    ["Distant Rooms","Milo Ash"],["In Plain Sight","June Meridian"],["Beneath the Viaduct","Concrete Hour"],
    ["Snow on Film","Winter Service"],["Morning Traffic","Transit Circle"],["Unlit Signs","Night Office"],
    ["Tin Roof","Freya Hall"],["Ferry Lights","Harbour Chorus"],["Murmuration","Alba Kite"],
    ["Wild Indigo","Prairie Signal"],["Weathered Edges","Old Telephone"],["Rooms in Blue","Ellis Gray"],
    ["Ceramic Moon","Sophie Morrow"],["Passing Clouds","Cloud Relay"],["Greywater","Owen Alder"],
    ["Turn the Dial","Radio Arcade"],["Second Wind","Avery Low"],["City of Swifts","The Roof Garden"],
    ["Lakeside Cinema","Fable Coast"],["Gold Thread","Kestrel Parade"],["Small Constellations","Nina Wells"],
    ["Afterimage","Mosaic Tide"],["The Orchard Gate","Moss and Stone"],["Silent Crossing","The Glass Road"],
    ["Westward Lights","Orla River"],["End of the Line","The Evening Service"]
  ];
const palettes = [
    ["#be603f","#fdebd2","#f4bd6c"],["#252e54","#fbede0","#a8c1ea"],
    ["#ded1ad","#291f1c","#9b3d49"],["#344e3e","#f4edd0","#c0c77f"],
    ["#295766","#f2f4e0","#e9a86c"],["#59395f","#fff0d9","#e2aebd"],
    ["#be9b57","#271f1a","#384a40"],["#293630","#f5ebd8","#d6a482"],
    ["#b16a6a","#211d25","#f3cdb0"],["#30313b","#f8efdc","#dc9669"]
  ];
let rackAlbums = [];
let buttons = [];
let sortedRacks = new Map();
let activeSort = ['artist', 'album', 'date'].includes(recalled('cd-rack-sort')) ? recalled('cd-rack-sort') : 'artist';
let displayMode = recalled('cd-rack-view') === 'carousel' ? 'carousel' : 'rack';
let continuousPlay = recalled('cd-rack-continuous') !== 'no';
let seenContinuousAdvance = '';
let pendingContinuousAlbum = '';
let carouselQueuedSteps = 0;
let carouselGesture;
let suppressCarouselClickUntil = 0;
const albumTrackCache = new Map();
let nowPlayingAlbumId = '';
const paletteFor = index => index === 0 ? ['#e4c57d', '#28271b', '#f8edcc'] : palettes[(index * 7 + Math.floor(index / 10) * 3) % palettes.length];
function paintAlbum(canvas, index) {
    const ctx = canvas.getContext('2d');
    const { title, artist, artIndex = index } = rackAlbums[index];
    const [base, ink, accent] = paletteFor(artIndex);
    let seed = artIndex + 93;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    function circle(x, y, r, fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 640, 640);
    ctx.save();
    ctx.beginPath();
    ctx.rect(29, 92, 582, 396);
    ctx.clip();
    if (artIndex % 5 === 0) {
      circle(160 + random() * 340, 220 + random() * 100, 106 + random() * 48, accent);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? ink : accent;
        ctx.globalAlpha = .36 + i * .09;
        ctx.beginPath();
        ctx.moveTo(28, 383 + i * 19);
        for (let x = 28; x <= 650; x += 70) ctx.lineTo(x, 292 + i * 31 + random() * 96);
        ctx.lineTo(650, 515);
        ctx.lineTo(28, 515);
        ctx.fill();
      }
    } else if (artIndex % 5 === 1) {
      ctx.translate(315, 285);
      ctx.rotate(random() - .5);
      for (let i = 0; i < 15; i++) {
        const x = random() * 560 - 280;
        const y = random() * 360 - 180;
        ctx.globalAlpha = .42 + random() * .56;
        circle(x, y, 14 + random() * 94, i % 2 ? accent : ink);
      }
    } else if (artIndex % 5 === 2) {
      ctx.translate(320, 286);
      ctx.rotate((random() - .5) * 1.6);
      for (let i = 0; i < 12; i++) {
        ctx.strokeStyle = i % 3 ? ink : accent;
        ctx.lineWidth = 2 + random() * 10;
        const size = 28 + i * 40;
        ctx.strokeRect(-size / 2, -size / 2, size, size);
      }
    } else if (artIndex % 5 === 3) {
      for (let i = 0; i < 29; i++) {
        ctx.strokeStyle = i % 3 ? accent : ink;
        ctx.globalAlpha = .45 + random() * .55;
        ctx.lineWidth = 1 + random() * 7;
        ctx.beginPath();
        ctx.moveTo(31, 95 + i * 14);
        ctx.bezierCurveTo(188, i * 14 - 135, 390, i * 14 + 377, 610, 104 + i * 14);
        ctx.stroke();
      }
    } else {
      for (let i = 0; i < 32; i++) {
        const x = 28 + i * 19;
        const height = 45 + random() * 350;
        ctx.fillStyle = i % 3 ? accent : ink;
        ctx.globalAlpha = .45 + random() * .55;
        ctx.fillRect(x, 487 - height, 4 + random() * 14, height);
      }
    }
    ctx.restore();
    ctx.globalAlpha = .17;
    for (let i = 0; i < 4200; i++) {
      ctx.fillStyle = i % 2 ? ink : base;
      ctx.fillRect(random() * 640, random() * 640, 1 + random() * 2, 1);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(29, 92, 582, 396);
    ctx.fillStyle = ink;
    ctx.font = "22px monospace";
    ctx.fillText(artist.toUpperCase(), 29, 65, 530);
    ctx.font = (index % 2 ? "italic " : "bold ") + "61px Georgia";
    ctx.fillText(title, 29, 559, 582);
    canvas.setAttribute("aria-label", "Cover artwork for " + title + " by " + artist);
  }

const byId = id => document.getElementById(id);
const rack = byId('rack');
const popup = byId('album');
const volumeDialog = byId('volume-dialog');
let volumeBusy = false;
let volumeRead = null;
let volumeState;
let volumeGeneration = 0;
const cover = byId('cover');
let connected = false;
let selected = -1;
let selectionVersion = 0;
let busy = false;
let polling = false;
let playback;
let selectedTracks = [];
let trackIds = [];
let tapTime = 0;
let drag;
let dragged = false;
let address = '';
let discoveredDevices = [];

let scrollTimer;
let device = '';

function message(text, error = false) {
  const target = byId(connected && !byId('library').hidden ? 'message' : 'connection-message');
  target.textContent = error || !connected ? text : '';
  if (error) { byId('error-text').textContent = text; if (!byId('error-dialog').open) byId('error-dialog').showModal(); }
  target.classList.toggle('error', error);
}

function showLogin(text) {
  // Hidden modal dialogs still make the rest of the document inert.
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  connected = false;
  selectionVersion++;
  selected = -1;
  playback = undefined;
  selectedTracks = [];
  trackIds = [];
  popup.hidden = true;
  byId('library').hidden = true;
  byId('connection').hidden = false;
  if (byId('login')) byId('login').hidden = false;
  byId('output-setup').hidden = true;
  message(text);
}

async function api(path, data = {}) {
  if (demoMode) return demoPlayer.request(path, data);
  if (demoOnly) throw Error('NAS connections are unavailable in this public demo.');
  const controller = new AbortController();
  const generation = connectionGeneration;
  pendingRequests.add(controller);
  let response;
  try {
    response = await fetch('/api/' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      signal: controller.signal,
    });
  } catch {
    throw Error('The local music service is unavailable. Start it again, then reconnect.');
  } finally {
    pendingRequests.delete(controller);
  }
  const result = await response.json();
  if (generation !== connectionGeneration) throw Error('Connection mode changed.');
  if (!response.ok) {
    if (response.status === 401 && connected) showLogin('Your session ended. Please sign in again.');
    throw Error(result.error || 'The NAS request failed.');
  }
  return result;
}

function remember(key, value) {
  try { localStorage.setItem(demoMode ? 'demo-' + key : key, value); } catch { /* Storage is optional. */ }
}
function recalled(key) {
  try { return localStorage.getItem(demoMode ? 'demo-' + key : key); } catch { return null; }
}

function resetMode() {
  carouselQueuedSteps = 0;
  carouselGesture = undefined;
  connectionGeneration++;
  for (const request of pendingRequests) request.abort();
  pendingRequests.clear();
  showLogin('');
  albumTrackCache.clear();
  nowPlayingAlbumId = '';
  seenContinuousAdvance = '';
  pendingContinuousAlbum = '';
  device = '';
  busy = false;
  polling = false;
}

function updateMode() {
  document.body.classList.toggle('demo-mode', demoMode);
  byId('demo-banner').hidden = !demoMode;
  byId('exit-demo').hidden = !demoMode;
  byId('change-output').hidden = demoMode;
  activeSort = ['artist', 'album', 'date'].includes(recalled('cd-rack-sort')) ? recalled('cd-rack-sort') : 'artist';
  byId('sort-by').value = activeSort;
  displayMode = recalled('cd-rack-view') === 'carousel' ? 'carousel' : 'rack';
  continuousPlay = recalled('cd-rack-continuous') !== 'no';
  renderSettingToggles();
}

async function enterDemo() {
  resetMode();
  demoMode = true;
  demoPlayer = createDemoPlayer(exampleAlbums);
  connected = true;
  updateMode();
  await loadLibrary();
  device = 'demo-player';
  await syncContinuousPlay();
  byId('output-label').textContent = 'Demo amplifier - simulated, no sound';
  byId('nas-label').textContent = 'Demo mode - local sample albums. No NAS connection.';
  byId('connection').hidden = true;
  byId('library').hidden = false;
  resizeRack();
  rack.scrollLeft = (Number(recalled('cd-rack-place')) || 0) * ((buttons[0]?.offsetWidth || 1) + 2);
  await applyDisplayMode(true);
}
byId('demo-button').onclick = () => enterDemo().catch(error => message(error.message, true));
byId('exit-demo').onclick = () => {
  resetMode();
  demoMode = false;
  demoPlayer = undefined;
  updateMode();
  startup().catch(error => showLogin(error.message));
};

async function discover() {
  const result = await api('discover');
  const devices = result.devices;
  discoveredDevices = devices;
  byId('discovered').replaceChildren(...devices.map(item => new Option(item.name + ' — ' + item.address, item.address)));
  byId('discovered').hidden = devices.length < 2;
  byId('discovered-label').hidden = devices.length < 2;
  if (devices.length) {
    byId('address').value = devices[0].address;
    address = devices[0].address;
  }
  updateTransport();
  return devices;
}

function updateTransport() {
  byId('transport').textContent = byId('address').value.startsWith('http:')
    ? 'This NAS connection uses HTTP over your home network. Your password is used to sign in and is never saved by this app.'
    : 'Your NAS HTTPS certificate must be trusted by the local service.';
}

async function loadDevices(devices) {
  const players = devices || await api('players');
  const remembered = recalled('cd-rack-device');
  byId('players').replaceChildren(new Option('Choose an output device', ''), ...players.map(player => new Option(player.name || player.title || player.id, player.id)));
  const choice = players.find(player => player.id === remembered)
    || players.find(player => /denon/i.test(player.name || '') && /dlna|upnp/i.test(player.type || ''));
  if (choice) byId('players').value = choice.id;
  byId('open-rack').disabled = !byId('players').value;
}

function showOutputs() {
  closeAlbum(false);
  byId('library').hidden = true;
  byId('connection').hidden = false;
  byId('login').hidden = true;
  byId('output-setup').hidden = false;
  message('Connected to Audio Station.');
}

async function openRack() {
  await loadLibrary();
  device = byId('players').value;
  if (!device) return;
  remember('cd-rack-device', device);
  remember('cd-rack-ready', 'yes');
  await syncContinuousPlay();
  playback = undefined;
  selectedTracks = [];
  trackIds = [];
  byId('connection').hidden = true;
  byId('library').hidden = false;
  if (byId('settings').open) byId('settings').close();
  byId('device-label').textContent = byId('players').selectedOptions[0].textContent;
  const nas = discoveredDevices.find(item => item.address === address);
  byId('nas-label').textContent = (nas?.name ? nas.name + ' · ' : 'NAS · ') + (address || 'Connected');
  byId('output-label').textContent = byId('players').selectedOptions[0].textContent;
  message('');
  resizeRack();
  rack.scrollLeft = (Number(recalled('cd-rack-place')) || 0) * ((buttons[0]?.offsetWidth || 1) + 2);
  await applyDisplayMode(true);
}

function ownsQueue() {
  const songs = playback?.queue.songs || [];
  return trackIds.length > 0 && songs.length === trackIds.length
    && songs.every((song, index) => song.id === trackIds[index]);
}

function renderControls() {
  const live = rackAlbums[selected]?.playable;
  byId('controls').hidden = !live;
  byId('volume-trigger').hidden = !live;
  byId('open-volume').disabled = busy || !connected || !device;
  if (!live) {
    byId('track').textContent = 'Artwork preview';
    return;
  }
  const loaded = ownsQueue();
  const index = Number(playback?.status.index ?? playback?.queue.current ?? -1);
  const playing = loaded && playback?.status.state === 'playing';
  byId('toggle').textContent = playing ? 'Pause' : 'Play';
  byId('toggle').disabled = busy || !connected || !device || !selectedTracks.length;
  byId('previous').disabled = busy || !loaded || index <= 0;
  byId('next').disabled = busy || !loaded || index < 0 || index >= selectedTracks.length - 1;
  const current = loaded ? playback?.status.song || playback?.queue.songs?.[index] : undefined;
  byId('track').textContent = current?.title || selectedTracks[0]?.title || 'Loading tracks…';
  byId('playback-label').textContent = loaded
    ? (playing ? 'Playing' : playback?.status.state === 'stopped' ? 'Stopped' : 'Paused') + ' · ' + (current?.title || '')
    : '';
}

function positionAlbum() {
  if (displayMode === 'carousel') { layoutCarousel(); return; }
  if (selected < 0) return;
  const shelf = rack.getBoundingClientRect();
  const spine = buttons[selected].getBoundingClientRect();
  const stage = byId('deck').getBoundingClientRect();
  const width = popup.getBoundingClientRect().width;
  const centered = spine.left + spine.width / 2 - width / 2;
  popup.style.left = Math.max(shelf.left, Math.min(centered, shelf.right - width)) - stage.left + 'px';
}

async function selectAlbum(index) {
  if (volumeDialog.open || busy || index === selected) return;
  if (rackAlbums[index].settings) { byId('settings').showModal(); return; }
  if (rackAlbums[index].nowPlaying) {
    try {
      const state = await api('state', { player: device });
      const songId = state.status.song?.id || state.queue.songs?.[Number(state.status.index ?? state.queue.current)]?.id;
      const match = [...albumTrackCache].find(([, tracks]) => tracks.some(track => track.id === songId));
      nowPlayingAlbumId = state.album || match?.[0] || nowPlayingAlbumId;
      const target = rackAlbums.findIndex(album => album.id === nowPlayingAlbumId);
      if (target < 0) { message('Open an album and press Play first.', true); return; }
      if (displayMode === 'carousel') {
        rack.scrollLeft = 0;
        if (selected === target) { layoutCarousel(); return; }
      } else {
        buttons[target].scrollIntoView({ block: 'nearest', inline: 'center' });
        if (selected === target) return;
      }
      return selectAlbum(target);
    } catch (error) { message(error.message, true); return; }
  }
  if (selected >= 0) buttons[selected].setAttribute('aria-pressed', 'false');
  selected = index;
  if (displayMode === 'carousel') {
    remember('cd-carousel-album', rackAlbums[index].id);
    layoutCarousel();
    popup.animate?.([{ opacity: .55 }, { opacity: 1 }], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180 });
  }
  const version = ++selectionVersion;
  tapTime = 0;
  buttons[index].setAttribute('aria-pressed', 'true');
  const fallback = byId('art');
  const loading = byId('artwork-loading');
  const art = byId('real-art');
  art.hidden = true;
  art.onload = art.onerror = null;
  art.removeAttribute('src');
  fallback.hidden = true;
  loading.hidden = true;
  if (rackAlbums[index].playable && !demoMode) {
    loading.hidden = false;
    art.onload = () => {
      if (selected !== index || version !== selectionVersion) return;
      loading.hidden = true;
      art.hidden = false;
    };
    art.onerror = () => {
      if (selected !== index || version !== selectionVersion) return;
      loading.hidden = true;
      art.hidden = true;
      paintAlbum(fallback, index);
      fallback.hidden = false;
    };
    art.alt = 'Cover artwork for ' + rackAlbums[index].title;
    art.src = '/api/artwork?album=' + encodeURIComponent(rackAlbums[index].id) + (displayMode === 'carousel' ? '&size=512' : '');
  } else {
    paintAlbum(fallback, index);
    fallback.hidden = false;
  }
  popup.hidden = false;
  positionAlbum();
  cover.focus({ preventScroll: true });
  playback = undefined;
  selectedTracks = [];
  trackIds = [];
  byId('playback-label').textContent = '';
  renderControls();
  message('');
  if (!rackAlbums[index].playable) return;
  busy = true;
  renderControls();
  try {
    const albumId = rackAlbums[index].id;
    const tracks = albumTrackCache.get(albumId) || await api('tracks', { album: albumId });
    if (version !== selectionVersion || !connected) return;
    albumTrackCache.set(albumId, tracks);
    selectedTracks = tracks;
    trackIds = tracks.map(track => track.id);
    await poll();
  } catch (error) { message(error.message, true); }
  finally { busy = false; renderControls(); flushCarouselNavigation(); }
}

function layoutCarousel() {
  if (displayMode !== 'carousel') return;
  const count = rackAlbums.length - 2;
  const stage = byId('deck').getBoundingClientRect();
  const neighbours = carouselNeighbours(selected - 2, count, 5);
  const sideWidths = [-1, 1].map(side => neighbours.filter(item => item.side === side)
    .reduce((sum, item) => sum + carouselSpineScale(item.distance) / 12 * (rackAlbums[item.index + 2].caseStyle === 'fatbox' ? 2.25 : 1), 0));
  const size = Math.max(40, Math.min((rack.clientWidth - 180) / (1 + 2 * Math.max(...sideWidths)), stage.height - 50));
  byId('deck').style.setProperty('--carousel-cover-size', size + 'px');
  const visible = new Set(neighbours.map(item => item.index + 2));
  buttons.forEach((button, index) => { button.hidden = index >= 2 && !visible.has(index); });
  for (const side of [-1, 1]) {
    let edge = size / 2 + 14;
    for (const neighbour of neighbours.filter(item => item.side === side)) {
      const index = neighbour.index + 2;
      const width = size / 12 * (rackAlbums[index].caseStyle === 'fatbox' ? 2.25 : 1) * carouselSpineScale(neighbour.distance);
      const x = side * (edge + width / 2);
      buttons[index].style.width = width + 'px';
      // Hide lettering once a panel cannot contain the vertical text's width.
      const panelWidth = rackAlbums[index].caseStyle === 'fatbox' ? width / 2.25 : width;
      buttons[index].classList.toggle('unlabelled', panelWidth < Math.max(9, Math.min(size / 27, 16)) + 6);
      buttons[index].style.transform = `translate(calc(-50% + ${x}px), -50%)`;
      buttons[index].style.zIndex = String(10 - neighbour.distance);
      edge += width + 5;
    }
    byId('deck').style.setProperty(side < 0 ? '--carousel-left-arrow' : '--carousel-right-arrow', (edge + (side < 0 ? 47 : 5)) + 'px');
  }
  byId('carousel-left').disabled = count < 2;
  byId('carousel-right').disabled = count < 2;
}

async function applyDisplayMode(preferPlaying = false) {
  const carousel = displayMode === 'carousel';
  document.body.classList.toggle('carousel-mode', carousel);
  renderSettingToggles();
  for (const id of ['carousel-left', 'carousel-right']) byId(id).hidden = !carousel;
  if (!carousel) {
    buttons.forEach(button => { button.hidden = false; button.style.transform = ''; button.style.zIndex = ''; button.style.width = ''; button.classList.remove('unlabelled'); });
    popup.style.left = '';
    positionAlbum();
    if (selected >= 2) buttons[selected].scrollIntoView({ block: 'nearest', inline: 'center' });
    return;
  }
  rack.scrollLeft = 0;
  let target = selected >= 2 ? selected : rackAlbums.findIndex(album => album.id === recalled('cd-carousel-album'));
  if (target < 2 && preferPlaying && device && connected) {
    const generation = connectionGeneration;
    const version = selectionVersion;
    try {
      const state = await api('state', { player: device });
      if (generation !== connectionGeneration || version !== selectionVersion || displayMode !== 'carousel') return;
      nowPlayingAlbumId = state.album || nowPlayingAlbumId;
    } catch { /* Browsing remains available if the receiver is unavailable. */ }
  }
  if (target < 2) target = rackAlbums.findIndex(album => album.id === nowPlayingAlbumId && album.playable);
  if (target < 2 && rackAlbums.length > 2) target = 2;
  if (target >= 2 && target !== selected) await selectAlbum(target);
  layoutCarousel();
}

async function moveCarousel(step) {
  if (displayMode !== 'carousel' || volumeDialog.open || byId('settings').open || rackAlbums.length < 4) return;
  if (busy) { carouselQueuedSteps += step; return; }
  await selectAlbum(wrapAlbum(selected - 2 + step, rackAlbums.length - 2) + 2);
}
function flushCarouselNavigation() {
  if (!carouselQueuedSteps) return;
  const steps = carouselQueuedSteps;
  carouselQueuedSteps = 0;
  void moveCarousel(steps);
}
function renderSettingToggles() {
  byId('view-rack').setAttribute('aria-pressed', String(displayMode === 'rack'));
  byId('view-carousel').setAttribute('aria-pressed', String(displayMode === 'carousel'));
  byId('continuous-yes').setAttribute('aria-pressed', String(continuousPlay));
  byId('continuous-no').setAttribute('aria-pressed', String(!continuousPlay));
}
async function setDisplayMode(mode) {
  if (volumeDialog.open || busy) return;
  displayMode = mode;
  remember('cd-rack-view', displayMode);
  await applyDisplayMode(true);
}
byId('view-rack').onclick = () => setDisplayMode('rack');
byId('view-carousel').onclick = () => setDisplayMode('carousel');
function continuousOptions() {
  return { enabled: continuousPlay, order: rackAlbums.filter(album => album.playable).map(album => album.id) };
}
async function syncContinuousPlay() {
  if (connected && device) await api('continuous', { player: device, ...continuousOptions() });
}
async function setContinuousPlay(enabled) {
  if (volumeDialog.open || busy) return;
  const previous = continuousPlay;
  continuousPlay = enabled;
  renderSettingToggles();
  try {
    await syncContinuousPlay();
    remember('cd-rack-continuous', enabled ? 'yes' : 'no');
  } catch (error) { continuousPlay = previous; renderSettingToggles(); message(error.message, true); }
}
byId('continuous-yes').onclick = () => setContinuousPlay(true);
byId('continuous-no').onclick = () => setContinuousPlay(false);
renderSettingToggles();
byId('carousel-left').onclick = () => moveCarousel(-1);
byId('carousel-right').onclick = () => moveCarousel(1);

const deck = byId('deck');
deck.addEventListener('pointerdown', event => {
  if (displayMode !== 'carousel' || volumeDialog.open || byId('settings').open
      || (event.button !== undefined && event.button !== 0)
      || event.target.closest('#transport-row, .carousel-arrow, #pinned-tools')) return;
  carouselGesture = { x: event.clientX, y: event.clientY, id: event.pointerId, dragging: false };
});
deck.addEventListener('pointermove', event => {
  if (!carouselGesture || event.pointerId !== carouselGesture.id) return;
  const dx = event.clientX - carouselGesture.x;
  const dy = event.clientY - carouselGesture.y;
  if (!carouselGesture.dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
    carouselGesture.dragging = true;
    deck.setPointerCapture?.(event.pointerId);
  }
  if (carouselGesture.dragging) {
    event.preventDefault();
  }
});
function endCarouselGesture(event) {
  if (!carouselGesture || event.pointerId !== carouselGesture.id) return;
  const gesture = carouselGesture;
  carouselGesture = undefined;
  if (gesture.dragging) {
    suppressCarouselClickUntil = performance.now() + 350;
    const steps = carouselSwipeSteps(event.clientX - gesture.x, cover.getBoundingClientRect().width);
    if (event.type === 'pointerup' && steps) void moveCarousel(steps);
  }
}
deck.addEventListener('pointerup', endCarouselGesture);
deck.addEventListener('pointercancel', endCarouselGesture);
deck.addEventListener('lostpointercapture', endCarouselGesture);
deck.addEventListener('dragstart', event => { if (displayMode === 'carousel') event.preventDefault(); });

function closeAlbum(focus = true) {
  if (volumeDialog.open) return;
  if (selected < 0) return;
  const previous = selected;
  buttons[previous].setAttribute('aria-pressed', 'false');
  selected = -1;
  selectionVersion++;
  popup.hidden = true;
  byId('playback-label').textContent = '';
  message('');
  if (focus) buttons[previous].focus({ preventScroll: true });
}

let colourQueue = Promise.resolve();
const colourObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    colourObserver.unobserve(entry.target);
    const index = buttons.indexOf(entry.target);
    const album = rackAlbums[index];
    const button = entry.target;
    if (demoMode || !album?.playable || album.spineStyle) continue;
    // One visible jacket at a time; do not delay rack rendering or fetch every cover.
    colourQueue = colourQueue.catch(() => {}).then(async () => {
      if (demoMode || !button.isConnected || !connected || album.spineStyle) return;
      const image = new Image();
      image.src = '/api/artwork?album=' + encodeURIComponent(album.id) + '&size=512';
      await image.decode();
      if (demoMode || !button.isConnected || !connected) return;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 40;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, 40, 40);
      const estimate = estimateSpineColour(context.getImageData(0, 0, 40, 40).data, 40, 40);
      const style = await api('spine-colour', { album: album.id, background: estimate.background });
      album.spineStyle = style;
      if (!button.isConnected) return;
      button.style.setProperty('--jacket', style.background);
      button.style.setProperty('--letter', style.foreground);
      button.style.setProperty('--jacket-accent', style.background);
    }).catch(() => { /* Keep the existing jacket if artwork is unavailable. */ });
  }
}, { root: rack, rootMargin: '80px' });

async function loadLibrary(refresh = false) {
  const albums = await api('albums', { refresh });
  closeAlbum(false);
  if (refresh) albumTrackCache.clear();
  const albumsToSort = [
    ...albums.map((album, index) => ({ ...album, title: album.name, playable: true, artIndex: album.artIndex ?? index + 2 })),
  ];
  byId('empty-library').hidden = albums.length > 0;
  sortedRacks = new Map(['artist', 'album', 'date'].map(sort => [sort, sortRackAlbums(albumsToSort, sort)]));
  renderRack();
}

function renderRack() {
  rackAlbums = [
    { title: 'Settings', artist: 'Home Music', settings: true, artIndex: 0 },
    { title: 'Now Playing', artist: 'Home Music', nowPlaying: true, artIndex: 1 },
    ...(sortedRacks.get(activeSort) || []),
  ];
  buttons = rackAlbums.map((album, index) => {
    const fallback = paletteFor(album.artIndex ?? index);
    const jacket = album.spineStyle?.background || fallback[0];
    const letter = album.spineStyle?.foreground || fallback[1];
    const accent = jacket;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'spine' + (album.playable ? ' live' : '') + (album.caseStyle === 'fatbox' ? ' fatbox' : '');
    button.style.setProperty('--jacket', jacket);
    button.style.setProperty('--letter', letter);
    button.style.setProperty('--jacket-accent', accent);
    button.setAttribute('aria-label', album.title + ' by ' + album.artist + (album.playable ? ', playable' : ', artwork preview') + (album.caseStyle === 'fatbox' ? ', fatbox' : ''));
    button.setAttribute('aria-pressed', 'false');
    const mark = document.createElement('i');
    mark.setAttribute('aria-hidden', 'true');
    const title = document.createElement('strong');
    title.textContent = album.playable && album.caseStyle !== 'fatbox' ? album.artist + ' · ' + album.title : album.title;
    if (album.caseStyle === 'fatbox') {
      const artist = document.createElement('strong');
      artist.className = 'artist-panel';
      artist.textContent = album.artist;
      const separator = document.createElement('span');
      separator.className = 'case-centre';
      separator.setAttribute('aria-hidden', 'true');
      button.append(artist, separator, title);
    } else button.append(mark, title);
    button.addEventListener('click', event => {
      if (displayMode === 'carousel' && performance.now() < suppressCarouselClickUntil) return;
      // Pinned utilities sit outside the draggable shelf and cannot be its drag's click.
      if (event.detail < 2 && (album.settings || album.nowPlaying || !dragged || event.detail === 0)) selectAlbum(index);
    });
    return button;
  });
  byId('pinned-tools').replaceChildren(...buttons.slice(0, 2));
  rack.replaceChildren(...buttons.slice(2));
  colourObserver.disconnect();
  buttons.forEach((button, index) => {
    if (!demoMode && rackAlbums[index].playable && !rackAlbums[index].spineStyle) colourObserver.observe(button);
  });
}

async function poll() {
  if (volumeDialog.open || !connected || !device || polling || byId('library').hidden) return;
  polling = true;
  const version = selectionVersion;
  const requestedDevice = device;
  try {
    const result = await api('state', { player: requestedDevice });
    if (version !== selectionVersion || requestedDevice !== device || !connected) return;
    playback = result;
    const lastPlaying = ownsQueue();
    if (result.album) nowPlayingAlbumId = result.album;
    else if (lastPlaying) nowPlayingAlbumId = rackAlbums[selected].id;
    buttons[1].classList.toggle('active-player', Boolean(nowPlayingAlbumId));
    if (result.continuousAdvance && String(result.continuousAdvance.serial) !== seenContinuousAdvance) {
      seenContinuousAdvance = String(result.continuousAdvance.serial);
      pendingContinuousAlbum = result.continuousAdvance.album;
    }

    renderControls();
  } catch (error) {
    if (version === selectionVersion) {
      playback = undefined;
      message(error.message, true);
      byId('playback-label').textContent = 'Connection lost';
    }
  } finally { polling = false; renderControls(); }
  if (pendingContinuousAlbum && !busy && !volumeDialog.open && !byId('settings').open) {
    const target = rackAlbums.findIndex(album => album.id === pendingContinuousAlbum);
    pendingContinuousAlbum = '';
    if (target >= 2 && target !== selected) {
      if (displayMode === 'rack') buttons[target].scrollIntoView({ block: 'nearest', inline: 'center' });
      await selectAlbum(target);
    }
  }
}

async function command(action) {
  if (volumeDialog.open || busy || !rackAlbums[selected]?.playable || !connected || !selectedTracks.length) return;
  busy = true;
  renderControls();
  try {
    if (action === 'toggle') {
      if (!ownsQueue() || playback?.status.state === 'stopped') {
        await api('play', { album: rackAlbums[selected].id, player: device, continuous: continuousPlay, order: continuousOptions().order });
      } else {
        await api('control', { player: device, action: playback.status.state === 'playing' ? 'pause' : 'play' });
      }
    } else {
      await api('control', { player: device, action });
    }
    await syncContinuousPlay();
    message('');
    await poll();
  } catch (error) { message(error.message, true); }
  finally { busy = false; renderControls(); flushCarouselNavigation(); }
}
function positionVolume() {
  if (!volumeDialog.open) return;
  const bounds = cover.getBoundingClientRect();
  volumeDialog.style.left = Math.max(8, Math.min(bounds.left + bounds.width / 2 - volumeDialog.offsetWidth / 2, innerWidth - volumeDialog.offsetWidth - 8)) + 'px';
  volumeDialog.style.top = Math.max(8, Math.min(bounds.top + bounds.height / 2 - volumeDialog.offsetHeight / 2, innerHeight - volumeDialog.offsetHeight - 8)) + 'px';
}
function renderVolume() {
  const known = Number.isFinite(volumeState?.level);
  byId('volume-level').textContent = known ? String(volumeState.level) : '...';
  byId('volume-down').disabled = volumeBusy || !known || volumeState.level <= 0;
  byId('volume-up').disabled = volumeBusy || !known || volumeState.level >= 100;
  byId('volume-mute').textContent = volumeState?.muted ? 'Unmute' : 'Mute';
  byId('volume-mute').setAttribute('aria-pressed', String(Boolean(volumeState?.muted)));
  byId('volume-mute').disabled = volumeBusy || !known || (volumeState.muted && !volumeState.canUnmute);
  positionVolume();
}
async function volumeRequest(action) {
  if (volumeBusy || !volumeDialog.open || (!action && volumeRead)) return;
  const generation = volumeGeneration;
  let request;
  if (action) {
    volumeBusy = true;
    renderVolume();
  }
  try {
    // Keep buttons usable during polling. A tap waits for the active read,
    // then sends its command without racing the receiver's shared lock.
    if (action && volumeRead) await volumeRead.catch(() => {});
    if (generation !== volumeGeneration || !volumeDialog.open) return;
    request = api('volume', { player: device, ...(action ? { action } : {}) });
    if (!action) volumeRead = request;
    const state = await request;
    if (generation !== volumeGeneration || !volumeDialog.open) return;
    volumeState = state;
    byId('volume-error').textContent = '';
  } catch (error) {
    if (generation === volumeGeneration && volumeDialog.open) {
      volumeState = undefined;
      byId('volume-error').textContent = error.message;
    }
  } finally {
    if (volumeRead === request) volumeRead = null;
    if (action) volumeBusy = false;
    if (generation === volumeGeneration) renderVolume();
  }
}
byId('open-volume').onclick = async event => {
  event.stopPropagation();
  if (busy || !connected || !device || volumeDialog.open) return;
  volumeGeneration++;
  volumeState = undefined;
  byId('volume-error').textContent = '';
  byId('volume-name').textContent = byId('output-label').textContent.replace(/\s*\([^)]*\)/g, '').replace(/AVR-.*/i, '').trim() || 'Volume';
  byId('open-volume').setAttribute('aria-expanded', 'true');
  byId('volume-shade').hidden = false;
  tapTime = 0;
  volumeDialog.showModal();
  renderVolume();
  byId('close-volume').focus({ preventScroll: true });
  await volumeRequest();
};
byId('close-volume').onclick = event => { event.stopPropagation(); volumeDialog.close(); };
volumeDialog.addEventListener('close', () => {
  volumeGeneration++;
  byId('volume-shade').hidden = true;
  byId('open-volume').setAttribute('aria-expanded', 'false');
  tapTime = 0;
});
volumeDialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); volumeDialog.close(); });
volumeDialog.addEventListener('keydown', event => event.stopPropagation());
volumeDialog.addEventListener('click', event => event.stopPropagation());
volumeDialog.addEventListener('dblclick', event => event.stopPropagation());
byId('volume-down').onclick = () => volumeRequest('down');
byId('volume-up').onclick = () => volumeRequest('up');
byId('volume-mute').onclick = () => volumeRequest('mute');
setInterval(() => { if (volumeDialog.open) volumeRequest(); }, 1500);
addEventListener('resize', positionVolume);
window.visualViewport?.addEventListener('resize', positionVolume);

byId('toggle').onclick = () => command('toggle');
byId('previous').onclick = () => command('prev');
byId('next').onclick = () => command('next');

rack.addEventListener('wheel', event => {
  if (displayMode === 'carousel') return;
  if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  const amount = event.deltaY * (event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? rack.clientWidth : 1);
  if ((amount < 0 && rack.scrollLeft <= 0) || (amount > 0 && rack.scrollLeft >= rack.scrollWidth - rack.clientWidth - 1)) return;
  event.preventDefault();
  rack.scrollLeft += amount;
}, { passive: false });
rack.addEventListener('pointerdown', event => {
  dragged = false;
  if (displayMode === 'carousel') return;
  if (event.pointerType === 'mouse' && event.button === 0) drag = { x: event.clientX, left: rack.scrollLeft };
});
rack.addEventListener('pointermove', event => {
  if (!drag || event.buttons !== 1) return;
  if (Math.abs(event.clientX - drag.x) > 5) dragged = true;
  if (dragged) rack.scrollLeft = drag.left + drag.x - event.clientX;
});
for (const event of ['pointerup', 'pointerleave', 'pointercancel']) rack.addEventListener(event, () => { drag = undefined; });
rack.addEventListener('scroll', positionAlbum, { passive: true });
new ResizeObserver(positionAlbum).observe(byId('deck'));
cover.addEventListener('click', event => {
  if (displayMode === 'carousel') return;
  const now = performance.now();
  if (event.detail === 0 || (tapTime && now - tapTime < 450)) closeAlbum();
  tapTime = now;
});
document.addEventListener('keydown', event => {
  if (volumeDialog.open || byId('settings').open) return;
  if (displayMode === 'carousel' && !byId('library').hidden && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault(); void moveCarousel(event.key === 'ArrowLeft' ? -1 : 1);
  } else if (event.key === 'Escape' && displayMode !== 'carousel') closeAlbum();
});

byId('players').onchange = () => { byId('open-rack').disabled = !byId('players').value; };
byId('open-rack').onclick = () => openRack().catch(error => message(error.message, true));
byId('refresh-players').onclick = async () => {
  try { await loadDevices(); message('Output devices refreshed.'); } catch (error) { message(error.message, true); }
};
byId('settings-button').onclick = () => byId('settings').showModal();
byId('close-settings').onclick = () => byId('settings').close();
byId('sort-by').value = activeSort;
byId('refresh-rack').onclick = async () => {
  if (busy) return;
  const button = byId('refresh-rack');
  const previousSort = activeSort;
  const requestedSort = byId('sort-by').value;
  button.disabled = true;
  button.textContent = 'Refreshing...';
  try {
    activeSort = requestedSort;
    await loadLibrary(true);
    await syncContinuousPlay();
    remember('cd-rack-sort', activeSort);
    clearTimeout(scrollTimer);
    remember('cd-rack-place', '0');
    rack.scrollLeft = 0;
    resizeRack();
    byId('settings').close();
    await applyDisplayMode();
  } catch (error) {
    activeSort = previousSort;
    message(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Refresh Rack';
  }
};
byId('change-output').onclick = async () => {
  byId('settings').close();
  showOutputs();
  try { await loadDevices(); } catch (error) { message(error.message, true); }
};
if (!demoOnly) {
byId('discover').onclick = async () => {
  byId('discover').disabled = true;
  try {
    message('Looking for your NAS…');
    const devices = await discover();
    message(devices.length ? 'NAS found. Sign in to continue.' : 'No NAS responded. Enter its hostname or current address.');
  } catch (error) { message(error.message, true); }
  finally { byId('discover').disabled = false; }
};
byId('address').oninput = updateTransport;
byId('discovered').onchange = () => { byId('address').value = byId('discovered').value; updateTransport(); };
byId('login').onsubmit = async event => {
  event.preventDefault();
  if (byId('sign-in').disabled) return;
  byId('sign-in').disabled = true;
  byId('demo-button').disabled = true;
  const password = byId('password').value;
  const otp = byId('otp').value;
  byId('password').value = '';
  byId('otp').value = '';
  try {
    message('Connecting to Audio Station…');
    const connection = await api('login', { address: byId('address').value, account: byId('account').value, password, otp });
    address = connection.address;
    await loadDevices();
    connected = true;
    if (recalled('cd-rack-ready') && byId('players').value) await openRack(); else showOutputs();
  } catch (error) { message(error.message, true); }
  finally { byId('sign-in').disabled = false; byId('demo-button').disabled = false; }
};
}

setInterval(() => { if (!busy) poll(); }, 2500);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

async function startup() {
  const generation = connectionGeneration;
  if (demoOnly) {
    showLogin('Explore the CD rack with sample albums and silent simulated controls.');
    return;
  }
  // Load compact album summaries before opening the shelf; tracks and artwork are lazy.
  const [discovery, session] = await Promise.allSettled([discover(), api('players')]);
  if (demoMode || generation !== connectionGeneration) return;
  if (session.status === 'fulfilled') {
    connected = true;
    await loadDevices(session.value);
    if (recalled('cd-rack-ready') && byId('players').value) await openRack(); else showOutputs();
  } else {
    showLogin(discovery.status === 'fulfilled' && discovery.value.length
      ? 'NAS found. Sign in to open your CD rack.'
      : 'Enter your NAS hostname or current address to connect.');
  }
}
startup().catch(error => { showLogin(error.message); });


function resizeRack() {
  const place = rack.scrollLeft / ((buttons[0]?.offsetWidth || 1) + 2);
  const scale = Number(recalled('cd-rack-size')) || 1;
  const view = window.visualViewport;
  const width = view?.width || innerWidth;
  const height = view?.height || innerHeight;
  const baseHeight = Math.max(width / 4, Math.min(height, 480));
  const rackHeight = Math.min(height, baseHeight * scale);
  byId('deck').style.setProperty('--rack-height', rackHeight + 'px');
  rack.scrollLeft = place * ((buttons[0]?.offsetWidth || 1) + 2);
  byId('display-size').value = String(scale);
  positionAlbum();
}
byId('display-size').oninput = () => { remember('cd-rack-size', byId('display-size').value); resizeRack(); };
rack.addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(() => remember('cd-rack-place', String(rack.scrollLeft / ((buttons[0]?.offsetWidth || 1) + 2))), 150); }, { passive: true });
addEventListener('resize', resizeRack);
window.visualViewport?.addEventListener('resize', resizeRack);
byId('error-close').onclick = () => byId('error-dialog').close();
byId('error-settings').onclick = () => { byId('error-dialog').close(); if (connected) byId('settings').showModal(); };
resizeRack();
