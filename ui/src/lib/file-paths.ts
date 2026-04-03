/**
 * Utility for detecting file paths in agent output text
 * and building links to the local-files serve endpoint.
 */

const FILE_EXTENSIONS = new Set([
  "html", "htm", "css", "js", "ts", "tsx", "jsx",
  "json", "md", "txt", "csv", "xml", "yaml", "yml",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico",
  "pdf", "zip", "tar", "gz",
  "mp4", "webm", "mp3", "wav",
  "py", "rb", "go", "rs", "java", "php", "sh",
]);

// Match absolute file paths like /Users/foo/bar.html or ~/some/file.css
// Also match paths in backticks or quotes
const FILE_PATH_REGEX = /(?:^|[\s"`'(])((\/[^\s"'`)<>]+\.[a-zA-Z0-9]{1,6})|(~\/[^\s"'`)<>]+\.[a-zA-Z0-9]{1,6}))/gm;

export type FileReference = {
  path: string;
  name: string;
  extension: string;
  start: number;
  end: number;
};

export function detectFilePaths(text: string): FileReference[] {
  const refs: FileReference[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(FILE_PATH_REGEX)) {
    const fullMatch = match[1] || match[2];
    if (!fullMatch) continue;

    const filePath = fullMatch.trim();
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    if (!FILE_EXTENSIONS.has(ext)) continue;
    if (seen.has(filePath)) continue;
    seen.add(filePath);

    const name = filePath.split("/").pop() ?? filePath;
    const matchIndex = match.index ?? 0;
    const offset = (match[0].length - fullMatch.length);

    refs.push({
      path: filePath,
      name,
      extension: ext,
      start: matchIndex + offset,
      end: matchIndex + offset + fullMatch.length,
    });
  }

  return refs;
}

export function buildFileServeUrl(filePath: string): string {
  return `/api/local-files/serve?path=${encodeURIComponent(filePath)}`;
}

export function isPreviewableInBrowser(ext: string): boolean {
  return ["html", "htm", "pdf", "png", "jpg", "jpeg", "gif", "svg", "webp", "txt", "json", "md", "csv"].includes(ext);
}

export function isHtmlFile(ext: string): boolean {
  return ext === "html" || ext === "htm";
}
