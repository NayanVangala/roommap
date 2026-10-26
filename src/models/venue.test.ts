import { describe, expect, it } from 'vitest';
import { SAMPLE_EVENT } from '../sample';
import { facingOf } from './venue';

/** Furniture turns to face away from the nearest wall. 0 = south, pi = north, pi/2 = east, -pi/2 = west. */
describe('facingOf', () => {
  const { venue } = SAMPLE_EVENT;
  const facing = (id: string) => {
    const f = venue.features.find((x) => x.id === id);
    if (!f) throw new Error(`no feature ${id}`);
    return facingOf(f, venue);
  };

  it('points the stage and booth (north wall) south into the room', () => {
    expect(facing('stage')).toBe(0);
    expect(facing('booth')).toBe(0);
  });

  it('points the sofa and door (south wall) north into the room', () => {
    expect(facing('sofa')).toBe(Math.PI);
    expect(facing('door')).toBe(Math.PI);
  });

  it('points the bar (west wall) east into the room', () => {
    expect(facing('bar')).toBe(Math.PI / 2);
  });

  it('points something on the east wall west', () => {
    expect(facingOf({ x: venue.width - 0.5, z: venue.depth / 2 }, venue)).toBe(-Math.PI / 2);
  });
});
