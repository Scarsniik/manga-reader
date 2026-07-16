import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import type {
  SaveReadingListRequest,
  SavedReadingList,
  SavedReadingListItem,
  SavedReadingListItemMetadata,
  SavedReadingListSourceTarget,
} from "../../shared/readingList";
import { ensureDataDir, savedReadingListsFilePath } from "../utils";
import { applyReadingListSave } from "./readingListCollection";

const SAVED_READING_LISTS_DOCUMENT_VERSION = 1;

type SavedReadingListsDocument = {
  version: typeof SAVED_READING_LISTS_DOCUMENT_VERSION;
  lists: SavedReadingList[];
};

let savedReadingListsFileQueue: Promise<void> = Promise.resolve();

const runSavedReadingListsFileOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
  const previousOperation = savedReadingListsFileQueue;
  let releaseOperation: () => void = () => undefined;

  savedReadingListsFileQueue = new Promise<void>((resolve) => {
    releaseOperation = resolve;
  });

  await previousOperation.catch(() => undefined);

  try {
    return await operation();
  } finally {
    releaseOperation();
  }
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const normalizeRequiredText = (value: unknown): string | null => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
};

const normalizeOptionalText = (value: unknown): string | undefined => (
  normalizeRequiredText(value) ?? undefined
);

const normalizeOptionalTextOrNull = (value: unknown): string | null | undefined => {
  if (value === null) {
    return null;
  }

  return normalizeOptionalText(value);
};

const normalizeTextList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = Array.from(new Set(
    value
      .map((entry) => normalizeRequiredText(entry))
      .filter((entry): entry is string => Boolean(entry)),
  ));

  return normalized.length > 0 ? normalized : [];
};

const normalizeCreatedAt = (value: unknown, fallback: string): string => {
  const normalized = normalizeRequiredText(value);
  if (!normalized) {
    return fallback;
  }

  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
};

const sanitizeLocationState = (value: unknown): unknown | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value !== null && !isObjectRecord(value)) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return undefined;
  }
};

const sanitizeSourceTarget = (value: unknown): SavedReadingListSourceTarget | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const title = normalizeOptionalText(value.title);
  if (value.kind === "reader") {
    const mangaId = normalizeRequiredText(value.mangaId);
    if (!mangaId) {
      return null;
    }

    const pageValue = typeof value.page === "number" && Number.isFinite(value.page)
      ? Math.floor(value.page)
      : null;
    const locationState = sanitizeLocationState(value.locationState);

    return {
      kind: "reader",
      mangaId,
      ...(pageValue !== null && pageValue > 0 ? { page: pageValue } : {}),
      ...(title ? { title } : {}),
      ...(locationState !== undefined ? { locationState } : {}),
    };
  }

  if (value.kind !== "scraper.details") {
    return null;
  }

  const scraperId = normalizeRequiredText(value.scraperId);
  const sourceUrl = normalizeRequiredText(value.sourceUrl);
  if (!scraperId || !sourceUrl) {
    return null;
  }

  return {
    kind: "scraper.details",
    scraperId,
    sourceUrl,
    ...(title ? { title } : {}),
  };
};

const sanitizeItemMetadata = (value: unknown): SavedReadingListItemMetadata | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const title = normalizeRequiredText(value.title);
  if (!title) {
    return null;
  }

  const cover = normalizeOptionalTextOrNull(value.cover);
  const authors = normalizeTextList(value.authors);
  const tags = normalizeTextList(value.tags);
  const languageCodes = normalizeTextList(value.languageCodes);

  return {
    title,
    ...(cover !== undefined ? { cover } : {}),
    ...(authors !== undefined ? { authors } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(languageCodes !== undefined ? { languageCodes } : {}),
  };
};

const sanitizeReadingListItem = (
  value: unknown,
  usedItemIds: Set<string>,
): SavedReadingListItem | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const metadata = sanitizeItemMetadata(value.metadata);
  const sourceTarget = sanitizeSourceTarget(value.sourceTarget);
  if (!metadata || !sourceTarget) {
    return null;
  }

  const requestedId = normalizeRequiredText(value.id);
  const id = requestedId && !usedItemIds.has(requestedId) ? requestedId : randomUUID();
  usedItemIds.add(id);

  return {
    id,
    metadata,
    sourceTarget,
  };
};

const sanitizeReadingListItems = (value: unknown): SavedReadingListItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedItemIds = new Set<string>();
  return value
    .map((item) => sanitizeReadingListItem(item, usedItemIds))
    .filter((item): item is SavedReadingListItem => Boolean(item));
};

const sanitizeSavedReadingList = (
  value: unknown,
  usedListIds: Set<string>,
  fallbackCreatedAt: string,
): SavedReadingList | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const items = sanitizeReadingListItems(value.items);
  if (items.length === 0) {
    return null;
  }

  const requestedId = normalizeRequiredText(value.id);
  const id = requestedId && !usedListIds.has(requestedId) ? requestedId : randomUUID();
  usedListIds.add(id);

  return {
    id,
    items,
    createdAt: normalizeCreatedAt(value.createdAt ?? value.savedAt, fallbackCreatedAt),
  };
};

