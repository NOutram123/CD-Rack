// Entirely local receiver simulation. This module never uses the network/audio.
export function createDemoPlayer(examples, now = Date.now) {
  const albums = examples.slice(0, 97).map(([name, artist], index) => ({
    id: `demo-${index}`, name, artist, artIndex: index + 4,
    date: String(1975 + index % 50), discCount: index % 13 === 0 ? 3 : 1,
    caseStyle: index % 13 === 0 ? 'fatbox' : 'standard',
    trackCount: index % 13 === 0 ? 12 : 8,
  }));
  const tracks = album => Array.from({ length: album.trackCount }, (_, index) => ({
    id: `${album.id}-track-${index + 1}`, title: `Track ${index + 1} - ${album.name}`,
    additional: { song_tag: { disc: album.discCount > 1 ? Math.floor(index / 4) + 1 : 1, track: album.discCount > 1 ? index % 4 + 1 : index + 1 } },
  }));
  let queue = [], index = 0, state = 'stopped', albumId = null;
  let started = now(), level = 35, restore;
  let continuous = false, order = [], advance, serial = 0;
  function snapshot() {
    if (state === 'playing') {
      const steps = Math.floor((now() - started) / 30000);
      if (steps > 0) {
        index += steps; started += steps * 30000;
        if (index >= queue.length) {
          const current = order.indexOf(albumId);
          const next = continuous && current >= 0 && albums.find(album => album.id === order[(current + 1) % order.length]);
          if (next) {
            albumId = next.id; queue = tracks(next); index = 0; started = now();
            advance = { serial: ++serial, album: albumId };
          } else { index = Math.max(0, queue.length - 1); state = 'stopped'; }
        }
      }
    }
    return { album: albumId, status: { state, index, song: queue[index] }, queue: { current: index, songs: queue }, continuousAdvance: advance };
  }
  return {
    async request(endpoint, data = {}) {
      if (endpoint === 'albums') return albums;
      if (endpoint === 'tracks') {
        const album = albums.find(album => album.id === data.album);
        if (!album) throw Error('Demo album not found.');
        return tracks(album);
      }
      if (endpoint === 'play') {
        const album = albums.find(album => album.id === data.album);
        if (!album) throw Error('Demo album not found.');
        const startIndex = data.startIndex ?? 0;
        if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= album.trackCount) throw Error('Select a track from this album.');
        if (data.continuous !== undefined) continuous = data.continuous;
        if (data.order) order = data.order.filter(id => albums.some(album => album.id === id));
        advance = undefined;
        queue = tracks(album); albumId = album.id; index = startIndex; state = 'playing'; started = now();
        return snapshot();
      }
      if (endpoint === 'control') {
        snapshot();
        if (data.action === 'pause') state = 'paused';
        else if (data.action === 'play' && queue.length) { state = 'playing'; started = now(); }
        else if (['prev', 'next'].includes(data.action) && queue.length) {
          index = Math.max(0, Math.min(queue.length - 1, index + (data.action === 'next' ? 1 : -1)));
          state = 'playing'; started = now();
        }
        return snapshot();
      }
      if (endpoint === 'state') return snapshot();
      if (endpoint === 'continuous') {
        continuous = data.enabled;
        order = data.order.filter(id => albums.some(album => album.id === id));
        return { success: true };
      }
      if (endpoint === 'volume') {
        if (data.action === 'mute') {
          if (level > 0) { restore = level; level = 0; }
          else if (restore !== undefined) { level = restore; restore = undefined; }
        } else if (['up', 'down'].includes(data.action)) {
          level = Math.max(0, Math.min(100, level + (data.action === 'up' ? 1 : -1)));
          if (level > 0) restore = undefined;
        }
        return { level, muted: level === 0, canUnmute: restore !== undefined, name: 'Demo volume' };
      }
      throw Error('This action is unavailable in Demo mode.');
    },
  };
}
