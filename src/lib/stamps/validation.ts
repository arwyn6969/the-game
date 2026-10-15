import { z } from "zod";
import type { StampAppearance } from "./types";

export const stampScopeSchema = z
  .object({
    worldId: z.string().regex(/^world_[0-9a-f]{64}$/),
    characterId: z.string().regex(/^character_[0-9a-f]{64}$/),
  })
  .strict();
export const stampCropSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    size: z.number().finite().min(0.1).max(1),
  })
  .strict()
  .refine((crop) => crop.x + crop.size <= 1.000001 && crop.y + crop.size <= 1.000001);
export const stampCpidSchema = z
  .string()
  .regex(/^(?:[A-Z][A-Z0-9]{3,30}|[A-Z][A-Z0-9]{3,30}\.[a-zA-Z0-9._-]{1,160})$/);
export const stampViewSchema = z
  .object({ scope: stampScopeSchema, page: z.number().int().min(1).max(1000).optional() })
  .strict();
export const stampBeginSchema = z
  .object({ scope: stampScopeSchema, address: z.string().min(14).max(90) })
  .strict();
export const stampFinishSchema = z
  .object({
    scope: stampScopeSchema,
    challengeId: z.string().min(16).max(80),
    address: z.string().min(14).max(90),
    message: z.string().min(1).max(4096),
    signature: z.string().min(4).max(256),
  })
  .strict();
export const stampChooseSchema = z
  .object({
    scope: stampScopeSchema,
    cpid: stampCpidSchema,
    mode: z.enum(["portrait", "head"]),
    crop: stampCropSchema,
  })
  .strict();
export const stampPreviewSchema = z
  .object({ scope: stampScopeSchema, cpid: stampCpidSchema })
  .strict();
export const stampScopeInputSchema = z.object({ scope: stampScopeSchema }).strict();

const appearanceSchema = stampScopeSchema
  .extend({
    cpid: stampCpidSchema,
    stampNumber: z.number().int().nonnegative().nullable(),
    title: z.string().min(1).max(160),
    mode: z.enum(["portrait", "head"]),
    crop: stampCropSchema,
    pngDataUrl: z
      .string()
      .max(400_000)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    verifiedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

/** Safe display input; this check is not evidence of blockchain ownership. */
export function isStampAppearance(value: unknown): value is StampAppearance {
  const result = appearanceSchema.safeParse(value);
  return result.success && result.data.expiresAt > result.data.verifiedAt;
}
