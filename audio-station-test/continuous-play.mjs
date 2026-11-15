// Only a recently observed final track reaching its duration can advance an album.
// A paused/stopped receiver, an edited queue, and reconnection never start playback.
export function completionSample({ status, queue }, at = Date.now()) {
  const songs = queue.songs || [];
  const index = Number(status.index ?? queue.current);
  const song = status.song || songs[index];
  return {
    at, state: status.state, index, count: songs.length,
    ids: songs.map(song => song.id).join('\n'),
    position: Number(status.position),
    duration: Number(song?.additional?.song_audio?.duration ?? songs[index]?.additional?.song_audio?.duration),
  };
}

export function albumFinished(previous, current) {
  if (!previous || previous.state !== 'playing' || !['stopped', 'stop'].includes(current.state)) return false;
  const elapsed = (current.at - previous.at) / 1000;
  return previous.count > 0 && previous.index === previous.count - 1
    && previous.ids === current.ids && elapsed >= 0 && elapsed <= 10
    && previous.duration > 0 && Number.isFinite(previous.position)
    && previous.position + elapsed >= previous.duration - 1;
}
