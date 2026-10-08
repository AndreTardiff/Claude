// The player (step G, spec §4, §15): a person in one town, with the family stall
// and the family debt, trading under the same rules as everyone else.

export const PLAYER = {
  home: 'kingscross',
  family: 'Marrow', // the family name the lineage carries
  given: ['Tamsin', 'Edric', 'Maud', 'Osric', 'Wynne', 'Jory', 'Isolt', 'Hob'],
  parent: 'Agnes Marrow', // who died, and left the stall and the note
  purse: 40, // marks in hand at the start
  stall: { cloth: 8, tools: 4, salt: 3 }, // what's in the family stall at Kingscross
  wagons: 1, // the family wagon
  // Letters from the parent's old contacts, still on the road when the game begins.
  contacts: [
    { at: 'copperford', arrives: 2, ageDays: 4, from: 'Hild Tanner, an old friend at Copperford' },
    { at: 'greenhollow', arrives: 4, ageDays: 5, from: 'the reeve at Greenhollow' },
  ],

  // The Kingscross money-changer holds the family's note.
  changer: {
    name: 'Ansel Crabbe',
    capital: 600, // marks in the changer's strongbox at the start
    spendAbove: 700, // the changer's household spends a tenth of anything above this, daily
  },
  debt: {
    principal: 300, // marks owed at the start
    rate: 0.02, // interest a season (ten days in the prototype), on what's owed
    installment: 0.04, // share of the principal due each season, besides the interest
    strikes: 2, // missed payments before the changer seizes what he can
    borrowFactor: 0.6, // he'll lend up to this share of your net worth (goods, wagons, coin)
    borrowMax: 600,
  },

  // Couriers: a townsman on a good horse, paid by the distance, who carries your
  // orders and brings back the other town's board. They can be robbed.
  courier: { speedKmh: 8, perKm: 0.06, min: 3, waitDays: 3 },
  // Factors: a townsperson who acts for you in another town (spec §4.2). They send
  // the town's board home by courier every few days (it can be robbed on the way),
  // and sell your goods stored there when the price is right. Some skim.
  factor: { wage: 1, reportEvery: 3, honesty: [700, 1000], quitAfter: 12, sellAbove: 1.1 },
  // Travelling alone, on horseback.
  travelKmh: 6,
  fee: 0.03, // what a player pays over the price for their own purchases (the market fee is the lord's)
  // Riding with a caravan that loses a fight: the chance the player is killed (else they may be taken).
  deathChance: 0.15,
  // Bankrupt: this long working off the debt as a factor for the richest rival house, for a
  // wage (marks a day); the changer takes his share of it, and the rest starts you again.
  bond: { days: 30, wage: 2, toChanger: 0.5 },
  stableFee: 0.2, // marks a day a wagon standing idle away from home costs
};
