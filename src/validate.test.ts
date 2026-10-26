import { describe, expect, it } from 'vitest';
import { brokenSampleEvent, SAMPLE_EVENT, SAMPLE_NOTES } from './sample';
import { linkedinSlug, stripNulls, validateEvent } from './validate';

describe('validateEvent', () => {
  it('accepts the sample event against the sample notes', () => {
    const { problems } = validateEvent(SAMPLE_EVENT, SAMPLE_NOTES);
    expect(problems).toEqual([]);
  });

  it('catches the three mistakes in the broken sample', () => {
    const { problems } = validateEvent(brokenSampleEvent(), SAMPLE_NOTES);
    const text = problems.map((p) => p.message).join('\n');
    expect(problems).toHaveLength(3);
    expect(text).toMatch(/Priya Raman .* standing inside the bar/);
    expect(text).toMatch(/LinkedIn URL for Hana Ito .* is not in the notes/);
    expect(text).toMatch(/quote for Marcus Webb .* is not in the notes/);
  });

  it('rejects an invented person', () => {
    const event = structuredClone(SAMPLE_EVENT);
    event.people.push({
      id: 'nobody',
      name: 'Zed Nobody',
      kind: 'met',
      order: 10,
      x: 12,
      z: 13,
      topics: [],
      summary: 'Not in the notes.',
      reachOut: 'Hi.',
    });
    const { problems } = validateEvent(event, SAMPLE_NOTES);
    expect(problems.some((p) => /does not appear in the notes/.test(p.message))).toBe(true);
  });

  it('lets heard people stand on the stage but not met people', () => {
    const event = structuredClone(SAMPLE_EVENT);
    const dana = event.people.find((p) => p.id === 'dana-okafor');
    if (!dana) throw new Error('fixture changed');
    dana.x = 12;
    dana.z = 2.4;
    const { problems } = validateEvent(event, SAMPLE_NOTES);
    expect(problems.some((p) => /marked "met" but is on the stage/.test(p.message))).toBe(true);
  });

  it('flags furniture that sticks out of the room', () => {
    const event = structuredClone(SAMPLE_EVENT);
    event.venue.features.push({ id: 'big-table', kind: 'table', x: 23.8, z: 5, w: 2, d: 1 });
    const { problems } = validateEvent(event, SAMPLE_NOTES);
    expect(problems.some((p) => /sticks out of the room/.test(p.message))).toBe(true);
  });

  it('flags two people on top of each other', () => {
    const event = structuredClone(SAMPLE_EVENT);
    const leo = event.people.find((p) => p.id === 'leo-fischer');
    const hana = event.people.find((p) => p.id === 'hana-ito');
    if (!leo || !hana) throw new Error('fixture changed');
    leo.x = hana.x + 0.2;
    leo.z = hana.z;
    const { problems } = validateEvent(event, SAMPLE_NOTES);
    expect(problems.some((p) => /closer than/.test(p.message))).toBe(true);
  });

  it('reports schema errors with a path', () => {
    const { problems } = validateEvent({ venue: { name: 'x' }, people: [] }, SAMPLE_NOTES);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]?.path).toMatch(/venue/);
  });

  it('treats null fields as missing', () => {
    const event = structuredClone(SAMPLE_EVENT) as unknown as { people: Record<string, unknown>[] };
    const marcus = event.people.find((p) => p.id === 'marcus-webb');
    if (!marcus) throw new Error('fixture changed');
    marcus.linkedin = null;
    expect(validateEvent(event, SAMPLE_NOTES).problems).toEqual([]);
  });
});

describe('helpers', () => {
  it('extracts linkedin slugs', () => {
    expect(linkedinSlug('https://www.linkedin.com/in/Example-Person/')).toBe('example-person');
    expect(linkedinSlug('http://linkedin.com/in/x')).toBeNull();
    expect(linkedinSlug('https://evil.example/linkedin.com/in/x')).toBeNull();
  });

  it('strips nulls deeply', () => {
    expect(stripNulls({ a: null, b: [{ c: null, d: 1 }] })).toEqual({ b: [{ d: 1 }] });
  });
});
