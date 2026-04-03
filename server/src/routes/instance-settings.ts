import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { patchInstanceExperimentalSettingsSchema, patchInstanceGeneralSettingsSchema, isValidAiTierKey } from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { instanceSettingsService, logActivity } from "../services/index.js";
import { getActorInfo } from "./authz.js";

function assertCanManageInstanceSettings(req: Request) {
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
  if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
    return;
  }
  throw forbidden("Instance admin access required");
}

export function instanceSettingsRoutes(db: Db) {
  const router = Router();
  const svc = instanceSettingsService(db);

  router.get("/instance/settings/general", async (req, res) => {
    assertCanManageInstanceSettings(req);
    res.json(await svc.getGeneral());
  });

  router.patch(
    "/instance/settings/general",
    validate(patchInstanceGeneralSettingsSchema),
    async (req, res) => {
      assertCanManageInstanceSettings(req);
      const updated = await svc.updateGeneral(req.body);
      const actor = getActorInfo(req);
      const companyIds = await svc.listCompanyIds();
      await Promise.all(
        companyIds.map((companyId) =>
          logActivity(db, {
            companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "instance.settings.general_updated",
            entityType: "instance_settings",
            entityId: updated.id,
            details: {
              general: updated.general,
              changedKeys: Object.keys(req.body).sort(),
            },
          }),
        ),
      );
      res.json(updated.general);
    },
  );

  router.get("/instance/settings/experimental", async (req, res) => {
    assertCanManageInstanceSettings(req);
    res.json(await svc.getExperimental());
  });

  router.patch(
    "/instance/settings/experimental",
    validate(patchInstanceExperimentalSettingsSchema),
    async (req, res) => {
      assertCanManageInstanceSettings(req);
      const updated = await svc.updateExperimental(req.body);
      const actor = getActorInfo(req);
      const companyIds = await svc.listCompanyIds();
      await Promise.all(
        companyIds.map((companyId) =>
          logActivity(db, {
            companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "instance.settings.experimental_updated",
            entityType: "instance_settings",
            entityId: updated.id,
            details: {
              experimental: updated.experimental,
              changedKeys: Object.keys(req.body).sort(),
            },
          }),
        ),
      );
      res.json(updated.experimental);
    },
  );

  // --- Global AI Tier (board access, no admin required) ---

  function assertBoardAccess(req: Request) {
    if (req.actor.type !== "board") {
      throw forbidden("Board access required");
    }
  }

  router.get("/instance/settings/global-ai-tier", async (req, res) => {
    assertBoardAccess(req);
    const general = await svc.getGeneral();
    res.json({ globalAiTier: general.globalAiTier });
  });

  router.put("/instance/settings/global-ai-tier", async (req, res) => {
    assertBoardAccess(req);
    const { tier } = req.body ?? {};
    if (tier !== null && !isValidAiTierKey(tier)) {
      res.status(400).json({ error: "Invalid tier. Valid: estremo, alto, bilanciato, basso" });
      return;
    }
    const updated = await svc.updateGeneral({ globalAiTier: tier ?? null });
    const actor = getActorInfo(req);
    const companyIds = await svc.listCompanyIds();
    await Promise.all(
      companyIds.map((companyId) =>
        logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "instance.settings.global_ai_tier_updated",
          entityType: "instance_settings",
          entityId: updated.id,
          details: { globalAiTier: tier ?? null },
        }),
      ),
    );
    res.json({ globalAiTier: updated.general.globalAiTier });
  });

  return router;
}
