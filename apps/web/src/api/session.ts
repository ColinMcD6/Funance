import { PROFILE_COOKIE } from '@funance/shared';

/**
 * The owner id held in the `profile` cookie that POST /session sets, or null when there is
 * none. The cookie is the only record of the active profile; the server checks it on each call.
 */
export function readProfileCookie(cookieHeader: string = document.cookie): number | null {
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== PROFILE_COOKIE) continue;
    const value = rest.join('=');
    return /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  }
  return null;
}
