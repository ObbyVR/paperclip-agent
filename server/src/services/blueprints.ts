import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { blueprints, blueprintRuns } from "@paperclipai/db";
import type {
  Blueprint,
  BlueprintListItem,
  BlueprintRun,
  BlueprintRunDetail,
  BlueprintStepDef,
  BlueprintStepResult,
  CreateBlueprint,
  UpdateBlueprint,
  RunBlueprint,
  UpdateBlueprintRun,
  CompleteBlueprintStep,
} from "@paperclipai/shared";
import { conflict, notFound } from "../errors.js";
import { approvalService } from "./approvals.js";
import { logActivity } from "./activity-log.js";
import { executeStep } from "./blueprint-executors.js";

type Actor = { agentId?: string | null; userId?: string | null };

/** Returns the next eligible step: lowest order, not yet done, all deps satisfied. */
function findNextStep(
  steps: BlueprintStepDef[],
  stepResults: Record<string, BlueprintStepResult>,
): BlueprintStepDef | undefined {
  const eligible = steps.filter((step) => {
    const result = stepResults[step.id];
    if (
      result?.status === "completed" ||
      result?.status === "running" ||
      result?.status === "failed"
    ) {
      return false;
    }
    const deps = step.dependsOn ?? [];
    return deps.every((depId) => stepResults[depId]?.status === "completed");
  });
  return eligible.sort((a, b) => a.order - b.order)[0];
}

function collectPreviousOutputs(
  stepResults: Record<string, BlueprintStepResult>,
): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};
  for (const [stepId, result] of Object.entries(stepResults)) {
    if (result.status === "completed" && result.output) {
      outputs[`${stepId}_output`] = result.output;
    }
  }
  return outputs;
}

