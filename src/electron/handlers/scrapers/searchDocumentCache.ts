import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";
import { app } from "electron";
import type {
  FetchScraperDocumentRequest,
  FetchScraperDocumentResult,
} from "../../scraper";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const CACHE_DIRECTORY_NAME = "scaramanga-search-document-cache";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_SCOPE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

type CacheEnvelope = {
  savedAt: number;
  result: FetchScraperDocumentResult;
};

export type SearchDocumentCacheFile = {
  path: string;
  scopePath: string;
  size: number;
  modifiedAt: number;
};

const getCacheRoot = (): string => path.join(app.getPath("temp"), CACHE_DIRECTORY_NAME);

const sanitizeScopeId = (value: unknown): string => (
  String(value ?? "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120)
);

const normalizeRequestConfig = (request: FetchScraperDocumentRequest): Record<string, unknown> => ({
  scraperId: String(request.scraperId ?? ""),
  baseUrl: String(request.baseUrl ?? "").trim(),
  targetUrl: String(request.targetUrl ?? "").trim(),
  requestConfig: request.requestConfig ?? null,
});

const buildRequestHash = (request: FetchScraperDocumentRequest): string => (
  createHash("sha256").update(JSON.stringify(normalizeRequestConfig(request))).digest("hex")
);

const getScopePath = (scopeId: string): string => path.join(getCacheRoot(), scopeId);

const getEntryPath = (scopeId: string, request: FetchScraperDocumentRequest): string => (
  path.join(getScopePath(scopeId), `${buildRequestHash(request)}.json.gz`)
);

const removeFileSafe = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
  }
};

const collectCacheFiles = async (): Promise<SearchDocumentCacheFile[]> => {
  const root = getCacheRoot();
  let scopes: Array<import("fs").Dirent>;
  try {
    scopes = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw error;
  }

  const files: SearchDocumentCacheFile[] = [];
  await Promise.all(scopes.filter((entry) => entry.isDirectory()).map(async (scope) => {
    const scopePath = path.join(root, scope.name);
    const entries = await fs.readdir(scopePath, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json.gz")).map(async (entry) => {
      const filePath = path.join(scopePath, entry.name);
      const stat = await fs.stat(filePath).catch(() => null);
      if (stat) files.push({ path: filePath, scopePath, size: stat.size, modifiedAt: stat.mtimeMs });
    }));
  }));
  return files;
};

export const selectSearchDocumentCacheEvictions = (
  cacheFiles: SearchDocumentCacheFile[],
  maxScopeBytes = MAX_SCOPE_BYTES,
  maxTotalBytes = MAX_TOTAL_BYTES,
): string[] => {
  const files = [...cacheFiles].sort((left, right) => left.modifiedAt - right.modifiedAt);
  const scopeSizes = new Map<string, number>();
  files.forEach((file) => scopeSizes.set(file.scopePath, (scopeSizes.get(file.scopePath) ?? 0) + file.size));
  let totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const evictions: string[] = [];

  for (const file of files) {
    const scopeSize = scopeSizes.get(file.scopePath) ?? 0;
    if (scopeSize <= maxScopeBytes && totalSize <= maxTotalBytes) continue;
    evictions.push(file.path);
    scopeSizes.set(file.scopePath, Math.max(0, scopeSize - file.size));
    totalSize = Math.max(0, totalSize - file.size);
  }
  return evictions;
};

const enforceCacheLimits = async (): Promise<void> => {
  const files = await collectCacheFiles();
  await Promise.all(selectSearchDocumentCacheEvictions(files).map(removeFileSafe));
};

export const readSearchDocumentCache = async (
  request: FetchScraperDocumentRequest,
): Promise<FetchScraperDocumentResult | null> => {
  if (request.validateImage || !request.searchCache) return null;
  const scopeId = sanitizeScopeId(request.searchCache.scopeId);
  if (!scopeId) return null;
  const entryPath = getEntryPath(scopeId, request);

  try {
    const compressed = await fs.readFile(entryPath);
    const envelope = JSON.parse((await gunzipAsync(compressed)).toString("utf8")) as CacheEnvelope;
    const ttlMs = Math.max(1, Number(request.searchCache.ttlMs) || DEFAULT_TTL_MS);
    if (!envelope?.result?.ok || !envelope.result.html || Date.now() - Number(envelope.savedAt) > ttlMs) {
      await removeFileSafe(entryPath);
      return null;
    }
    const now = new Date();
    await fs.utimes(entryPath, now, now).catch(() => undefined);
    return envelope.result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      await removeFileSafe(entryPath).catch(() => undefined);
    }
    return null;
  }
};

export const writeSearchDocumentCache = async (
  request: FetchScraperDocumentRequest,
  result: FetchScraperDocumentResult,
): Promise<void> => {
  if (request.validateImage || !request.searchCache || !result.ok || !result.html) return;
  if (Buffer.byteLength(result.html, "utf8") > MAX_ENTRY_BYTES) return;
  const scopeId = sanitizeScopeId(request.searchCache.scopeId);
  if (!scopeId) return;
  const entryPath = getEntryPath(scopeId, request);
  const compressed = await gzipAsync(Buffer.from(JSON.stringify({ savedAt: Date.now(), result } satisfies CacheEnvelope)));
  await fs.mkdir(path.dirname(entryPath), { recursive: true });
  const temporaryPath = `${entryPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, compressed);
  await fs.rename(temporaryPath, entryPath);
  await enforceCacheLimits();
};

export const removeSearchDocumentCacheScope = async (scopeIdValue: unknown): Promise<void> => {
  const scopeId = sanitizeScopeId(scopeIdValue);
  if (!scopeId) return;
  await fs.rm(getScopePath(scopeId), { recursive: true, force: true });
};

export const pruneExpiredSearchDocumentCaches = async (now = Date.now()): Promise<void> => {
  const files = await collectCacheFiles();
  await Promise.all(files.filter((file) => now - file.modifiedAt > DEFAULT_TTL_MS).map((file) => (
    removeFileSafe(file.path)
  )));
  await enforceCacheLimits();
};
