/**
 * Shared Cortex utilities — avoid duplication across pages.
 */

/** Rewrite old-platform internal links to Cortex routes */
export function rewriteInternalUrl(url: string): string {
  return url.replace(
    /\/([^/]+)\/(inbox|issues|dashboard|settings)(\/|$)/g,
    (match, prefix, page, trail) => {
      if (match.includes("/cortex/")) return match;
      return `/${prefix}/cortex/${page}${trail}`;
    },
  );
}

/** Issue status labels (IT) */
export const STATUS_LABEL: Record<string, string> = {
  in_progress: "In corso",
  todo: "Da fare",
  blocked: "Bloccato",
  in_review: "In review",
  done: "Fatto",
  cancelled: "Annullato",
  backlog: "Backlog",
};

/** Image file extensions for icon detection */
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

/** Build a map of comment-id → inline file attachments for chat messages */
export function buildAttachmentsByComment(
  attachments: Array<{
    issueCommentId: string | null;
    originalFilename: string | null;
    objectKey: string;
    byteSize: number;
    contentPath: string;
  }>,
): Map<string, Array<{ icon?: string; name: string; size?: string; href?: string }>> {
  const map = new Map<string, Array<{ icon?: string; name: string; size?: string; href?: string }>>();
  for (const a of attachments) {
    if (!a.issueCommentId) continue;
    const ext = (a.originalFilename ?? a.objectKey).split(".").pop()?.toLowerCase() ?? "";
    const isHtml = ext === "html" || ext === "htm";
    const isImage = IMAGE_EXTS.has(ext);
    const entry = {
      icon: isHtml ? "🌐" : isImage ? "🖼" : "📎",
      name: a.originalFilename ?? a.objectKey,
      size: `${(a.byteSize / 1024).toFixed(0)} KB`,
      href: a.contentPath,
    };
    const list = map.get(a.issueCommentId) ?? [];
    list.push(entry);
    map.set(a.issueCommentId, list);
  }
  return map;
}
