import { app, shell } from "electron";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

type OpenJsonDocumentRequest = {
  filename?: string;
  content?: string;
};

type OpenJsonDocumentResult = {
  success: boolean;
  path?: string;
  error?: string;
};

const sanitizeFilename = (value: unknown): string => {
  const filename = String(value ?? "multi-search-export")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return filename || "multi-search-export";
};

export const openJsonDocument = async (
  request: OpenJsonDocumentRequest,
): Promise<OpenJsonDocumentResult> => {
  const content = String(request?.content ?? "");
  if (!content.trim()) {
    return {
      success: false,
      error: "JSON content is empty",
    };
  }

  try {
    JSON.parse(content);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid JSON content",
    };
  }

  try {
    const exportDirectory = join(app.getPath("temp"), "manga-helper-json-exports");
    await mkdir(exportDirectory, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = sanitizeFilename(request?.filename).replace(/\.json$/i, "");
    const filePath = join(exportDirectory, `${filename}-${timestamp}.json`);

    await writeFile(filePath, content, "utf8");

    const error = await shell.openPath(filePath);
    return {
      success: error.length === 0,
      path: filePath,
      error,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to open JSON document",
    };
  }
};
