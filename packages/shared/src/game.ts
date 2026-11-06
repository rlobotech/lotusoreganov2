import { z } from 'zod';

export const RACES = ['human', 'elf', 'dwarf', 'orc'] as const;
export const CLASS_IDS = ['warrior', 'mage', 'priest', 'ranger'] as const;

export const raceSchema = z.enum(RACES);
export const classSchema = z.enum(CLASS_IDS);

export const memberInputSchema = z.object({
  name: z.string().trim().min(1).max(20),
  race: raceSchema,
  cls: classSchema,
});

export const createPartySchema = z.object({
  name: z.string().trim().min(2).max(30),
  mode: z.enum(['standard', 'hardcore']).default('standard'),
  members: z.array(memberInputSchema).min(2).max(6),
});
export type CreatePartyInput = z.infer<typeof createPartySchema>;

export const addOrderSchema = z.object({ siteId: z.string().min(1).max(64) });

export const seenSchema = z.object({ upTo: z.number().int().min(0) });
