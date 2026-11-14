export function readableText(background) {
  const rgb = background.slice(1).match(/../g).map(hex => parseInt(hex, 16) / 255);
  const linear = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}

export function estimateSpineColour(pixels, width, height) {
  const bins = new Map();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    if (pixels[offset + 3] < 128) continue;
    // Cover edges are a better background hint than the central subject or lettering.
    const edge = x < width * .18 || x >= width * .82 || y < height * .18 || y >= height * .82;
    const weight = edge ? 4 : 1;
    const rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    const key = rgb.map(value => Math.floor(value / 32)).join(',');
    const bin = bins.get(key) || { weight: 0, rgb: [0, 0, 0] };
    bin.weight += weight;
    rgb.forEach((value, channel) => { bin.rgb[channel] += value * weight; });
    bins.set(key, bin);
  }
  const winner = [...bins.values()].sort((a, b) => b.weight - a.weight)[0];
  const background = winner ? '#' + winner.rgb.map(value => Math.round(value / winner.weight).toString(16).padStart(2, '0')).join('') : '#eeeeee';
  return { background, foreground: readableText(background) };
}
