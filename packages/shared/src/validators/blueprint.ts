import { z } from "zod";

const BLUEPRINT_STATUSES = ["draft", "published", "archived"] as const;
const BLUEPRINT_RUN_STATUSES = ["pending", "running", "paused", "completed", "failed", "cancelled"] as const;
const BLUEPRINT_STEP_TYPES = ["generate", "review", "integrate", "deploy", "input"] as const;
const BLUEPRINT_OUTPUT_TYPES = ["html", "video", "image", "url", "text", "file"] as const;

const blueprintStepDefSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().optional(),
  order: z.number().int().min(0),
  type: z.enum(BLUEPRINT_STEP_TYPES),
  provider: z.string().optional(),
  auto: z.boolean(),
  paramsSchema: z.record(z.unknown()).optional(),
  outputType: z.enum(BLUEPRINT_OUTPUT_TYPES).optional(),
  costEstimateCents: z.number().int().min(0).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  dependsOn: z.array(z.string()).optional(),
  variants: z.number().int().min(1).max(10).optional(),
});

export const createBlueprintSchema = z.object({
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(1).max(200),
  description: z.string().optional().nullable(),
  category: z.string().trim().max(50).optional().nullable(),
  icon: z.string().trim().max(10).optional().nullable(),
  version: z.string().trim().max(20).optional().default("1.0.0"),
  status: z.enum(BLUEPRINT_STATUSES).optional().default("draft"),
  steps: z.array(blueprintStepDefSchema).min(1),
  defaultParams: z.record(z.unknown()).optional().nullable(),
  estimatedCostCents: z.number().int().min(0).optional().nullable(),
  estimatedDurationMinutes: z.number().int().min(0).optional().nullable(),
  tags: z.array(z.string().trim().max(50)).optional().nullable(),
  triggers: z.array(z.string().trim().max(200)).optional().nullable(),
  requiredSecrets: z.array(z.string().trim().max(100)).optional().nullable(),
  requiredTools: z.array(z.string().trim().max(100)).optional().nullable(),
});

export type CreateBlueprint = z.infer<typeof createBlueprintSchema>;

export const updateBlueprintSchema = createBlueprintSchema.partial();
export type UpdateBlueprint = z.infer<typeof updateBlueprintSchema>;

export const runBlueprintSchema = z.object({
  params: z.record(z.unknown()).optional().nullable(),
});

export type RunBlueprint = z.infer<typeof runBlueprintSchema>;

export const updateBlueprintRunSchema = z.object({
  status: z.enum(BLUEPRINT_RUN_STATUSES).optional(),
  currentStepId: z.string().optional().nullable(),
  stepResults: z.record(z.unknown()).optional(),
});

export type UpdateBlueprintRun = z.infer<typeof updateBlueprintRunSchema>;

export const completeBlueprintStepSchema = z.object({
  status: z.enum(["completed", "failed"]),
  output: z.unknown().optional(),
  costCents: z.number().int().min(0).optional(),
  variantChosen: z.number().int().min(0).optional(),
});

export type CompleteBlueprintStep = z.infer<typeof completeBlueprintStepSchema>;
