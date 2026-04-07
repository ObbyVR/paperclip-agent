export interface BlueprintStepDef {
  id: string;
  title: string;
  description?: string;
  order: number;
  type: "generate" | "review" | "integrate" | "deploy" | "input";
  provider?: string;
  auto: boolean;
  paramsSchema?: Record<string, unknown>;
  outputType?: "html" | "video" | "image" | "url" | "text" | "file";
  costEstimateCents?: number;
  maxRetries?: number;
  dependsOn?: string[];
  variants?: number;
}

export interface BlueprintStepResult {
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output?: unknown;
  costCents?: number;
  durationMs?: number;
  iterations?: number;
  error?: string;
  variantChosen?: number;
}

export interface Blueprint {
  id: string;
  companyId: string | null;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  version: string;
  status: string;
  steps: BlueprintStepDef[];
  defaultParams: Record<string, unknown> | null;
  estimatedCostCents: number | null;
  estimatedDurationMinutes: number | null;
  tags: string[] | null;
  triggers: string[] | null;
  requiredSecrets: string[] | null;
  requiredTools: string[] | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BlueprintListItem extends Blueprint {
  runCount: number;
  lastRunAt: Date | null;
}

export interface BlueprintRun {
  id: string;
  blueprintId: string;
  companyId: string;
  status: string;
  currentStepId: string | null;
  params: Record<string, unknown> | null;
  stepResults: Record<string, BlueprintStepResult>;
  totalCostCents: number;
  totalDurationMs: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BlueprintRunDetail extends BlueprintRun {
  blueprint: Pick<Blueprint, "id" | "slug" | "title" | "icon" | "steps">;
}
