import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortRackAlbums } from './public/rack-sort.js';
import { albumDate } from './library.mjs';

test('rack orders artists, titles and dates without mutating albums or losing saved styling', () => {
  const style = { background: '#ee0011', foreground: '#ffffff' };
  const albums = [
    { id: 'jarre', artist: 'Jean-Michel Jarre', title: 'The Concerts in China', date: '1982', spineStyle: style },
    { id: 'kraftwerk', artist: 'Kraftwerk', title: 'Trans-Europe Express', date: '1977' },
    { id: 'preview', artist: 'A Preview Artist', title: 'Zebra', date: '' },
    { id: 'other', artist: 'Kraftwerk', title: 'Autobahn', date: '1974' },
  ];
  const ids = mode => sortRackAlbums(albums, mode).map(album => album.id);
  assert.deepEqual(ids('artist'), ['preview', 'jarre', 'other', 'kraftwerk']);
  assert.deepEqual(ids('album'), ['other', 'jarre', 'kraftwerk', 'preview']);
  assert.deepEqual(ids('date'), ['other', 'kraftwerk', 'jarre', 'preview']);
  assert.deepEqual(albums.map(album => album.id), ['jarre', 'kraftwerk', 'preview', 'other']);
  assert.equal(sortRackAlbums(albums, 'date')[2].spineStyle, style);
  assert.equal(albumDate([{ additional: { song_tag: { year: 1982 } } }]), '1982');
  assert.equal(albumDate([{ additional: { song_tag: { year: 0 } } }]), '');
});
