// Money: whole verdigris bits in named accounts, moved only by transfers.
//
// Accounts (all in sim.state.coin.accounts):
//   purse:<town>    the households of a settlement
//   till:<town>     the market traders' float: they buy what's made and sell what's used
//   treasury        Lord Aldric's treasury
//   wayfarer:<id>   a traveller's purse
// Five flows enter or leave circulation and are tallied in sim.state.coin.flows:
//   minted (the Mint strikes new coin), gifted (lab), crown (the Crown's due
//   leaves), worn (clipped, lost and worn away), hoarded (buried under floors;
//   tallied per town in sim.state.coin.hoards so it can be dug up later).
// Everything else is a transfer, so the money supply is always exactly
//   opening supply + minted + gifted − crown − worn − hoarded.

export const SOURCES = new Set(['mint', 'lab']);
export const SINKS = new Set(['crown', 'wear', 'hoard']);
const SINK_FLOW = { crown: 'crown', wear: 'worn', hoard: 'hoarded' };

export const toBits = (sim, marks) => Math.round(marks * sim.data.coin.bitsPerMark);
export const toMarks = (sim, bits) => bits / sim.data.coin.bitsPerMark;

export function balance(sim, account) {
  return sim.state.coin?.accounts[account] ?? 0;
}

/**
 * Move up to `bits` from one account to another. Returns the amount moved,
 * which is less when the payer can't cover it. Sources (mint, lab) always
 * cover; sinks (crown, wear) swallow.
 */
export function transfer(sim, from, to, bits) {
  const st = sim.state.coin;
  if (!st) return 0;
  let amount = Math.floor(bits);
  if (!(amount > 0)) return 0;
  if (!SOURCES.has(from)) amount = Math.min(amount, st.accounts[from] ?? 0);
  if (amount <= 0) return 0;
  if (SOURCES.has(from)) st.flows[from === 'mint' ? 'minted' : 'gifted'] += amount;
  else st.accounts[from] -= amount;
  if (SINKS.has(to)) st.flows[SINK_FLOW[to]] += amount;
  else st.accounts[to] = (st.accounts[to] ?? 0) + amount;
  return amount;
}

/** Total coin held anywhere in the region. */
export function moneySupply(sim) {
  let total = 0;
  for (const v of Object.values(sim.state.coin?.accounts ?? {})) total += v;
  return total;
}

/** "3 marks 8 bits", "11 bits", "1,204 marks". */
export function formatMoney(sim, bits, { short = false } = {}) {
  const per = sim.data.coin.bitsPerMark;
  const neg = bits < 0;
  const b = Math.abs(Math.round(bits));
  const m = Math.floor(b / per);
  const r = b % per;
  const sign = neg ? '−' : '';
  if (short) return sign + (m >= 100 || !r ? `${m.toLocaleString('en')}m` : m ? `${m}m ${r}b` : `${r}b`);
  const marks = `${m.toLocaleString('en')} mark${m === 1 ? '' : 's'}`;
  const bitsText = `${r} bit${r === 1 ? '' : 's'}`;
  return sign + (m >= 100 || !r ? marks : m ? `${marks} ${bitsText}` : bitsText);
}
