import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { notificationService } from "../services/notifications.js";
import { assertCompanyAccess } from "./authz.js";

export function notificationRoutes(db: Db) {
  const router = Router();
  const svc = notificationService(db);

  /** List notifications for the current user */
  router.get("/companies/:companyId/notifications", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const userId = req.actor.type === "board" ? req.actor.userId : undefined;
    const includeRead = req.query.includeRead === "true";
    const includeDismissed = req.query.includeDismissed === "true";
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const items = await svc.list(companyId, { userId, includeRead, includeDismissed, limit });
    res.json(items);
  });

  /** Count unread notifications by severity */
  router.get("/companies/:companyId/notifications/count", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const userId = req.actor.type === "board" ? req.actor.userId : undefined;
    const counts = await svc.countUnread(companyId, userId);
    res.json(counts);
  });

  /** Mark a single notification as read */
  router.patch("/companies/:companyId/notifications/:notificationId/read", async (req, res) => {
    const { companyId, notificationId } = req.params;
    assertCompanyAccess(req, companyId);

    await svc.markRead(notificationId, companyId);
    res.json({ ok: true });
  });

  /** Mark all notifications as read */
  router.patch("/companies/:companyId/notifications/read-all", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const userId = req.actor.type === "board" ? req.actor.userId : undefined;
    await svc.markAllRead(companyId, userId);
    res.json({ ok: true });
  });

  /** Dismiss a notification */
  router.patch("/companies/:companyId/notifications/:notificationId/dismiss", async (req, res) => {
    const { companyId, notificationId } = req.params;
    assertCompanyAccess(req, companyId);

    await svc.dismiss(notificationId, companyId);
    res.json({ ok: true });
  });

  return router;
}
