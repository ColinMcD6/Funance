import { describe, expect, it } from 'vitest';
import { readProfileCookie } from './session';

describe('readProfileCookie', () => {
  it('reads the owner id from the profile cookie', () => {
    expect(readProfileCookie('profile=2')).toBe(2);
    expect(readProfileCookie('theme=dark; profile=12; other=x')).toBe(12);
  });

  it('returns null without a valid profile cookie', () => {
    expect(readProfileCookie('')).toBeNull();
    expect(readProfileCookie('profiles=2')).toBeNull();
    expect(readProfileCookie('profile=')).toBeNull();
    expect(readProfileCookie('profile=abc')).toBeNull();
    expect(readProfileCookie('profile=0')).toBeNull();
  });

  it('reads document.cookie by default', () => {
    document.cookie = 'profile=1; path=/';
    expect(readProfileCookie()).toBe(1);
    document.cookie = 'profile=; path=/; max-age=0';
    expect(readProfileCookie()).toBeNull();
  });
});
