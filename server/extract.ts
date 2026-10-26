import { GoogleGenAI } from '@google/genai';
import type { EventData } from '../src/schema';
import { brokenSampleEvent, SAMPLE_EVENT, SAMPLE_NOTES } from '../src/sample';
import { formatProblems, normalize, validateEvent, type Problem } from '../src/validate';

/**
 * Notes (and maybe a floor-plan photo) in, a checked 3D room plan out.
 *
 *   propose  ->  validate  ->  if problems, send them back  ->  propose again
 *
 * The model only ever proposes. src/validate.ts decides what is allowed on screen.
 */

export interface ImageInput {
  mimeType: string;
  /** base64, no data: prefix */
  data: string;
}

export interface Round {
  n: number;
  problems: Problem[];
}

export interface ExtractResult {
  ok: boolean;
  mode: 'mock' | 'argon';
  event?: EventData;
  rounds: Round[];
  error?: string;
}

export interface ProposeArgs {
  notes: string;
  image?: ImageInput;
  round: number;
  /** The previous raw answer and what was wrong with it. Empty on round 1. */
  previous?: string;
  problems?: Problem[];
}

/** Returns the model's raw text answer. Swappable so tests and mock mode need no key. */
export type Proposer = (args: ProposeArgs) => Promise<string>;

export const MAX_ROUNDS = 3;
export const MAX_NOTES_CHARS = 20_000;
export const MAX_IMAGE_BYTES = 4_000_000;

const SYSTEM = `You turn a person's rough notes from a social or networking event into a 3D room plan.
Return ONLY one JSON object. No markdown, no commentary.

Shape:
{
  "venue": {
    "name": string,
    "width": number,   // metres, west to east (x)
    "depth": number,   // metres, north to south (z)
    "features": [ { "id": string, "kind": "stage"|"bar"|"table"|"booth"|"sofa"|"screen"|"plant"|"door", "label"?: string, "x": number, "z": number, "w": number, "d": number } ]
  },
  "people": [ {
    "id": string, "name": string, "kind": "met"|"heard", "order": integer,
    "role"?: string, "company"?: string, "x": number, "z": number, "spot"?: string,
    "topics": string[], "summary": string, "quote"?: string, "linkedin"?: string, "reachOut": string
  } ]
}

Rules:
- Units are metres. Origin is the north-west corner of the room. x runs east, z runs south.
- Every feature is an axis-aligned box described by its centre (x, z) and size (w along x, d along z). It must fit fully inside the room.
- Build features from the room description in the notes (and the floor-plan photo if there is one). Use only the kinds listed.
- One entry in people per person in the notes. kind "met" = the user talked to them. kind "heard" = the user only listened to them or overheard them.
- Put each person on open floor near where the notes say they were. Never inside a bar, table, booth, sofa, screen or plant. Only "heard" people may stand on the stage. Keep people at least 0.6 m apart and 0.3 m from the walls.
- order: 1 for the first person of the night, counting up in the order the notes tell it.
- Copy names exactly as written in the notes. Never invent people, LinkedIn URLs or quotes.
- linkedin: only if the notes contain that exact URL. Otherwise leave the field out.
- quote: one short quote copied character for character from the notes, or leave the field out.
- topics: up to 4 short phrases. summary: one or two plain sentences about what was discussed or said.
- reachOut: one friendly sentence the user could send to follow up. Mention something specific. For "heard" people, reference what they said.
- Leave optional fields out instead of using null.`;

export function buildUserPrompt(args: ProposeArgs): string {
  const parts = [`Notes:\n"""\n${args.notes}\n"""`];
  if (args.previous && args.problems?.length) {
    parts.push(
      `Your previous answer:\n${args.previous}`,
      `A checker found these problems with it:\n${formatProblems(args.problems)}`,
      'Return the full corrected JSON object. Fix every problem and change nothing else.',
    );
  }
  return parts.join('\n\n');
}

export function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(trimmed);
}

/** Round 1 is sloppy on purpose, later rounds are clean. Lets you watch the loop without a key. */
export const mockProposer: Proposer = async ({ round }) =>
  JSON.stringify(round === 1 ? brokenSampleEvent() : SAMPLE_EVENT);

export function argonProposer(apiKey: string, model: string): Proposer {
  const client = new GoogleGenAI({ apiKey });
  return async (args) => {
    const input: Array<Record<string, unknown>> = [{ type: 'text', text: buildUserPrompt(args) }];
    if (args.image) input.push({ type: 'image', mime_type: args.image.mimeType, data: args.image.data });

    // Same Interactions call shape Morf uses. Untested without a real key: see CLAUDE.md.
    const result = (await client.interactions.create({
      model,
      input,
      system_instruction: SYSTEM,
      store: false,
      stream: false,
      generation_config: { thinking_level: 'low', max_output_tokens: 16_000 },
      response_format: { type: 'text', mime_type: 'application/json' },
    } as never)) as unknown as {
      status?: string;
      steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    };

    if (result.status && result.status !== 'completed') throw new Error(`Argon did not finish (status: ${result.status}).`);
    const text = (result.steps ?? [])
      .filter((s) => s.type === 'model_output')
      .flatMap((s) => s.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    if (!text) throw new Error('Argon returned no text.');
    return text;
  };
}

export interface ExtractOptions {
  notes: string;
  image?: ImageInput;
  apiKey?: string;
  model?: string;
  maxRounds?: number;
}

export async function extractEvent(opts: ExtractOptions, proposer?: Proposer): Promise<ExtractResult> {
  const mode: ExtractResult['mode'] = opts.apiKey || proposer ? 'argon' : 'mock';
  const rounds: Round[] = [];
  const fail = (error: string): ExtractResult => ({ ok: false, mode, rounds, error });

  if (!opts.notes.trim()) return fail('Add some notes first.');
  if (opts.notes.length > MAX_NOTES_CHARS) return fail(`Notes are too long. Keep them under ${MAX_NOTES_CHARS} characters.`);
  if (opts.image && opts.image.data.length * 0.75 > MAX_IMAGE_BYTES) return fail('That image is too big. Keep it under 4 MB.');

  let propose = proposer;
  if (!propose) {
    if (opts.apiKey) {
      propose = argonProposer(opts.apiKey, opts.model || 'gemini-4-argon');
    } else {
      if (normalize(opts.notes) !== normalize(SAMPLE_NOTES)) {
        return {
          ...fail('Mock mode only knows the sample notes. Put GEMINI_API_KEY in .env to use your own.'),
          mode: 'mock',
        };
      }
      propose = mockProposer;
    }
  }

  let previous: string | undefined;
  let problems: Problem[] = [];
  const max = opts.maxRounds ?? MAX_ROUNDS;

  for (let n = 1; n <= max; n++) {
    let raw: string;
    try {
      raw = await propose({ notes: opts.notes, image: opts.image, round: n, previous, problems });
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'The model call failed.');
    }

    let parsed: unknown;
    try {
      parsed = parseJson(raw);
    } catch {
      problems = [{ path: '(root)', message: 'The answer was not valid JSON. Return only one JSON object.' }];
      rounds.push({ n, problems });
      previous = raw.slice(0, 4000);
      continue;
    }

    const result = validateEvent(parsed, opts.notes);
    rounds.push({ n, problems: result.problems });
    if (result.event) return { ok: true, mode, event: result.event, rounds };

    problems = result.problems;
    previous = JSON.stringify(parsed);
  }

  return fail(`Still ${problems.length} problem${problems.length === 1 ? '' : 's'} after ${max} rounds. Try shorter notes or fix the ones listed.`);
}