const sortSavedReadingLists = (lists: SavedReadingList[]): SavedReadingList[] => (
  [...lists].sort((left, right) => {
    const createdAtCompare = right.createdAt.localeCompare(left.createdAt);
    return createdAtCompare !== 0 ? createdAtCompare : left.id.localeCompare(right.id);
  })
);

const sanitizeSavedReadingLists = (value: unknown): SavedReadingList[] => {
  const sourceLists = Array.isArray(value)
    ? value
    : isObjectRecord(value) && Array.isArray(value.lists)
      ? value.lists
      : isObjectRecord(value) && Array.isArray(value.readingLists)
        ? value.readingLists
        : [];
  const fallbackCreatedAt = new Date().toISOString();
  const usedListIds = new Set<string>();

  return sortSavedReadingLists(sourceLists
    .map((list) => sanitizeSavedReadingList(list, usedListIds, fallbackCreatedAt))
    .filter((list): list is SavedReadingList => Boolean(list)));
};

const createSavedReadingListsDocument = (
  lists: SavedReadingList[],
): SavedReadingListsDocument => ({
  version: SAVED_READING_LISTS_DOCUMENT_VERSION,
  lists: sortSavedReadingLists(lists),
});

const writeSavedReadingListsFileUnlocked = async (lists: SavedReadingList[]): Promise<void> => {
  await ensureDataDir();
  const document = createSavedReadingListsDocument(lists);
  const tempFilePath = `${savedReadingListsFilePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;

  try {
    await fs.writeFile(tempFilePath, JSON.stringify(document, null, 2), "utf8");
    await fs.rename(tempFilePath, savedReadingListsFilePath);
  } catch (error) {
    await fs.unlink(tempFilePath).catch(() => undefined);
    throw error;
  }
};

const assertSupportedDocumentVersion = (value: unknown): void => {
  if (!isObjectRecord(value) || typeof value.version !== "number") {
    return;
  }

  if (value.version > SAVED_READING_LISTS_DOCUMENT_VERSION) {
    throw new Error(`Unsupported saved reading lists version: ${value.version}`);
  }
};

const readSavedReadingListsFileUnlocked = async (): Promise<SavedReadingList[]> => {
  try {
    const data = await fs.readFile(savedReadingListsFilePath, "utf8");
    const parsed = JSON.parse(data) as unknown;
    assertSupportedDocumentVersion(parsed);
    const lists = sanitizeSavedReadingLists(parsed);
    const normalizedDocument = createSavedReadingListsDocument(lists);

    if (JSON.stringify(parsed, null, 2) !== JSON.stringify(normalizedDocument, null, 2)) {
      await writeSavedReadingListsFileUnlocked(lists);
    }

    return lists;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
      await writeSavedReadingListsFileUnlocked([]);
      return [];
    }

    console.error("Error reading saved reading lists file:", error);
    throw new Error("Failed to read saved reading lists");
  }
};

export const getSavedReadingLists = async (): Promise<SavedReadingList[]> => (
  runSavedReadingListsFileOperation(readSavedReadingListsFileUnlocked)
);

export const getSavedReadingList = async (readingListId: unknown): Promise<SavedReadingList | null> => (
  runSavedReadingListsFileOperation(async () => {
    const normalizedId = normalizeRequiredText(readingListId);
    if (!normalizedId) {
      return null;
    }

    const lists = await readSavedReadingListsFileUnlocked();
    return lists.find((list) => list.id === normalizedId) ?? null;
  })
);

export const saveReadingList = async (request: SaveReadingListRequest): Promise<SavedReadingList> => (
  runSavedReadingListsFileOperation(async () => {
    if (!request || !Array.isArray(request.items) || request.items.length === 0) {
      throw new Error("La liste de lecture est vide.");
    }

    const items = sanitizeReadingListItems(request.items);
    if (items.length !== request.items.length) {
      throw new Error("La liste de lecture contient un manga invalide.");
    }

    const savedListId = normalizeRequiredText(request.savedListId);
    if (request.savedListId !== undefined && !savedListId) {
      throw new Error("L'identifiant de la liste de lecture est invalide.");
    }

    const lists = await readSavedReadingListsFileUnlocked();
    const result = applyReadingListSave(lists, items, {
      createId: randomUUID,
      createdAt: new Date().toISOString(),
      ...(savedListId ? { savedListId } : {}),
    });

    await writeSavedReadingListsFileUnlocked(result.lists);
    return result.savedList;
  })
);

export const deleteSavedReadingList = async (readingListId: unknown): Promise<boolean> => (
  runSavedReadingListsFileOperation(async () => {
    const normalizedId = normalizeRequiredText(readingListId);
    if (!normalizedId) {
      return false;
    }

    const lists = await readSavedReadingListsFileUnlocked();
    const nextLists = lists.filter((list) => list.id !== normalizedId);
    if (nextLists.length === lists.length) {
      return false;
    }

    await writeSavedReadingListsFileUnlocked(nextLists);
    return true;
  })
);
