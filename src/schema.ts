import { z } from 'zod';

/**
 * The contract between the model and the renderer.
 * Units are metres. Origin is the north-west corner of the room,
 * x runs east, z runs south. Every shape is an axis-aligned box given by
 * its centre (x, z) and its size (w along x, d along z).
 */

export const FEATURE_KINDS = ['stage', 'bar', 'table', 'booth', 'sofa', 'screen', 'plant', 'door'] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

const metre = z.number().finite();
const size = z.number().finite().positive().max(40);

export const FeatureSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(FEATURE_KINDS),
  label: z.string().max(40).optional(),
  x: metre,
  z: metre,
  w: size,
  d: size,
});

export const VenueSchema = z.object({
  name: z.string().min(1).max(80),
  width: z.number().finite().min(6).max(80),
  depth: z.number().finite().min(6).max(80),
  features: z.array(FeatureSchema).max(60),
});

export const PERSON_KINDS = ['met', 'heard'] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

export const PersonSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  /** met = you talked to them. heard = you listened to them or overheard them. */
  kind: z.enum(PERSON_KINDS),
  /** 1 = first person of the night. Used for the route line and the "#n of the night" tag. */
  order: z.number().int().min(1).max(200),
  role: z.string().max(80).optional(),
  company: z.string().max(80).optional(),
  x: metre,
  z: metre,
  /** Plain words for where they were, e.g. "by the bar". */
  spot: z.string().max(80).optional(),
  topics: z.array(z.string().max(40)).max(6),
  summary: z.string().min(1).max(400),
  /** Must be copied character for character from the notes. */
  quote: z.string().max(240).optional(),
  /** Only if the notes contain the URL. */
  linkedin: z.string().max(200).optional(),
  /** One sentence the user could send to follow up. */
  reachOut: z.string().min(1).max(300),
});

export const EventSchema = z.object({
  venue: VenueSchema,
  people: z.array(PersonSchema).max(40),
});

export type Feature = z.infer<typeof FeatureSchema>;
export type Venue = z.infer<typeof VenueSchema>;
export type Person = z.infer<typeof PersonSchema>;
export type EventData = z.infer<typeof EventSchema>;
