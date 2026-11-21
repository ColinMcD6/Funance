import type { CsvMapping } from '@funance/shared';

const REPLACEMENT = 0xfffd;

/**
 * Decodes file bytes as text in the mapping's encoding and strips a leading byte order mark.
 * Written by hand so the core library needs no platform text APIs. Invalid UTF-8 sequences
 * become U+FFFD, as a browser would show them.
 */
export function decodeCsvBytes(bytes: Uint8Array, encoding: CsvMapping['encoding']): string {
  const text = encoding === 'latin1' ? decodeLatin1(bytes) : decodeUtf8(bytes);
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function decodeUtf8(bytes: Uint8Array): string {
  const codePoints: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i] ?? 0;
    let length: number;
    let min: number;
    let cp: number;
    if (b0 < 0x80) {
      codePoints.push(b0);
      i += 1;
      continue;
    } else if (b0 >= 0xc0 && b0 < 0xe0) {
      length = 2;
      min = 0x80;
      cp = b0 & 0x1f;
    } else if (b0 >= 0xe0 && b0 < 0xf0) {
      length = 3;
      min = 0x800;
      cp = b0 & 0x0f;
    } else if (b0 >= 0xf0 && b0 < 0xf8) {
      length = 4;
      min = 0x10000;
      cp = b0 & 0x07;
    } else {
      codePoints.push(REPLACEMENT);
      i += 1;
      continue;
    }
    let valid = i + length <= bytes.length;
    for (let k = 1; valid && k < length; k++) {
      const b = bytes[i + k] ?? 0;
      if ((b & 0xc0) !== 0x80) valid = false;
      else cp = (cp << 6) | (b & 0x3f);
    }
    if (!valid || cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      codePoints.push(REPLACEMENT);
      i += 1;
      continue;
    }
    codePoints.push(cp);
    i += length;
  }
  let out = '';
  const CHUNK = 4096;
  for (let start = 0; start < codePoints.length; start += CHUNK) {
    out += String.fromCodePoint(...codePoints.slice(start, start + CHUNK));
  }
  return out;
}
