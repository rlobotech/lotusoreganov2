import { z } from 'zod';

export const RACES = ['human', 'elf', 'dwarf', 'orc'] as const;
export const CLASS_IDS = ['warrior', 'mage', 'priest', 'ranger', 'rogue'] as const;

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

export const SLOT_NAMES = ['weapon', 'offhand', 'head', 'body', 'feet', 'ring', 'charm'] as const;
const idStr = z.string().min(1).max(80);

export const equipSchema = z.object({ memberId: idStr, itemId: idStr });
export const learnSchema = z.object({ memberId: idStr, itemId: idStr });
export const unequipSchema = z.object({ memberId: idStr, slot: z.enum(SLOT_NAMES) });
export const moveItemSchema = z.object({
  itemId: idStr,
  to: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('bag') }),
    z.object({ kind: z.literal('personal'), memberId: idStr }),
    z.object({ kind: z.literal('equip'), memberId: idStr, slot: z.enum(SLOT_NAMES).optional() }),
  ]),
});
export const favoriteSchema = z.object({ value: z.boolean() });
export const allocSchema = z.object({
  alloc: z.object({
    str: z.number().int().min(0).max(100).optional(),
    dex: z.number().int().min(0).max(100).optional(),
    int: z.number().int().min(0).max(100).optional(),
    vit: z.number().int().min(0).max(100).optional(),
    wis: z.number().int().min(0).max(100).optional(),
  }),
});
export const autoAllocSchema = z.object({ auto: z.boolean() });
/** The rules themselves are checked by the game rules (world package), which know the skills. */
export const aiSchema = z.object({ rules: z.array(z.record(z.string(), z.unknown())).max(32) });
export const sellSchema = z.object({ itemIds: z.array(idStr).min(1).max(40) });
export const buySchema = z.object({ stockId: idStr });
export const sendGoldSchema = z.object({
  fromId: idStr,
  toId: idStr,
  amount: z.number().int().min(1).max(1_000_000_000),
});
export const teleportSchema = z.object({ siteId: idStr });
export const moveOrderSchema = z.object({ dir: z.union([z.literal(-1), z.literal(1)]) });
