export function wrapAlbum(index, count) {
  return count > 0 ? ((index % count) + count) % count : -1;
}

export function carouselSwipeSteps(delta, coverSize) {
  if (Math.abs(delta) <= 35) return 0;
  const stride = Math.max(55, coverSize * .28);
  return Math.sign(-delta) * Math.min(4, 1 + Math.floor((Math.abs(delta) - 36) / stride));
}

// Projected widths preserve the fatbox ratio while receding from the cover.
export function carouselSpineScale(distance) {
  return [1, 1, .72, .46, .24][Math.min(5, Math.max(1, distance)) - 1];
}

// Unique neighbours: no cloned controls or duplicate albums in small libraries.
export function carouselNeighbours(focus, count, perSide = 5) {
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
