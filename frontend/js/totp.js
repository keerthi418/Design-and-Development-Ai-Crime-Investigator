/**
 * TOTP (RFC 6238) — time-based one-time passwords.
 * Used for the authenticator-app two-factor enrolment flow in Settings.
 * Implemented locally so codes can be generated and verified client-side.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const PERIOD = 30;
const DIGITS = 6;

export function generateSecret(bytes = 20) {
  const buf = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < bytes; i += 1) buf[i] = Math.floor(Math.random() * 256);
  }
  return base32Encode(buf);
}

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];

  return out;
}

function base32Decode(secret) {
  const clean = String(secret || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];

  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** HMAC-SHA1 (pure JS, synchronous) — SHA-1 is mandated by RFC 4226 for HOTP. */
function hmacSha1Sync(key, message) {
  const blockSize = 64;

  let k = key.length > blockSize ? sha1(key) : key;
  k = Uint8Array.from(k);

  const padded = new Uint8Array(blockSize);
  padded.set(k);

  const outer = new Uint8Array(blockSize);
  const inner = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i += 1) {
    outer[i] = padded[i] ^ 0x5c;
    inner[i] = padded[i] ^ 0x36;
  }

  const innerHash = sha1(concat(inner, message));
  return sha1(concat(outer, innerHash));
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function sha1(bytes) {
  let h = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
  const ml = bytes.length * 8;

  const withPad = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
  withPad.set(bytes);
  withPad[bytes.length] = 0x80;
  const view = new DataView(withPad.buffer);
  view.setUint32(withPad.length - 4, ml >>> 0, false);
  view.setUint32(withPad.length - 8, Math.floor(ml / 0x100000000), false);

  const w = new Uint32Array(80);
  for (let offset = 0; offset < withPad.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 80; i += 1) {
      const n = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (n << 1) | (n >>> 31);
    }

    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i += 1) {
      let f;
      let k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    h = [(h[0] + a) >>> 0, (h[1] + b) >>> 0, (h[2] + c) >>> 0, (h[3] + d) >>> 0, (h[4] + e) >>> 0];
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  h.forEach((value, i) => outView.setUint32(i * 4, value, false));
  return out;
}

function counterToBytes(counter) {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(counter), false);
  return buf;
}

function dynamicTruncate(hash) {
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  return binary % 10 ** DIGITS;
}

/** Generate the code for the current time step. */
export function generate(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / PERIOD);
  const remaining = PERIOD - Math.floor((timestamp / 1000) % PERIOD);
  const key = base32Decode(secret);

  if (!key.length) return { code: "------", remaining };

  const hash = hmacSha1Sync(key, counterToBytes(counter));

  const code = String(dynamicTruncate(hash)).padStart(DIGITS, "0");
  return { code, remaining, counter };
}

/** Verify a submitted code, tolerating +/- one time step of clock drift. */
export function verify(secret, code, window = 1) {
  const clean = String(code || "").replace(/\D/g, "");
  if (clean.length !== DIGITS) return false;

  const now = Date.now();
  for (let drift = -window; drift <= window; drift += 1) {
    const candidate = generate(secret, now + drift * PERIOD * 1000).code;
    if (candidate === clean) return true;
  }
  return false;
}

/** otpauth:// URI consumed by authenticator apps (encoded in the QR code). */
export function provisioningUri(issuer, account, secret) {
  const label = `${issuer}:${account}`;
  return (
    `otpauth://totp/${encodeURIComponent(label)}` +
    `?secret=${secret}` +
    `&issuer=${encodeURIComponent(issuer)}` +
    `&algorithm=SHA1` +
    `&digits=${DIGITS}` +
    `&period=${PERIOD}`
  );
}

export const TOTP = {
  generate,
  verify,
  provisioningUri,
  generateSecret,
  base32Encode,
  PERIOD,
  DIGITS,
};

export default TOTP;