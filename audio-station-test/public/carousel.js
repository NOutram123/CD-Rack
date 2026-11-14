export function wrapAlbum(index, count) {
  return count > 0 ? ((index % count) + count) % count : -1;
}

// Unique neighbours: no cloned controls or duplicate albums in small libraries.
export function carouselNeighbours(focus, count, perSide = 4) {
  const seen = new Set([focus]);
  const neighbours = [];
  for (let distance = 1; distance <= perSide; distance++) {
    for (const side of [1, -1]) {
      const index = wrapAlbum(focus + side * distance, count);
      if (index < 0 || seen.has(index)) continue;
      seen.add(index);
      neighbours.push({ index, side, distance });
    }
  }
  return neighbours;
}
