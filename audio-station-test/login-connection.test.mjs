import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { hostname } from 'node:os';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

test('NAS-local hostname login uses loopback for discovery and authenticated requests, with clear connection errors', async t => {
  let discoveryMode = 'json', authCalls = 0, invalidApiResponse = false;
  const nas = http.createServer(async (req, res) => {
    if (req.url.startsWith('/webapi/query.cgi')) {
      if (discoveryMode === 'html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>DSM sign-in page</html>'); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, data: {
        'SYNO.API.Auth': { path: 'entry.cgi', maxVersion: 6 },
        'SYNO.AudioStation.RemotePlayer': { path: 'entry.cgi', maxVersion: 3 },
      } }));
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const params = new URLSearchParams(body);
    const auth = params.get('api') === 'SYNO.API.Auth';
    if (auth) authCalls++;
    else assert.equal(params.get('_sid'), 'fixture-session');
    res.setHeader('Content-Type', 'application/json');
    if (!auth && invalidApiResponse) { res.end('null'); return; }
    res.end(JSON.stringify({ success: true, data: auth ? { sid: 'fixture-session' } : { players: [] } }));
  });
  await new Promise(resolve => nas.listen(0, '127.0.0.1', resolve));
  t.after(() => nas.close());
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url), stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, PORT: String(port), BIND_ADDRESS: '127.0.0.1', NAS_LOCAL: 'true', PUBLIC_ORIGIN: '' },
  });
  let diagnostics = '';
  child.stderr.on('data', chunk => { diagnostics += chunk; });
  t.after(() => child.kill());
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(origin + '/health')).ok) break; } catch {}
    await delay(50);
  }
  let cookie = '';
  const call = async (endpoint, data = {}) => {
    const response = await fetch(origin + '/api/' + endpoint, {
      method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    cookie = response.headers.get('set-cookie')?.split(';')[0] || cookie;
    return { status: response.status, data: await response.json() };
  };
  const address = `http://${hostname().toLowerCase()}.local:${nas.address().port}`;
  const login = await call('login', { address, account: 'fixture', password: 'dummy-fixture-password' });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.address, address, 'browser retains its chosen public hostname');
  assert.equal(authCalls, 1);
  assert.equal((await call('players')).status, 200, 'later session requests also use the stable loopback endpoint');
  invalidApiResponse = true;
  const invalid = await call('players');
  assert.equal(invalid.status, 502);
  assert.match(invalid.data.error, /invalid response/);
  invalidApiResponse = false;
  const malformed = await fetch(origin + '/api/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"password":"PRIVATE-TEST-MARKER",invalid',
  });
  assert.equal(malformed.status, 500);
  assert.match((await malformed.json()).error, /while signing in.*Reference:/);
  await delay(20);
  assert.match(diagnostics, /request-failed/);
  assert.ok(!diagnostics.includes('PRIVATE-TEST-MARKER') && !diagnostics.includes('fixture-session'), 'diagnostics never include request secrets or session tokens');
  discoveryMode = 'html';
  const failed = await call('login', { address, account: 'fixture', password: 'dummy-fixture-password' });
  assert.equal(failed.status, 502);
  assert.match(failed.data.error, /Audio Station login service.*DSM port/);
  assert.equal(authCalls, 1, 'no auth attempt follows failed API discovery');
  assert.equal((await call('login', { address: 'not a URL' })).status, 400);
});
