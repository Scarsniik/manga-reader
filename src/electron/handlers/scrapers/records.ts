import { randomUUID } from "crypto";
import { type IpcMainInvokeEvent } from "electron";
import {
  createDefaultScraperFeatures,
  createDefaultScraperGlobalConfig,
  normalizeScraperBaseUrl,
  type SaveScraperDraftRequest,
  type SaveScraperFeatureRequest,
  type SaveScraperGlobalConfigRequest,
  type ScraperRecord,
} from "../../scraper";
import { sanitizeGlobalConfig } from "./shared";
import {
  hydrateScraperFeatures,
  readScraperReaderProgressFile,
  readScrapersFile,
  updateScraperBookmarksFile,
  writeScraperReaderProgressFile,
  writeScrapersFile,
} from "./storage";

export async function getScrapers(): Promise<ScraperRecord[]> {
  return readScrapersFile();
}

export async function deleteScraper(
  _event: IpcMainInvokeEvent,
  scraperId: string,
): Promise<ScraperRecord[]> {
  const scrapers = await readScrapersFile();
  const filtered = scrapers.filter((scraper) => String(scraper.id) !== String(scraperId));

  if (filtered.length === scrapers.length) {
    return scrapers;
  }

  await writeScrapersFile(filtered);

  await updateScraperBookmarksFile((bookmarkRecords) => {
    const filteredBookmarkRecords = bookmarkRecords.filter((record) => record.scraperId !== String(scraperId));
    const removedBookmarks = filteredBookmarkRecords.length !== bookmarkRecords.length;

    return {
      records: removedBookmarks ? filteredBookmarkRecords : bookmarkRecords,
      result: undefined,
      shouldWrite: removedBookmarks,
    };
  });

  const progressRecords = await readScraperReaderProgressFile();
  const filteredProgressRecords = progressRecords.filter((record) => record.scraperId !== String(scraperId));
  if (filteredProgressRecords.length !== progressRecords.length) {
    await writeScraperReaderProgressFile(filteredProgressRecords);
  }

  return filtered;
}

export async function saveScraperDraft(
  _event: IpcMainInvokeEvent,
  request: SaveScraperDraftRequest,
): Promise<ScraperRecord> {
  if (!request.validation?.ok) {
    throw new Error("Le scraper doit etre valide avant enregistrement.");
  }

  const normalizedUrl = normalizeScraperBaseUrl(request.identity.baseUrl);
  const now = new Date().toISOString();
  const scrapers = await readScrapersFile();

  const existingIndex = request.id
    ? scrapers.findIndex((scraper) => String(scraper.id) === String(request.id))
    : -1;

  if (existingIndex >= 0) {
    const existing = scrapers[existingIndex];
    const updated: ScraperRecord = {
      ...existing,
      kind: request.identity.kind,
      name: request.identity.name.trim(),
      baseUrl: normalizedUrl,
      description: request.identity.description?.trim() || "",
      status: "validated",
      updatedAt: now,
      validation: {
        ...request.validation,
        normalizedUrl,
      },
      globalConfig: sanitizeGlobalConfig(existing.globalConfig),
      features: existing.features?.length
        ? hydrateScraperFeatures(existing.features)
        : createDefaultScraperFeatures(),
    };

    scrapers[existingIndex] = updated;
    await writeScrapersFile(scrapers);
    return updated;
  }

  const created: ScraperRecord = {
    id: randomUUID(),
    kind: request.identity.kind,
    name: request.identity.name.trim(),
    baseUrl: normalizedUrl,
    description: request.identity.description?.trim() || "",
    status: "validated",
    createdAt: now,
    updatedAt: now,
    validation: {
      ...request.validation,
      normalizedUrl,
    },
    globalConfig: createDefaultScraperGlobalConfig(),
    features: createDefaultScraperFeatures(),
  };

  scrapers.push(created);
  await writeScrapersFile(scrapers);
  return created;
}

export async function saveScraperFeatureConfig(
  _event: IpcMainInvokeEvent,
  request: SaveScraperFeatureRequest,
): Promise<ScraperRecord> {
  const scrapers = await readScrapersFile();
  const scraperIndex = scrapers.findIndex((scraper) => String(scraper.id) === String(request.scraperId));

  if (scraperIndex < 0) {
    throw new Error("Scraper introuvable.");
  }

  const scraper = scrapers[scraperIndex];
  const features = hydrateScraperFeatures(scraper.features);
  const featureIndex = features.findIndex((feature) => feature.kind === request.featureKind);

  if (featureIndex < 0) {
    throw new Error("Composant introuvable.");
  }

  features[featureIndex] = {
    ...features[featureIndex],
    config: request.config,
    validation: request.validation ?? null,
    status: request.validation?.ok ? "validated" : "configured",
  };

  const updated: ScraperRecord = {
    ...scraper,
    updatedAt: new Date().toISOString(),
    features,
  };

  scrapers[scraperIndex] = updated;
  await writeScrapersFile(scrapers);
  return updated;
}

export async function saveScraperGlobalConfig(
  _event: IpcMainInvokeEvent,
  request: SaveScraperGlobalConfigRequest,
): Promise<ScraperRecord> {
  const scrapers = await readScrapersFile();
  const scraperIndex = scrapers.findIndex((scraper) => String(scraper.id) === String(request.scraperId));

  if (scraperIndex < 0) {
    throw new Error("Scraper introuvable.");
  }

  const scraper = scrapers[scraperIndex];
  const updated: ScraperRecord = {
    ...scraper,
    updatedAt: new Date().toISOString(),
    globalConfig: sanitizeGlobalConfig(request.globalConfig),
  };

  scrapers[scraperIndex] = updated;
  await writeScrapersFile(scrapers);
  return updated;
}
