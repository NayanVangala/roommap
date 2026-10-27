/** Colours shared by the 3D scene. Keep in sync with the CSS tokens in style.css. */
export const COLORS = {
  ink: 0x0e1013,
  grid: 0xffffff,
  wall: 0x20252b,
  /** People you met: a calm blue. */
  met: 0x6ea8fe,
  /** People you heard: neutral grey, drawn see-through. */
  heard: 0xb7bfca,
  focus: 0xe8eaed,
  route: 0x6ea8fe,
  /** Bulbs, pendants and light pools: a cool white. */
  lamp: 0xdfe8ff,
  feature: {
    stage: 0x23272d,
    bar: 0x3a3f47,
    table: 0x5b6168,
    booth: 0x1f4f4a,
    sofa: 0x3d4a5c,
    screen: 0x0b0c0e,
    plant: 0x3f7a4d,
    door: 0xb8c4d6,
  },
} as const;
