import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const blueprints = pgTable(
  "blueprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category"),
    icon: text("icon"),
    version: text("version").notNull().default("1.0.0"),
    status: text("status").notNull().default("draft"),
    steps: jsonb("steps").notNull().$type<BlueprintStepDef[]>(),
    defaultParams: jsonb("default_params").$type<Record<string, unknown>>(),
    estimatedCostCents: integer("estimated_cost_cents"),
    estimatedDurationMinutes: integer("estimated_duration_minutes"),
    tags: text("tags").array(),
    triggers: text("triggers").array(),
    requiredSecrets: text("required_secrets").array(),
    requiredTools: text("required_tools").array(),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("blueprints_company_status_idx").on(table.companyId, table.status),
    slugUq: uniqueIndex("blueprints_slug_company_uq").on(table.companyId, table.slug),
  }),
);

export const blueprintRuns = pgTable(
  "blueprint_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blueprintId: uuid("blueprint_id").notNull().references(() => blueprints.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    currentStepId: text("current_step_id"),
    params: jsonb("params").$type<Record<string, unknown>>(),
    stepResults: jsonb("step_results").$type<Record<string, BlueprintStepResult>>().notNull().default({}),
    totalCostCents: integer("total_cost_cents").notNull().default(0),
    totalDurationMs: integer("total_duration_ms").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id"),
    createdByAgentId: uuid("created_by_agent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    blueprintIdx: index("blueprint_runs_blueprint_idx").on(table.blueprintId, table.createdAt),
    companyStatusIdx: index("blueprint_runs_company_status_idx").on(table.companyId, table.status),
  }),
);

/** Shape stored in the `steps` jsonb column of `blueprints`. */
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

/** Shape stored in the `step_results` jsonb column of `blueprint_runs`. */
export interface BlueprintStepResult {
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output?: unknown;
  costCents?: number;
  durationMs?: number;
  iterations?: number;
  error?: string;
  variantChosen?: number;
}
