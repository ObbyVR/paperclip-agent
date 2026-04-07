import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createBlueprintSchema,
  updateBlueprintSchema,
  runBlueprintSchema,
  updateBlueprintRunSchema,
  completeBlueprintStepSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { blueprintService } from "../services/blueprints.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { BUILT_IN_BLUEPRINTS } from "../services/blueprint-seeds.js";

export function blueprintRoutes(db: Db) {
  const router = Router();
  const svc = blueprintService(db);

  // List published blueprints for a company
  router.get("/companies/:companyId/blueprints", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const all = req.query.all === "true";
    const result = all ? await svc.listAll(companyId) : await svc.list(companyId);
    res.json(result);
  });

  // Get a single blueprint
  router.get("/blueprints/:blueprintId", async (req, res) => {
    const bp = await svc.get(req.params.blueprintId as string);
    if (!bp) { res.status(404).json({ error: "Blueprint not found" }); return; }
    if (bp.companyId) assertCompanyAccess(req, bp.companyId);
    res.json(bp);
  });

  // Get blueprint by slug
  router.get("/companies/:companyId/blueprints/slug/:slug", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const bp = await svc.getBySlug(companyId, req.params.slug as string);
    if (!bp) { res.status(404).json({ error: "Blueprint not found" }); return; }
    res.json(bp);
  });

  // Create blueprint (board only)
  router.post("/companies/:companyId/blueprints", validate(createBlueprintSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const created = await svc.create(companyId, req.body, {
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "blueprint.created",
      entityType: "blueprint",
      entityId: created.id,
      details: { title: created.title, slug: created.slug },
    });
    res.status(201).json(created);
  });

  // Update blueprint
  router.patch("/blueprints/:blueprintId", validate(updateBlueprintSchema), async (req, res) => {
    assertBoard(req);
    const bp = await svc.get(req.params.blueprintId as string);
    if (!bp) { res.status(404).json({ error: "Blueprint not found" }); return; }
    if (bp.companyId) assertCompanyAccess(req, bp.companyId);
    const updated = await svc.update(bp.id, req.body);
    res.json(updated);
  });

  // Delete blueprint
  router.delete("/blueprints/:blueprintId", async (req, res) => {
    assertBoard(req);
    const bp = await svc.get(req.params.blueprintId as string);
    if (!bp) { res.status(404).json({ error: "Blueprint not found" }); return; }
    if (bp.companyId) assertCompanyAccess(req, bp.companyId);
    await svc.remove(bp.id);
    res.status(204).end();
  });

  // Start a blueprint run
  router.post("/blueprints/:blueprintId/runs", validate(runBlueprintSchema), async (req, res) => {
    const bp = await svc.get(req.params.blueprintId as string);
    if (!bp) { res.status(404).json({ error: "Blueprint not found" }); return; }
    if (bp.companyId) assertCompanyAccess(req, bp.companyId);
    const actor = getActorInfo(req);
    const run = await svc.startRun(bp.id, bp.companyId!, req.body, {
      agentId: actor.agentId,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logActivity(db, {
      companyId: bp.companyId!,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "blueprint_run.started",
      entityType: "blueprint_run",
      entityId: run.id,
      details: { blueprintTitle: bp.title, blueprintSlug: bp.slug },
    });
    res.status(201).json(run);
  });

  // List runs for a blueprint
  router.get("/blueprints/:blueprintId/runs", async (req, res) => {
    const bp = await svc.get(req.params.blueprintId as string);
    if (!bp) { res.status(404).json({ error: "Blueprint not found" }); return; }
    if (bp.companyId) assertCompanyAccess(req, bp.companyId);
    const runs = await svc.listRuns(bp.id);
    res.json(runs);
  });

  // Get a specific run
  router.get("/blueprint-runs/:runId", async (req, res) => {
    const run = await svc.getRun(req.params.runId as string);
    if (!run) { res.status(404).json({ error: "Blueprint run not found" }); return; }
    assertCompanyAccess(req, run.companyId);
    res.json(run);
  });

  // Update a run (advance step, change status)
  router.patch("/blueprint-runs/:runId", validate(updateBlueprintRunSchema), async (req, res) => {
    const existing = await svc.getRun(req.params.runId as string);
    if (!existing) { res.status(404).json({ error: "Blueprint run not found" }); return; }
    assertCompanyAccess(req, existing.companyId);
    const updated = await svc.updateRun(existing.id, req.body);
    res.json(updated);
  });

  // Complete a specific step (e.g. after human approval/review)
  router.post(
    "/blueprint-runs/:runId/steps/:stepId/complete",
    validate(completeBlueprintStepSchema),
    async (req, res) => {
      const { runId, stepId } = req.params as { runId: string; stepId: string };
      const existing = await svc.getRun(runId);
      if (!existing) { res.status(404).json({ error: "Blueprint run not found" }); return; }
      assertCompanyAccess(req, existing.companyId);
      const updated = await svc.completeStep(runId, stepId, req.body);
      res.json(updated);
    },
  );

  // Seed built-in blueprints for a company
  router.post("/companies/:companyId/blueprints/seed", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const created = [];
    for (const bp of BUILT_IN_BLUEPRINTS) {
      const existing = await svc.getBySlug(companyId, bp.slug);
      if (existing) continue;
      const row = await svc.create(companyId, bp, {
        userId: actor.actorType === "user" ? actor.actorId : null,
      });
      created.push(row);
    }
    res.json({ seeded: created.length, blueprints: created });
  });

  return router;
}
