// Map decoration: geography that only matters for drawing. Kilometre coordinates,
// matching the node positions in src/data/world.js. Not part of the simulation.

export const DECOR = {
  title: 'The Copper Road',
  sea: [[240, 0], [240, 160], [200, 160], [214, 150], [226, 146], [236, 132], [238, 100], [234, 60], [236, 20], [232, 0]],
  seaLabel: { text: 'the Grey Sea', at: [233, 70], angle: -1.5708 },
  rivers: [
    {
      name: 'Copperwash',
      points: [[68, 65], [80, 90], [95, 112], [125, 108], [150, 105], [175, 108], [205, 114], [236, 131]],
      label: { at: [128, 114], angle: -0.06 },
    },
  ],
  gorge: {
    name: 'Grey Gorge',
    points: [[92, 0], [95, 8], [110, 60], [114, 78]],
    label: { at: [116, 30], angle: 1.29 },
  },
  forests: [
    {
      name: 'Blackpine',
      points: [[78, 30], [96, 26], [106, 40], [114, 60], [122, 76], [110, 84], [92, 74], [80, 60], [76, 46]],
      label: [93, 44],
    },
  ],
  hills: [
    {
      name: 'Greyback Hills',
      points: [[30, 50], [62, 46], [66, 70], [62, 100], [40, 108], [26, 80]],
      label: { at: [23, 79], angle: -1.5708 },
    },
  ],
  fields: [
    { points: [[22, 118], [40, 112], [52, 118], [60, 132], [44, 146], [24, 140]] },
  ],
  // Label placement per node: [dx, dy] in screen pixels from the node, and text alignment.
  labels: {
    kingscross: [10, -9, 'left'],
    copperford: [-10, -8, 'right'],
    greenhollow: [10, 16, 'left'],
    saltmouth: [-10, 16, 'right'],
    'aldrics-bridge': [8, 4, 'left'],
    blackpine: [8, 12, 'left'],
    'mill-ford': [0, 17, 'center'],
    'the-saddle': [-8, 4, 'right'],
    fenwatch: [0, -10, 'center'],
  },
};
