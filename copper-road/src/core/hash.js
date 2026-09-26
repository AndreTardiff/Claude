// Canonical serialisation and hashing of simulation state.
//
// The state hash is the determinism fingerprint: two runs with the same seed and
// the same code must produce the same hash, in Node and in any browser.

/** JSON with object keys sorted, so equal states always serialise identically. */
export function stableStringify(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number in state: ${value}`);
    return JSON.stringify(value);
  }
  if (type === 'string' || type === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',') + ']';
  }
  if (type === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  throw new Error(`Cannot serialise a ${type} in simulation state`);
}

/** cyrb53 string hash (bryc, public domain) → 53-bit integer. */
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** 14-hex-digit fingerprint of any serialisable value. */
export function hashValue(value) {
  return cyrb53(stableStringify(value)).toString(16).padStart(14, '0');
}
