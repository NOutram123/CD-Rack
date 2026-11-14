import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

for (const publicOrigin of ['', 'https://music.example.test']) {
  test(`NAS hosting preserves host and origin checks (${publicOrigin || 'LAN'})`, async t => {
    const probe = http.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const child = spawn(process.execPath, ['server.mjs'], {
      cwd: new URL('.', import.meta.url), stdio: 'ignore',
      env: { ...process.env, PORT: String(port), BIND_ADDRESS: '127.0.0.1', ALLOWED_HOSTS: 'nas.test', NAS_LOCAL: 'true', PUBLIC_ORIGIN: publicOrigin },
    });
    t.after(() => child.kill());
    const base = `http://127.0.0.1:${port}`;
    const fetchHost = (path, headers, method = 'GET') => new Promise((resolve, reject) => {
      const request = http.request(`${base}${path}`, { headers, method }, response => {
        let body = '';
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ ok: response.statusCode === 200, status: response.statusCode, json: async () => JSON.parse(body) }));
      });
      request.on('error', reject);
      request.end(method === 'POST' ? '{}' : undefined);
    });
    const host = publicOrigin ? 'music.example.test' : `nas.test:${port}`;
    const origin = publicOrigin || `http://${host}`;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { ready = (await fetchHost('/health', { Host: host })).ok; } catch {}
      if (ready) break;
      await delay(50);
    }
    assert.ok(ready, 'server starts');
    assert.equal((await fetchHost('/', { Host: host })).status, 200);
    assert.equal((await fetchHost('/', { Host: `attacker.test:${port}` })).status, 403);
    const call = requestOrigin => fetchHost('/api/discover', { Host: host, Origin: requestOrigin, 'Content-Type': 'application/json' }, 'POST');
    assert.equal((await call('https://attacker.test')).status, 403);
    const discovered = await call(origin);
    assert.equal(discovered.status, 200);
    assert.ok(Array.isArray((await discovered.json()).devices));
  });
}
