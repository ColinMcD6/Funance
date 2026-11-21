import { describe, expect, it } from 'vitest';
import { decodeCsvBytes } from './decode.js';

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

describe('decodeCsvBytes', () => {
  it('decodes ASCII', () => {
    expect(decodeCsvBytes(bytes(0x61, 0x2c, 0x62), 'utf-8')).toBe('a,b');
  });

  it('strips a UTF-8 byte order mark', () => {
    expect(decodeCsvBytes(bytes(0xef, 0xbb, 0xbf, 0x41), 'utf-8')).toBe('A');
  });

  it('decodes two-, three- and four-byte UTF-8 sequences', () => {
    // é, €, 😀
    const input = bytes(0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80);
    expect(decodeCsvBytes(input, 'utf-8')).toBe('é€😀');
  });

  it('replaces invalid UTF-8 with U+FFFD instead of throwing', () => {
    // A lone continuation byte, a truncated sequence, an overlong encoding, a surrogate, 0xff.
    expect(decodeCsvBytes(bytes(0x80), 'utf-8')).toBe('\uFFFD');
    expect(decodeCsvBytes(bytes(0x41, 0xc3), 'utf-8')).toBe('A\uFFFD');
    expect(decodeCsvBytes(bytes(0xc0, 0x80), 'utf-8')).toBe('\uFFFD\uFFFD');
    expect(decodeCsvBytes(bytes(0xed, 0xa0, 0x80), 'utf-8')).toBe('\uFFFD\uFFFD\uFFFD');
    expect(decodeCsvBytes(bytes(0xff, 0x41), 'utf-8')).toBe('\uFFFDA');
    expect(decodeCsvBytes(bytes(0xc3, 0x41), 'utf-8')).toBe('\uFFFDA');
  });

  it('decodes latin1 byte for byte', () => {
    expect(decodeCsvBytes(bytes(0x43, 0x61, 0x66, 0xe9), 'latin1')).toBe('Café');
  });

  it('keeps UTF-8 BOM bytes as ordinary characters in latin1', () => {
    // In latin1 the UTF-8 BOM bytes are three ordinary characters, so they stay.
    expect(decodeCsvBytes(bytes(0xef, 0xbb, 0xbf), 'latin1')).toBe('ï»¿');
  });

  it('decodes long input', () => {
    const input = new Uint8Array(10000).fill(0x61);
    expect(decodeCsvBytes(input, 'utf-8')).toBe('a'.repeat(10000));
  });
});
