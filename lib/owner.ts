import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * VoiceBrief has no accounts: a library belongs to the browser that created it,
 * identified by a random 192-bit id in an httpOnly cookie. Every query is scoped
 * by it, so one device can never read another's meetings.
 */
const COOKIE = 'vb_device';
const VALID = /^[A-Za-z0-9_-]{32}$/;

/** For route handlers: returns the device id, creating it on first use. */
export async function ownerId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && VALID.test(existing)) return existing;
  const id = randomBytes(24).toString('base64url');
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

/** For server components (which can't set cookies): null if this browser is new. */
export async function currentOwner(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return value && VALID.test(value) ? value : null;
}
