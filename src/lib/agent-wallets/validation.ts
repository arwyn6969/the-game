import { z } from "zod";
import { AGENT_IDS } from "../../game/types";

export function ownerRequestSchema<T extends z.ZodTypeAny>(input: T) {
  return z.object({ expectedOwnerRef: z.string().regex(/^owner_[0-9a-f]{64}$/), input }).strict();
}

export const registrationIdSchema = z.string().regex(/^registration_[0-9a-f]{64}$/);
export const residentIdSchema = z.string().regex(/^resident_[0-9a-f]{64}$/);
export const profileIdSchema = z.string().regex(/^profile_[0-9a-f]{64}$/);
export const worldRegistrationSchema = z
  .object({
    sourceWorldId: z.string().regex(/^world_[0-9a-f]{64}$/),
    title: z.string().trim().min(1).max(80),
    characters: z
      .array(
        z
          .object({
            role: z.enum(AGENT_IDS),
            sourceCharacterId: z.string().regex(/^character_[0-9a-f]{64}$/),
            name: z.string().trim().min(1).max(80),
          })
          .strict(),
      )
      .length(AGENT_IDS.length),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.characters.map((c) => c.role)).size === AGENT_IDS.length &&
      new Set(value.characters.map((c) => c.sourceCharacterId)).size === AGENT_IDS.length,
  );
export const sourceWorldSchema = z
  .object({ sourceWorldId: z.string().regex(/^world_[0-9a-f]{64}$/) })
  .strict();
export const registeredWorldSchema = z.object({ registrationId: registrationIdSchema }).strict();
export const profileScopeSchema = z
  .object({
    registrationId: registrationIdSchema,
    profileId: profileIdSchema,
  })
  .strict();
export const beginReceivingSchema = profileScopeSchema
  .extend({
    revision: z.number().int().nonnegative().safe(),
    address: z.string().min(14).max(90),
  })
  .strict();
export const finishReceivingSchema = profileScopeSchema
  .extend({
    challengeId: z.string().regex(/^[0-9a-f]{48}$/),
    address: z.string().min(14).max(90),
    message: z.string().min(1).max(4096),
    signature: z.string().min(4).max(256),
  })
  .strict();
export const retireReceivingSchema = profileScopeSchema
  .extend({ revision: z.number().int().nonnegative().safe() })
  .strict();
export const receivingInventorySchema = profileScopeSchema
  .extend({ page: z.number().int().min(1).max(1000).optional() })
  .strict();
