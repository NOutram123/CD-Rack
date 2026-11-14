import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
const root = new URL('./', import.meta.url);
const output = new URL('./dist/', root);
await mkdir(output, { recursive: true });
// Explicit allowlist: never publish NAS server/deployment files or local caches.
for (const file of ['app.js', 'demo-player.js', 'carousel.js', 'spine-colour.js', 'rack-sort.js', 'style.css', 'sw.js', 'manifest.webmanifest', 'icon.svg']) {
  await copyFile(new URL('public/' + file, root), new URL(file, output));
}
let html = await readFile(new URL('public/index.html', root), 'utf8');
html = html.replace(/<form id="login"[\s\S]*?<\/form>/, '');
html = html.replace('Finding your Synology NAS…', 'Explore sample albums. No NAS needed.');
await writeFile(new URL('index.html', output), html);
await writeFile(new URL('config.js', output), 'export const demoOnly = true;\n');
console.log('Static Demo-only site built in dist/');
