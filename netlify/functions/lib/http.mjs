import { createHash, timingSafeEqual } from 'node:crypto';

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra }
  });
}

// Public reads always revalidate so a new Sunday sermon shows up right away.
export const REVALIDATE = { 'Cache-Control': 'public, max-age=0, must-revalidate' };

const digest = (s) => createHash('sha256').update(String(s)).digest();

/**
 * Admin check: "Authorization: Bearer <password>" against the ADMIN_PASSWORD
 * environment variable. Returns null when allowed, or a Response to send back.
 */
export async function requireAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return json({ error: 'not_configured', message: 'ADMIN_PASSWORD is not set on this site yet.' }, 503);
  }
  const header = req.headers.get('authorization') || '';
  const given = header.replace(/^Bearer\s+/i, '');
  if (!timingSafeEqual(digest(given), digest(expected))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return json({ error: 'unauthorized', message: 'That password is not right.' }, 401);
  }
  return null;
}