export function blueprintService(db: Db) {
  const approvalSvc = approvalService(db);
  async function list(companyId: string): Promise<BlueprintListItem[]> {
    const rows = await db
      .select({
        blueprint: blueprints,
        runCount: sql<number>`COALESCE((
          SELECT COUNT(*)::int FROM blueprint_runs
          WHERE blueprint_runs.blueprint_id = ${blueprints.id}
        ), 0)`,
        lastRunAt: sql<Date | null>`(
          SELECT MAX(created_at) FROM blueprint_runs
          WHERE blueprint_runs.blueprint_id = ${blueprints.id}
        )`,
      })
      .from(blueprints)
      .where(
        and(
          eq(blueprints.companyId, companyId),
          eq(blueprints.status, "published"),
        ),
      )
      .orderBy(desc(blueprints.updatedAt));

    return rows.map((r) => ({
      ...r.blueprint,
      runCount: r.runCount,
      lastRunAt: r.lastRunAt,
    })) as BlueprintListItem[];
  }

  async function listAll(companyId: string): Promise<BlueprintListItem[]> {
    const rows = await db
      .select({
        blueprint: blueprints,
        runCount: sql<number>`COALESCE((
          SELECT COUNT(*)::int FROM blueprint_runs
          WHERE blueprint_runs.blueprint_id = ${blueprints.id}
        ), 0)`,
        lastRunAt: sql<Date | null>`(
          SELECT MAX(created_at) FROM blueprint_runs
          WHERE blueprint_runs.blueprint_id = ${blueprints.id}
        )`,
      })
      .from(blueprints)
      .where(eq(blueprints.companyId, companyId))
      .orderBy(desc(blueprints.updatedAt));

    return rows.map((r) => ({
      ...r.blueprint,
      runCount: r.runCount,
      lastRunAt: r.lastRunAt,
    })) as BlueprintListItem[];
  }

  async function get(id: string): Promise<Blueprint | null> {
    const [row] = await db
      .select()
      .from(blueprints)
      .where(eq(blueprints.id, id))
      .limit(1);
    return (row as Blueprint) ?? null;
  }

  async function getBySlug(companyId: string, slug: string): Promise<Blueprint | null> {
    const [row] = await db
      .select()
      .from(blueprints)
      .where(and(eq(blueprints.companyId, companyId), eq(blueprints.slug, slug)))
      .limit(1);
    return (row as Blueprint) ?? null;
  }

  async function create(companyId: string, input: CreateBlueprint, actor: Actor): Promise<Blueprint> {
    const existing = await getBySlug(companyId, input.slug);
    if (existing) throw conflict(`Blueprint with slug "${input.slug}" already exists`);

    const [row] = await db
      .insert(blueprints)
      .values({
        companyId,
        slug: input.slug,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        icon: input.icon ?? null,
        version: input.version ?? "1.0.0",
        status: input.status ?? "draft",
        steps: input.steps,
        defaultParams: input.defaultParams ?? null,
        estimatedCostCents: input.estimatedCostCents ?? null,
        estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
        tags: input.tags ?? null,
        triggers: input.triggers ?? null,
        requiredSecrets: input.requiredSecrets ?? null,
        requiredTools: input.requiredTools ?? null,
        createdByUserId: actor.userId ?? null,
      })
      .returning();

    return row as Blueprint;
  }

  async function update(id: string, input: UpdateBlueprint): Promise<Blueprint> {
    const [row] = await db
      .update(blueprints)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(blueprints.id, id))
      .returning();

    if (!row) throw notFound("Blueprint not found");
    return row as Blueprint;
  }

  async function remove(id: string): Promise<void> {
    const result = await db.delete(blueprints).where(eq(blueprints.id, id)).returning();
    if (result.length === 0) throw notFound("Blueprint not found");
  }

  async function startRun(
    blueprintId: string,
    companyId: string,
    input: RunBlueprint,
    actor: Actor,
  ): Promise<BlueprintRun> {
    const bp = await get(blueprintId);
    if (!bp) throw notFound("Blueprint not found");

    const firstStep = bp.steps.sort((a, b) => a.order - b.order)[0];

    const [row] = await db
      .insert(blueprintRuns)
      .values({
        blueprintId,
        companyId,
        status: "running",
        currentStepId: firstStep?.id ?? null,
        params: input.params ?? null,
        stepResults: {},
        startedAt: new Date(),
        createdByUserId: actor.userId ?? null,
        createdByAgentId: actor.agentId ?? null,
      })
      .returning();

    // Automatically advance to first step
    return await advanceRun(row.id);
  }

  async function advanceRun(runId: string): Promise<BlueprintRun> {
    const runDetail = await getRun(runId);
    if (!runDetail) throw notFound("Blueprint run not found");

    if (runDetail.status !== "running") return runDetail as BlueprintRun;

    // No current step — check if all steps are done or find next
    if (!runDetail.currentStepId) {
      const allDone = runDetail.blueprint.steps.every((s) => {
        const r = runDetail.stepResults[s.id];
        return r?.status === "completed" || r?.status === "skipped";
      });
      if (allDone || runDetail.blueprint.steps.length === 0) {
        return await updateRun(runId, { status: "completed" });
      }
      // Find next eligible step
      const next = findNextStep(
        runDetail.blueprint.steps,
        runDetail.stepResults,
      );
      if (!next) return await updateRun(runId, { status: "completed" });
      await db
        .update(blueprintRuns)
        .set({ currentStepId: next.id, updatedAt: new Date() })
        .where(eq(blueprintRuns.id, runId));
      return await advanceRun(runId);
    }

    const steps = [...runDetail.blueprint.steps].sort((a, b) => a.order - b.order);
    const currentStep = steps.find((s) => s.id === runDetail.currentStepId);
    if (!currentStep) return runDetail as BlueprintRun;

    // Check dependencies
    const deps = currentStep.dependsOn ?? [];
    const depsOk = deps.every(
      (depId) => runDetail.stepResults[depId]?.status === "completed",
    );
    if (!depsOk) return runDetail as BlueprintRun;

    // Input step → requires user input via approval
    if (currentStep.type === "input") {
      await approvalSvc.create(runDetail.companyId, {
        type: "blueprint_step_input",
        payload: {
          blueprintRunId: runId,
          stepId: currentStep.id,
          stepTitle: currentStep.title,
          paramsSchema: currentStep.paramsSchema ?? null,
        },
      });
      return await updateRun(runId, { status: "paused" });
    }

    // Manual review step → requires human approval
    if (!currentStep.auto) {
      const prevOutput: Record<string, unknown> = {};
      for (const [key, result] of Object.entries(runDetail.stepResults)) {
        prevOutput[key] = result.output;
      }
      await approvalSvc.create(runDetail.companyId, {
        type: "blueprint_step_review",
        payload: {
          blueprintRunId: runId,
          stepId: currentStep.id,
          stepTitle: currentStep.title,
          stepOutput: prevOutput,
        },
      });
      return await updateRun(runId, { status: "paused" });
    }

    // Auto step — mark running, execute tool, then complete (phase 2: real execution for kling-fal)
    const runningResults: Record<string, BlueprintStepResult> = {
      ...runDetail.stepResults,
      [currentStep.id]: { status: "running", iterations: 0 },
    };

    await db
      .update(blueprintRuns)
      .set({
        stepResults: runningResults,
        currentStepId: currentStep.id,
        updatedAt: new Date(),
      })
      .where(eq(blueprintRuns.id, runId));

    let completedResults: Record<string, BlueprintStepResult>;
    let newTotalCost: number;

    try {
      const execResult = await executeStep(
        currentStep,
        { ...(runDetail.params ?? {}), ...collectPreviousOutputs(runDetail.stepResults) },
        { companyId: runDetail.companyId, runId },
      );

      completedResults = {
        ...runningResults,
        [currentStep.id]: {
          status: "completed",
          output: execResult.output,
          costCents: execResult.costCents,
          durationMs: execResult.durationMs,
          iterations: 1,
        },
      };
      newTotalCost = (runDetail.totalCostCents ?? 0) + execResult.costCents;
    } catch (err) {
      const failedResults: Record<string, BlueprintStepResult> = {
        ...runningResults,
        [currentStep.id]: {
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          iterations: 1,
        },
      };
      await db
        .update(blueprintRuns)
        .set({
          stepResults: failedResults,
          status: "failed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(blueprintRuns.id, runId));

      const [failedRun] = await db
        .select()
        .from(blueprintRuns)
        .where(eq(blueprintRuns.id, runId))
        .limit(1);
      return failedRun as BlueprintRun;
    }

    const nextStep = findNextStep(steps, completedResults);

    await db
      .update(blueprintRuns)
      .set({
        stepResults: completedResults,
        totalCostCents: newTotalCost,
        currentStepId: nextStep?.id ?? null,
        updatedAt: new Date(),
        ...(nextStep ? {} : { status: "completed", completedAt: new Date() }),
      })
      .where(eq(blueprintRuns.id, runId));

    if (!nextStep) {
      const [completed] = await db
        .select()
        .from(blueprintRuns)
        .where(eq(blueprintRuns.id, runId))
        .limit(1);
      return completed as BlueprintRun;
    }

    // Recurse to advance the next step
    return await advanceRun(runId);
  }

  async function completeStep(
    runId: string,
    stepId: string,
    input: CompleteBlueprintStep,
  ): Promise<BlueprintRun> {
    const runDetail = await getRun(runId);
    if (!runDetail) throw notFound("Blueprint run not found");

    const existing = runDetail.stepResults[stepId] ?? {};
    const iterations = ((existing as BlueprintStepResult).iterations ?? 0) + 1;
    const stepDef = runDetail.blueprint.steps.find((s) => s.id === stepId);
    const maxRetries = stepDef?.maxRetries ?? 1;

    const updatedStepResult: BlueprintStepResult = {
      ...(existing as BlueprintStepResult),
      status: input.status,
      output: input.output,
      costCents: input.costCents,
      variantChosen: input.variantChosen,
      iterations,
    };

    const updatedResults: Record<string, BlueprintStepResult> = {
      ...runDetail.stepResults,
      [stepId]: updatedStepResult,
    };

    const addedCost = input.costCents ?? 0;
    const newTotalCost = (runDetail.totalCostCents ?? 0) + addedCost;

    if (input.status === "failed") {
      if (iterations < maxRetries) {
        // Allow retry: reset to pending so advanceRun can pick it up again
        updatedResults[stepId] = { ...updatedStepResult, status: "pending" };
        const [updated] = await db
          .update(blueprintRuns)
          .set({
            stepResults: updatedResults,
            totalCostCents: newTotalCost,
            status: "running",
            updatedAt: new Date(),
          })
          .where(eq(blueprintRuns.id, runId))
          .returning();
        return updated as BlueprintRun;
      }
      // Max retries exceeded → run failed
      const [failed] = await db
        .update(blueprintRuns)
        .set({
          stepResults: updatedResults,
          totalCostCents: newTotalCost,
          status: "failed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(blueprintRuns.id, runId))
        .returning();
      return failed as BlueprintRun;
    }

    // Completed: find next eligible step
    const steps = [...runDetail.blueprint.steps].sort((a, b) => a.order - b.order);
    const nextStep = findNextStep(steps, updatedResults);

    await db
      .update(blueprintRuns)
      .set({
        stepResults: updatedResults,
        totalCostCents: newTotalCost,
        status: "running",
        currentStepId: nextStep?.id ?? null,
        updatedAt: new Date(),
        ...(nextStep ? {} : { status: "completed", completedAt: new Date() }),
      })
      .where(eq(blueprintRuns.id, runId));

    await logActivity(db, {
      companyId: runDetail.companyId,
      actorType: "system",
      actorId: "blueprint",
      action: "blueprint_step.completed",
      entityType: "blueprint_run",
      entityId: runId,
      details: { stepId, status: input.status, costCents: input.costCents ?? 0 },
    }).catch(() => {});

    if (!nextStep) {
      const [completed] = await db
        .select()
        .from(blueprintRuns)
        .where(eq(blueprintRuns.id, runId))
        .limit(1);
      return completed as BlueprintRun;
    }

    // Advance the next step
    return await advanceRun(runId);
  }

  async function getRun(runId: string): Promise<BlueprintRunDetail | null> {
    const [row] = await db
      .select({
        run: blueprintRuns,
        blueprintId: blueprints.id,
        blueprintSlug: blueprints.slug,
        blueprintTitle: blueprints.title,
        blueprintIcon: blueprints.icon,
        blueprintSteps: blueprints.steps,
      })
      .from(blueprintRuns)
      .innerJoin(blueprints, eq(blueprintRuns.blueprintId, blueprints.id))
      .where(eq(blueprintRuns.id, runId))
      .limit(1);

    if (!row) return null;

    return {
      ...(row.run as BlueprintRun),
      blueprint: {
        id: row.blueprintId,
        slug: row.blueprintSlug,
        title: row.blueprintTitle,
        icon: row.blueprintIcon,
        steps: row.blueprintSteps as BlueprintRunDetail["blueprint"]["steps"],
      },
    };
  }

  async function listRuns(blueprintId: string): Promise<BlueprintRun[]> {
    const rows = await db
      .select()
      .from(blueprintRuns)
      .where(eq(blueprintRuns.blueprintId, blueprintId))
      .orderBy(desc(blueprintRuns.createdAt))
      .limit(50);

    return rows as BlueprintRun[];
  }

  async function updateRun(runId: string, input: UpdateBlueprintRun): Promise<BlueprintRun> {
    const [row] = await db
      .update(blueprintRuns)
      .set({
        ...(input.status ? { status: input.status } : {}),
        ...(input.currentStepId !== undefined ? { currentStepId: input.currentStepId } : {}),
        ...(input.stepResults ? { stepResults: input.stepResults as Record<string, BlueprintStepResult> } : {}),
        updatedAt: new Date(),
        ...(input.status === "completed" || input.status === "failed" || input.status === "cancelled"
          ? { completedAt: new Date() }
          : {}),
      })
      .where(eq(blueprintRuns.id, runId))
      .returning();

    if (!row) throw notFound("Blueprint run not found");
    return row as BlueprintRun;
  }

  return {
    list,
    listAll,
    get,
    getBySlug,
    create,
    update,
    remove,
    startRun,
    getRun,
    listRuns,
    updateRun,
    advanceRun,
    completeStep,
  };
}
