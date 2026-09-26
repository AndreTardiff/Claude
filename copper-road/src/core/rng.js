// Deterministic, serialisable random numbers.
//
// Each named stream owns a 4-word sfc32 state stored as a plain array inside the
// world state, so snapshots capture it exactly. Streams are seeded from
// hash(seed + stream name): adding a new stream (or a new system) never shifts
// the numbers an existing stream produces.

/** cyrb128 string hash → four 32-bit words (bryc, public domain). */
export function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Advance an sfc32 state in place and return the next uint32. */
export function sfc32Next(s) {
  let a = s[0] | 0, b = s[1] | 0, c = s[2] | 0, d = s[3] | 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s[0] = a >>> 0;
  s[1] = b >>> 0;
  s[2] = c >>> 0;
  s[3] = d >>> 0;
  return t >>> 0;
}

export function createStreamState(seed, name) {
  const s = cyrb128(`${seed}::${name}`);
  // The first few sfc32 outputs are correlated with the seed words; discard them.
  for (let i = 0; i < 12; i++) sfc32Next(s);
  return s;
}

const TWO_32 = 4294967296;

/** Thin wrapper over a stream's state array. Cheap to create; holds no state of its own. */
export class Rng {
  constructor(state) {
    this.s = state;
  }

  u32() {
    return sfc32Next(this.s);
  }

  /** Uniform float in [0, 1). */
  float() {
    return this.u32() / TWO_32;
  }

  /** Uniform integer in [min, max], inclusive, without modulo bias. */
  int(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new Error(`Rng.int: bad range [${min}, ${max}]`);
    }
    const span = max - min + 1;
    const limit = TWO_32 - (TWO_32 % span);
    let x;
    do x = this.u32(); while (x >= limit);
    return min + (x % span);
  }

  chance(p) {
    return this.float() < p;
  }

  pick(list) {
    if (!list.length) throw new Error('Rng.pick: empty list');
    return list[this.int(0, list.length - 1)];
  }

  /** Pick from [[item, weight], ...]. Zero-weight items are never chosen. */
  weighted(entries) {
    let total = 0;
    for (const [, w] of entries) total += w;
    if (!(total > 0)) throw new Error('Rng.weighted: weights must sum above zero');
    let r = this.float() * total;
    for (const [item, w] of entries) {
      if (r < w) return item;
      r -= w;
    }
    // Floating-point leftovers land on the last non-zero entry.
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i][1] > 0) return entries[i][0];
    return entries[entries.length - 1][0];
  }

  /** Fisher–Yates shuffle, in place. Returns the same array. */
  shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }
}

/** Get (creating on first use) the named stream stored in `streams`. */
export function getRng(streams, seed, name) {
  if (!streams[name]) streams[name] = createStreamState(seed, name);
  return new Rng(streams[name]);
}
