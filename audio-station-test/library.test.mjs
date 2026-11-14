import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAlbums, caseStyleForFolders } from './library.mjs';

test('a three-disc Various Artists compilation without album-artist tags stays one ordered fatbox', () => {
  const songs = [3, 1, 2].flatMap(disc => [2, 1].map(track => ({
    id: `${disc}-${track}`, title: `Song ${disc}-${track}`,
    path: `/music/Various Artists/The Edge Of The Eighties, Disc ${disc}/${track}.flac`,
    additional: { song_tag: { album: 'The Edge Of The Eighties', album_artist: '', artist: `Performer ${disc}-${track}`, disc, track } },
  })));
  const original = structuredClone(songs);
  const [album, ...others] = buildAlbums(songs);
  assert.equal(others.length, 0);
  assert.equal(album.artist, 'Various Artists');
  assert.equal(album.caseStyle, 'fatbox');
  assert.equal(album.discCount, 3);
  assert.equal(album.trackCount, 6);
  assert.deepEqual(album.tracks.map(track => track.id), ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2']);
  assert.equal(buildAlbums(songs.toReversed())[0].id, album.id);
  assert.deepEqual(songs, original, 'source tracks and their performer tags are unchanged');
});

test('compilation inference respects explicit album artists and unrelated source folders', () => {
  const song = (id, folder, artist, album_artist = '') => ({ id, path: `${folder}/${id}.flac`,
    additional: { song_tag: { album: 'Shared Title', artist, album_artist } } });
  const albums = buildAlbums([
    song('a', '/music/Various Artists/Shared Title', 'Performer A'),
    song('b', '/music/Various Artists/Shared Title', 'Performer B', '  '),
    song('explicit', '/music/Various Artists/Shared Title', 'Performer C', 'Named Ensemble'),
    song('other', '/music/Another Artist/Shared Title', 'Another Artist'),
    song('mismatch', '/music/Various Artists/Unrelated Folder', 'Performer D'),
    song('windows', 'C:\\Music\\Various Artists\\Shared Title Disk 2', 'Performer E'),
  ]);
  assert.equal(albums.length, 4);
  assert.deepEqual(albums.find(album => album.artist === 'Various Artists').tracks.map(t => t.id).sort(), ['a', 'b', 'windows']);
  assert.ok(albums.some(album => album.artist === 'Named Ensemble'));
  assert.ok(albums.some(album => album.artist === 'Another Artist'));
  assert.ok(albums.some(album => album.artist === 'Performer D'));
});

test('groups two disc folders into one fatbox, sorts discs before tracks, and preserves stable IDs', () => {
  const song = (id, artist, album, disc, track, folder) => ({ id, title: id, path: `/volume1/music/${artist}/${folder}/${id}.flac`, additional: { song_tag: { album, album_artist: artist, disc, track } } });
  const songs = [song('b2', 'Jarre', 'China', 2, 2, 'China, Disc 2'), song('a2', 'Jarre', 'China', 1, 2, 'China, Disc 1'), song('b1', 'Jarre', 'China', 2, 1, 'China, Disc 2'), song('a1', 'Jarre', 'China', 1, 1, 'China, Disc 1'), song('single', 'Kraftwerk', 'Express', 1, 1, 'Express'), song('other', 'Someone else', 'China', 1, 1, 'China')];
  const albums = buildAlbums(songs);
  const china = albums.find(album => album.artist === 'Jarre');
  assert.equal(china.caseStyle, 'fatbox');
  assert.equal(china.discCount, 2);
  assert.deepEqual(china.tracks.map(track => track.id), ['a1', 'a2', 'b1', 'b2']);
  assert.equal(albums.find(album => album.artist === 'Kraftwerk').caseStyle, 'standard');
  assert.equal(albums.length, 3, 'same album title by another artist stays separate');
  assert.equal(buildAlbums(songs.toReversed()).find(album => album.artist === 'Jarre').id, china.id);
});

test('Muse albums stay separate and only matching numbered disc folders form a fatbox', () => {
  const song = album => ({ id: album, title: 'Track one', path: `/music/Muse/${album}/01.flac`, additional: { song_tag: { album, album_artist: 'Muse', disc: 1, track: 1 } } });
  const muse = buildAlbums([song('Absolution'), song('Origin of Symmetry')]);
  assert.equal(muse.length, 2);
  assert.ok(muse.every(album => album.caseStyle === 'standard'));
  assert.equal(caseStyleForFolders(['/music/Muse/Absolution', '/music/Muse/Origin of Symmetry']), 'standard');
  assert.equal(caseStyleForFolders(['/music/Jarre/China, Disc 1', '/music/Jarre/China, Disc 2']), 'fatbox');
  assert.equal(caseStyleForFolders(['C:\\Music\\Artist\\Album Disk 1', 'C:\\Music\\Artist\\Album Disk 2', 'C:\\Music\\Artist\\Album Disk 3']), 'fatbox');
  assert.equal(caseStyleForFolders(['/music/Artist/Album Disc 1', '/music/Artist/Other Disc 2']), 'standard');
  assert.equal(caseStyleForFolders(['/music/Artist/Album Disc 1', '/music/Other/Album Disc 2']), 'standard');
  assert.equal(caseStyleForFolders(['/music/Artist/Album Disc 1', '/music/Artist/Album']), 'standard');
  assert.equal(caseStyleForFolders(['/music/Artist/Album Disk 1']), 'standard');
  assert.equal(caseStyleForFolders(['/music/Artist/Album Disc 1', '/music/Artist/Album Disk 1']), 'standard');
});
