export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_KEEPALIVE_MS = 5 * 60 * 1000;

export function sessionExpired(session, now = Date.now()) {
  return now - session.used >= SESSION_IDLE_MS;
}

export function sessionCookie(token, secure = false) {
  return `audio_test=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_IDLE_MS / 1000}${secure ? '; Secure' : ''}`;
}

// Refresh NAS activity, never user activity: unused logins still expire after
// 30 days. The probe is read-only and cannot alter a receiver or its queue.
export async function maintainSessions(sessions, probe, now = Date.now()) {
  await Promise.all([...sessions].map(async ([token, session]) => {
    if (sessionExpired(session, now)) { sessions.delete(token); return; }
    if (session.keepingAlive || now - (session.nasUsed || 0) < SESSION_KEEPALIVE_MS) return;
    session.keepingAlive = true;
    try { await probe(session); }
    catch (error) {
      if (error.status === 401 && sessions.get(token) === session) sessions.delete(token);
      // Transient network errors do not discard a still-valid browser session.
    } finally { session.keepingAlive = false; }
  }));
}
