// The almanac marks the turning of the calendar in the world log.

export const almanac = {
  id: 'almanac',

  init(sim) {
    sim.log('world:begin', { season: sim.cal.season(sim.now).id });
  },

  seasonal(sim) {
    sim.log('season:begin', { season: sim.cal.season(sim.now).id, year: sim.cal.year(sim.now) });
  },
};
