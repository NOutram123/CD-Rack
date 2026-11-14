const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const compare = (a, b) => collator.compare(a || '', b || '');

export function sortRackAlbums(albums, sortBy = 'artist') {
  return [...albums].sort((a, b) => {
    const titleA = a.title || a.name;
    const titleB = b.title || b.name;
    if (sortBy === 'album') return compare(titleA, titleB) || compare(a.artist, b.artist);
    if (sortBy === 'date') {
      // Partial dates sort naturally, oldest first; undated previews/albums follow.
      const dateOrder = a.date && b.date ? compare(a.date, b.date) : a.date ? -1 : b.date ? 1 : 0;
      if (dateOrder) return dateOrder;
    }
    return compare(a.artist, b.artist) || compare(titleA, titleB);
  });
}
