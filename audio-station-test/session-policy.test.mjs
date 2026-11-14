import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_IDLE_MS, SESSION_KEEPALIVE_MS, sessionExpired, sessionCookie, maintainSessions } from './session-policy.mjs';

test('logins last 30 idle days and persistent cookies retain existing protections', () => {
  const session = { used: 1000 };
  assert.equal(sessionExpired(session, 1000 + 29 * 86400000), false);
  assert.equal(sessionExpired(session, 1000 + SESSION_IDLE_MS), true);
  session.used += 86400000;
  assert.equal(sessionExpired(session, 1000 + SESSION_IDLE_MS), false, 'user activity renews the idle period');
  assert.equal(sessionCookie('token'), 'audio_test=token; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000');
  assert.ok(sessionCookie('token', true).endsWith('; Secure'));
});

test('NAS keepalive respects activity, expiry, failures and overlapping timer ticks', async () => {
  const now = SESSION_IDLE_MS * 2;
  const active = { used: now - 3 * 86400000, nasUsed: now - SESSION_KEEPALIVE_MS };
  const recent = { used: now, nasUsed: now - 1000 };
  const expired = { used: now - SESSION_IDLE_MS };
  const sessions = new Map([['active', active], ['recent', recent], ['expired', expired]]);
  let finish;
  let calls = 0;
  const probe = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const first = maintainSessions(sessions, probe, now);
  await maintainSessions(sessions, probe, now);
  assert.equal(calls, 1, 'recent requests and an in-flight keepalive suppress probes');
  assert.equal(sessions.has('expired'), false);
  finish(); await first;
  assert.equal(active.used, now - 3 * 86400000, 'keepalive cannot extend user inactivity');
  await maintainSessions(sessions, async () => { throw Error('offline'); }, now);
  assert.equal(sessions.has('active'), true, 'network outages retain sessions');
  await maintainSessions(sessions, async () => { throw Object.assign(Error('revoked'), { status: 401 }); }, now);
  assert.equal(sessions.has('active'), false, 'revoked NAS sessions are discarded');
});
