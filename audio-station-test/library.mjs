import { createHash } from 'node:crypto';

export function albumDate(tracks) {
  return tracks.map(song => String(song.additional?.song_tag?.date || song.additional?.song_tag?.year || ''))
    .filter(date => /^[1-9]\d{3}(?:-\d{2}(?:-\d{2})?)?$/.test(date)).sort()[0] || '';
}

export function sortTracks(songs) {
  return songs.sort((a, b) => {
    const at = a.additional?.song_tag || {};
    const bt = b.additional?.song_tag || {};
    return (parseInt(at.disc) || 1) - (parseInt(bt.disc) || 1)
      || (parseInt(at.track) || 0) - (parseInt(bt.track) || 0)
      || (a.title || '').localeCompare(b.title || '', undefined, { numeric: true });
  });
}

export function caseStyleForFolders(folders) {
  if (folders.length < 2) return 'standard';
  const discs = folders.map(folder => {
    const normal = folder.replaceAll('\\', '/').replace(/\/+$/, '');
    const split = normal.lastIndexOf('/');
    const match = normal.slice(split + 1).match(/^(.+?)(?:,\s*|\s+)(?:disc|disk)\s+([1-9]\d*)$/i);
    return match && { parent: normal.slice(0, split).toLowerCase(), album: match[1].trim().toLowerCase(), number: Number(match[2]) };
  });
  if (discs.some(disc => !disc)) return 'standard';
  const first = discs[0];
  const matching = discs.every(disc => disc.parent === first.parent && disc.album === first.album);
  return matching && new Set(discs.map(disc => disc.number)).size === discs.length ? 'fatbox' : 'standard';
}

function albumArtist(song, tag) {
  if (tag.album_artist?.trim()) return tag.album_artist;
  // Infer compilation ownership only from an explicitly named source container
  // and matching album folder. Keep the original track performer tags intact.
  const parts = (song.path || '').replaceAll('\\', '/').split('/');
  const folder = (parts.at(-2) || '').replace(/(?:,\s*|\s+)(?:disc|disk)\s+[1-9]\d*$/i, '').trim();
  if (/^various artists$/i.test(parts.at(-3) || '')
      && folder.toLowerCase() === (tag.album || '').trim().toLowerCase()) return 'Various Artists';
  return tag.artist || 'Unknown artist';
}

export function buildAlbums(songs) {
  const groups = new Map();
  for (const song of songs) {
    const tag = song.additional?.song_tag || {};
    const name = tag.album || 'Untitled album';
    const artist = albumArtist(song, tag);
    const key = JSON.stringify([name, artist]);
    if (!groups.has(key)) groups.set(key, { id: createHash('sha256').update(key).digest('hex').slice(0, 24), name, artist, tracks: [], folders: new Set() });
    const album = groups.get(key);
    album.tracks.push(song);
    if (song.path) album.folders.add(song.path.replaceAll('\\', '/').replace(/\/[^/]+$/, ''));
  }
  return [...groups.values()].map(album => ({ ...album, tracks: sortTracks(album.tracks), folders: [...album.folders],
    caseStyle: caseStyleForFolders([...album.folders]),
    discCount: new Set(album.tracks.map(song => parseInt(song.additional?.song_tag?.disc) || 1)).size,
    trackCount: album.tracks.length,
    date: albumDate(album.tracks),
  })).sort((a, b) => a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name));
}
