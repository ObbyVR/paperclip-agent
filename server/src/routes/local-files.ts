import { Router } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import type { DeploymentMode } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";

const MIME_MAP: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".xml": "application/xml",
  ".zip": "application/zip",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

function lookupMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

/**
 * Serves local workspace files — only available in local_trusted mode.
 * Restricted to paths under the Paperclip instance root or known workspace directories.
 */
export function localFileRoutes(deploymentMode: DeploymentMode) {
  const router = Router();

  if (deploymentMode !== "local_trusted") {
    return router;
  }

  // In local_trusted mode the user owns the machine — allow any non-system path.
  // Block only OS-critical directories to avoid accidental serving of system files.
  const BLOCKED_PREFIXES = ["/etc", "/var", "/System", "/Library", "/usr", "/sbin", "/bin", "/private/etc"];

  function isPathAllowed(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    if (BLOCKED_PREFIXES.some((p) => resolved === p || resolved.startsWith(p + path.sep))) return false;
    return true;
  }

  /**
   * GET /local-files/serve?path=<absolute-path>
   * Serves a single file from an allowed workspace directory.
   */
  router.get("/local-files/serve", async (req, res) => {
    const filePath = req.query.path as string | undefined;
    if (!filePath || typeof filePath !== "string") {
      res.status(400).json({ error: "Missing 'path' query parameter" });
      return;
    }

    const resolved = path.resolve(filePath);

    if (!isPathAllowed(resolved)) {
      logger.warn({ filePath: resolved }, "local-files: path not in allowed roots");
      res.status(403).json({ error: "Path not in allowed workspace directories" });
      return;
    }

    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) {
        res.status(400).json({ error: "Path is not a file" });
        return;
      }

      const contentType = lookupMime(resolved);
      const filename = path.basename(resolved);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", String(stat.size));
      res.setHeader("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
      res.setHeader("Cache-Control", "private, no-cache");

      // Sandbox HTML files for safety
      if (contentType === "text/html") {
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; img-src * data:; font-src https: data:;",
        );
      }

      createReadStream(resolved).pipe(res);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({ error: "File not found" });
        return;
      }
      logger.error({ err, filePath: resolved }, "local-files: failed to serve file");
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  /**
   * GET /local-files/list?dir=<absolute-path>&extensions=html,css,js
   * Lists files in a workspace directory (non-recursive, max 100 entries).
   */
  router.get("/local-files/list", async (req, res) => {
    const dirPath = req.query.dir as string | undefined;
    const extensionsRaw = req.query.extensions as string | undefined;

    if (!dirPath || typeof dirPath !== "string") {
      res.status(400).json({ error: "Missing 'dir' query parameter" });
      return;
    }

    const resolved = path.resolve(dirPath);

    if (!isPathAllowed(resolved)) {
      res.status(403).json({ error: "Path not in allowed workspace directories" });
      return;
    }

    const allowedExtensions = extensionsRaw
      ? new Set(extensionsRaw.split(",").map((e) => e.trim().toLowerCase()))
      : null;

    try {
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const files: Array<{
        name: string;
        path: string;
        size: number;
        type: string;
        modifiedAt: string;
      }> = [];

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (allowedExtensions && !allowedExtensions.has(ext)) continue;

        const fullPath = path.join(resolved, entry.name);
        try {
          const stat = await fs.stat(fullPath);
          files.push({
            name: entry.name,
            path: fullPath,
            size: stat.size,
            type: lookupMime(fullPath),
            modifiedAt: stat.mtime.toISOString(),
          });
        } catch {
          // Skip files we can't stat
        }

        if (files.length >= 100) break;
      }

      // Sort by modification time descending
      files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

      res.json({ dir: resolved, files });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({ error: "Directory not found" });
        return;
      }
      res.status(500).json({ error: "Failed to list directory" });
    }
  });

  return router;
}
