import { EventSchema, type EventData, type Feature, type Person } from './schema';

/**
 * Deterministic checks on whatever the model proposed.
 * The model proposes, this file decides. Every problem is a plain sentence
 * so it can be fed straight back to the model on the next round.
 */

export interface Problem {
  path: string;
  message: string;
}

export interface Validation {
  event?: EventData;
  problems: Problem[];
}

/** Space around a standing person that must stay clear of furniture. */
const BODY_RADIUS = 0.25;
const MIN_SPACING = 0.6;
const WALL_MARGIN = 0.3;
/** Things a person cannot stand inside. Stage is handled separately, door is a floor marker. */
const SOLID = new Set<Feature['kind']>(['bar', 'table', 'booth', 'sofa', 'screen', 'plant']);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Models like to send null for "nothing". The schema wants the field gone. */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, stripNulls(v)]),
    );
  }
  return value;
}

const LINKEDIN = /^https:\/\/(www\.)?linkedin\.com\/in\/([A-Za-z0-9_%-]+)\/?$/;

export function linkedinSlug(url: string): string | null {
  const m = LINKEDIN.exec(url.trim());
  return m?.[2] ? m[2].toLowerCase() : null;
}

function inside(f: Pick<Feature, 'x' | 'z' | 'w' | 'd'>, x: number, z: number, pad: number): boolean {
  return Math.abs(x - f.x) <= f.w / 2 + pad && Math.abs(z - f.z) <= f.d / 2 + pad;
}

export function validateEvent(raw: unknown, notes: string): Validation {
  const parsed = EventSchema.safeParse(stripNulls(raw));
  if (!parsed.success) {
    return {
      problems: parsed.error.issues.slice(0, 12).map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    };
  }

  const event = parsed.data;
  const { venue, people } = event;
  const problems: Problem[] = [];
  const add = (path: string, message: string) => problems.push({ path, message });
  const haystack = normalize(notes);

  // Ids must be unique across features and people.
  const seen = new Set<string>();
  for (const id of [...venue.features.map((f) => f.id), ...people.map((p) => p.id)]) {
    if (seen.has(id)) add('ids', `The id "${id}" is used more than once. Ids must be unique.`);
    seen.add(id);
  }

  // Every feature must fit inside the room.
  venue.features.forEach((f, i) => {
    const out =
      f.x - f.w / 2 < -1e-6 || f.x + f.w / 2 > venue.width + 1e-6 || f.z - f.d / 2 < -1e-6 || f.z + f.d / 2 > venue.depth + 1e-6;
    if (out) {
      add(
        `venue.features[${i}]`,
        `${f.kind} "${f.id}" sticks out of the room. The room is ${venue.width} m wide (x) and ${venue.depth} m deep (z), so the box must stay inside 0..${venue.width} and 0..${venue.depth}.`,
      );
    }
  });

  const stages = venue.features.filter((f) => f.kind === 'stage');
  const solids = venue.features.filter((f) => SOLID.has(f.kind));

  people.forEach((p, i) => {
    const at = `people[${i}]`;
    const who = `${p.name} (${p.id})`;

    if (
      p.x < WALL_MARGIN ||
      p.x > venue.width - WALL_MARGIN ||
      p.z < WALL_MARGIN ||
      p.z > venue.depth - WALL_MARGIN
    ) {
      add(at, `${who} is outside the room or too close to a wall. Keep x within ${WALL_MARGIN}..${venue.width - WALL_MARGIN} and z within ${WALL_MARGIN}..${venue.depth - WALL_MARGIN}.`);
    }

    const blocker = solids.find((f) => inside(f, p.x, p.z, BODY_RADIUS));
    if (blocker) {
      add(at, `${who} is standing inside the ${blocker.kind} "${blocker.id}". Move them onto open floor next to it.`);
    }

    if (p.kind === 'met' && stages.some((f) => inside(f, p.x, p.z, 0))) {
      add(at, `${who} is marked "met" but is on the stage. Only "heard" people can be on the stage.`);
    }

    // Grounding: nothing the model says about a person may be invented.
    if (!haystack.includes(normalize(p.name))) {
      add(at, `The name "${p.name}" does not appear in the notes. Copy names exactly as written, and do not invent people.`);
    }
    if (p.quote && !haystack.includes(normalize(p.quote))) {
      add(at, `The quote for ${who} is not in the notes. Copy a quote character for character, or leave quote out.`);
    }
    if (p.linkedin) {
      const slug = linkedinSlug(p.linkedin);
      if (!slug) {
        add(at, `The linkedin value for ${who} is not a https://www.linkedin.com/in/<name> URL.`);
      } else if (!haystack.includes(`linkedin.com/in/${slug}`)) {
        add(at, `The LinkedIn URL for ${who} is not in the notes. Only include a URL that appears in the notes, otherwise leave linkedin out.`);
      }
    }
  });

  // People need breathing room so nobody renders inside someone else.
  for (let a = 0; a < people.length; a++) {
    for (let b = a + 1; b < people.length; b++) {
      const pa = people[a] as Person;
      const pb = people[b] as Person;
      if (Math.hypot(pa.x - pb.x, pa.z - pb.z) < MIN_SPACING) {
        add(`people[${b}]`, `${pb.name} is closer than ${MIN_SPACING} m to ${pa.name}. Spread them out.`);
      }
    }
  }

  return problems.length ? { problems } : { event, problems };
}

export function formatProblems(problems: Problem[]): string {
  return problems.map((p) => `- ${p.path}: ${p.message}`).join('\n');
}
