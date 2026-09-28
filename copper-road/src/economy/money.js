// Money: whole verdigris bits in named accounts, moved only by transfers.
//
// Accounts (all in sim.state.coin.accounts):
//   purse:<town>    the households of a settlement
//   till:<town>     the market traders' float: they buy what's made and sell what's used
//   treasury        Lord Aldric's treasury
//   wayfarer:<id>   a traveller's purse
//   merchant:<id>   a merchant house's purse
// Seven flows enter or leave circulation and are tallied in sim.state.coin.flows:
//   in:  minted (the Mint strikes new coin), gifted (lab), exported (the ships at
//        the Outside pay for the goods they carry away)
//   out: crown (the Crown's due leaves), worn (clipped, lost and worn away),
//        hoarded (buried under floors; tallied per town in sim.state.coin.hoards
//        so it can be dug up later), imported (paid to the ships for their goods)
// Everything else is a transfer, so the money supply is always exactly
//   opening supply + minted + gifted + exported − crown − worn − hoarded − imported.

export const SOURCES = new Set(['mint', 'lab', 'ships']);
export const SINKS = new Set(['crown', 'wear', 'hoard', 'ships']);
const SOURCE_FLOW = { mint: 'minted', lab: 'gifted', ships: 'exported' };
const SINK_FLOW = { crown: 'crown', wear: 'worn', hoard: 'hoarded', ships: 'imported' };
export const FLOWS_IN = ['minted', 'gifted', 'exported'];
export const FLOWS_OUT = ['crown', 'worn', 'hoarded', 'imported'];

export const toBits = (sim, marks) => Math.round(marks * sim.data.coin.bitsPerMark);
export const toMarks = (sim, bits) => bits / sim.data.coin.bitsPerMark;

export function balance(sim, account) {
  return sim.state.coin?.accounts[account] ?? 0;
}

/**
 * Move up to `bits` from one account to another. Returns the amount moved,
 * which is less when the payer can't cover it. Sources (mint, lab, ships)
 * always cover; sinks (crown, wear, hoard, ships) swallow.
 */
export function transfer(sim, from, to, bits) {
  const st = sim.state.coin;
  if (!st) return 0;
  let amount = Math.floor(bits);
  if (!(amount > 0)) return 0;
  if (!SOURCES.has(from)) amount = Math.min(amount, st.accounts[from] ?? 0);
  if (amount <= 0) return 0;
  if (SOURCES.has(from)) st.flows[SOURCE_FLOW[from]] += amount;
  else st.accounts[from] -= amount;
  if (SINKS.has(to)) st.flows[SINK_FLOW[to]] += amount;
  else st.accounts[to] = (st.accounts[to] ?? 0) + amount;
  if (to === 'treasury') st.treasuryIn = (st.treasuryIn ?? 0) + amount; // the lord's income, which the Crown taxes
  return amount;
}

/** Total coin held anywhere in the region. */
export function moneySupply(sim) {
  let total = 0;
  for (const v of Object.values(sim.state.coin?.accounts ?? {})) total += v;
  return total;
}

/** What the supply should be by the books: opening + every flow in − every flow out. */
export function booksBalance(sim) {
  const st = sim.state.coin;
  if (!st) return 0;
  let total = st.opening;
  for (const f of FLOWS_IN) total += st.flows[f] ?? 0;
  for (const f of FLOWS_OUT) total -= st.flows[f] ?? 0;
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
