import { describe, expect, it } from 'vitest';
import { SAMPLE_EVENT, SAMPLE_NOTES } from '../src/sample';
import { buildUserPrompt, extractEvent, parseJson, type Proposer } from './extract';

describe('extractEvent', () => {
  it('mock mode: round 1 has 3 problems, round 2 is clean', async () => {
    const result = await extractEvent({ notes: SAMPLE_NOTES });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('mock');
    expect(result.rounds.map((r) => r.problems.length)).toEqual([3, 0]);
    expect(result.event?.people).toHaveLength(SAMPLE_EVENT.people.length);
  });

  it('mock mode refuses notes it does not know', async () => {
    const result = await extractEvent({ notes: 'I met someone named Pat.' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/GEMINI_API_KEY/);
  });

  it('feeds the problems back to the model on the next round', async () => {
    const seen: string[] = [];
    const proposer: Proposer = async (args) => {
      seen.push(buildUserPrompt(args));
      return JSON.stringify(args.round === 1 ? { venue: { name: 'x' }, people: [] } : SAMPLE_EVENT);
    };
    const result = await extractEvent({ notes: SAMPLE_NOTES }, proposer);
    expect(result.ok).toBe(true);
    expect(seen[0]).not.toMatch(/checker found/);
    expect(seen[1]).toMatch(/checker found these problems/);
    expect(seen[1]).toMatch(/venue/);
  });

  it('gives up after the round limit', async () => {
    const proposer: Proposer = async () => JSON.stringify({ venue: { name: 'x' }, people: [] });
    const result = await extractEvent({ notes: SAMPLE_NOTES }, proposer);
    expect(result.ok).toBe(false);
    expect(result.rounds).toHaveLength(3);
    expect(result.error).toMatch(/after 3 rounds/);
  });

  it('recovers from non-JSON answers', async () => {
    const proposer: Proposer = async (args) => (args.round === 1 ? 'Sure! Here you go.' : JSON.stringify(SAMPLE_EVENT));
    const result = await extractEvent({ notes: SAMPLE_NOTES }, proposer);
    expect(result.ok).toBe(true);
    expect(result.rounds[0]?.problems[0]?.message).toMatch(/not valid JSON/);
  });

  it('reports model errors without throwing', async () => {
    const proposer: Proposer = async () => {
      throw new Error('quota exceeded');
    };
    const result = await extractEvent({ notes: SAMPLE_NOTES }, proposer);
    expect(result).toMatchObject({ ok: false, error: 'quota exceeded' });
  });
});

describe('parseJson', () => {
  it('strips markdown fences', () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});
