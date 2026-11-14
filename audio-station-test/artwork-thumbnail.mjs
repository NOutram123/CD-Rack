import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const exec = promisify(execFile);
const pending = new Map();

export async function artworkThumbnail(source, info, directory, convert = '/usr/bin/convert', run = exec) {
  const key = createHash('sha256').update(JSON.stringify(['512-v1', source, info.size, info.mtimeMs])).digest('hex');
  const file = path.join(directory, key + '.jpg');
  if (pending.has(file)) return pending.get(file);
  const task = (async () => {
    try { return { data: await readFile(file), type: 'image/jpeg' }; } catch {}
    // No shell: source paths are already authenticated and realpath-checked by
    // artworkFor. On development hosts without convert, retain the cover fallback.
    let result;
    try {
      result = await run(convert, ['-limit', 'memory', '64MiB', '-limit', 'map', '128MiB', '-limit', 'thread', '1',
        source, '-auto-orient', '-thumbnail', '512x512>', '-strip', '-quality', '82', 'jpeg:-'],
      { encoding: 'buffer', maxBuffer: 3 * 1024 * 1024, timeout: 15000, windowsHide: true });
    } catch { return null; }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = file + '.' + randomBytes(4).toString('hex') + '.tmp';
    try {
      await writeFile(temporary, result.stdout, { mode: 0o600 });
      await rename(temporary, file);
    } finally { await rm(temporary, { force: true }); }
    return { data: result.stdout, type: 'image/jpeg' };
  })();
  pending.set(file, task);
  try { return await task; } finally { pending.delete(file); }
}
