import { type IpcMainInvokeEvent } from "electron";
import {
  buildScraperViewHistoryCardId,
  DEFAULT_SCRAPER_BOOKMARK_FILTERS,
  normalizeScraperViewHistorySourceUrl,
  type ScraperBookmarkFilterState,
  type ScraperBookmarkLanguageFilterMode,
  type ScraperBookmarkLanguageFilterModes,
  type ScraperBookmarkReadingStatus,
  type ScraperBookmarkRecord,
  type ScraperBookmarkSortKey,
  type ScraperBookmarkViewRecord,
  type ScraperBookmarkViewRequest,
  type ScraperBookmarkViewResponse,
  type ScraperBookmarkViewTagBlacklistEntry,
  type ScraperBookmarkViewState,
  type ScraperReaderProgressRecord,
  type ScraperRecord,
  type ScraperViewHistoryCardIdentity,
  type ScraperViewHistoryRecord,
} from "../../scraper";
import {
  readScraperBookmarksFile,
  readScraperReaderProgressFile,
  readScrapersFile,
} from "./storage";
import { sanitizeStringList } from "./shared";
import { getScraperViewHistory } from "./viewHistory";

const UNKNOWN_BOOKMARK_LANGUAGE_VALUE = "__multi_search_unknown__";

const READING_STATUS_ORDER: Record<ScraperBookmarkReadingStatus, number> = {
  inProgress: 0,
  unread: 1,
  read: 2,
};

const SORT_KEYS = new Set<ScraperBookmarkSortKey>([
  "created-desc",
  "created-asc",
  "updated-desc",
  "title-asc",
  "title-desc",
  "page-desc",
  "page-asc",
  "scraper-asc",
]);

const READING_STATUSES = new Set<ScraperBookmarkReadingStatus>([
  "read",
  "inProgress",
  "unread",
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  en: "en",
  eng: "en",
  english: "en",
  anglais: "en",
  gb: "en",
  uk: "en",
  fr: "fr",
  fra: "fr",
  fre: "fr",
  french: "fr",
  francais: "fr",
  vf: "fr",
  vostfr: "fr",
  ja: "ja",
  jp: "ja",
  jpn: "ja",
  japanese: "ja",
  japonais: "ja",
  raw: "ja",
  es: "es",
  esp: "es",
  spa: "es",
  spanish: "es",
  espanol: "es",
  de: "de",
  ger: "de",
  deu: "de",
  german: "de",
  allemand: "de",
  it: "it",
  ita: "it",
  italian: "it",
  italien: "it",
  pt: "pt",
  por: "pt",
  portuguese: "pt",
  portugais: "pt",
  br: "pt",
  ptbr: "pt",
  ko: "ko",
  kor: "ko",
  korean: "ko",
  coreen: "ko",
  zh: "zh",
  cn: "zh",
  chi: "zh",
  zho: "zh",
  chinese: "zh",
  chinois: "zh",
  ru: "ru",
  rus: "ru",
  russian: "ru",
  russe: "ru",
};

const normalizeSearchText = (value: unknown): string => (
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
);

const normalizeLanguageToken = (value: string): string => (
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/^pt-br$/, "ptbr")
);

const normalizeLanguageCodes = (values: unknown): string[] => {
  const seen = new Set<string>();

  return sanitizeStringList(values).reduce<string[]>((codes, value) => {
    const normalized = normalizeLanguageToken(value);
    const code = LANGUAGE_ALIASES[normalized] || "";

    if (!code || seen.has(code)) {
      return codes;
    }

    seen.add(code);
    codes.push(code);
    return codes;
  }, []);
};

const normalizeLanguageFilterModes = (value: unknown): ScraperBookmarkLanguageFilterModes => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<ScraperBookmarkLanguageFilterModes>(
    (modes, [languageCode, mode]) => {
      const normalizedLanguageCode = String(languageCode ?? "").trim();
      if (!normalizedLanguageCode || (mode !== "only" && mode !== "without")) {
        return modes;
      }

      return {
        ...modes,
        [normalizedLanguageCode]: mode,
      };
    },
    {},
  );
};

const normalizeReadingStatuses = (value: unknown): ScraperBookmarkReadingStatus[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value.filter((status): status is ScraperBookmarkReadingStatus => (
        READING_STATUSES.has(String(status ?? "") as ScraperBookmarkReadingStatus)
      )),
    ))
    : []
);

const normalizeSortKey = (value: unknown): ScraperBookmarkSortKey => {
  const sortKey = String(value ?? "");
  return SORT_KEYS.has(sortKey as ScraperBookmarkSortKey)
    ? sortKey as ScraperBookmarkSortKey
    : DEFAULT_SCRAPER_BOOKMARK_FILTERS.sortBy;
};

const normalizeBookmarkFilters = (
  filters: Partial<ScraperBookmarkFilterState> | null | undefined,
): ScraperBookmarkFilterState => ({
  query: String(filters?.query ?? DEFAULT_SCRAPER_BOOKMARK_FILTERS.query),
  languageFilterModes: normalizeLanguageFilterModes(filters?.languageFilterModes),
  minPages: String(filters?.minPages ?? DEFAULT_SCRAPER_BOOKMARK_FILTERS.minPages),
  maxPages: String(filters?.maxPages ?? DEFAULT_SCRAPER_BOOKMARK_FILTERS.maxPages),
  readingStatuses: normalizeReadingStatuses(filters?.readingStatuses),
  sortBy: normalizeSortKey(filters?.sortBy),
});

const getLanguageFilterMode = (
  modes: ScraperBookmarkLanguageFilterModes,
  languageCode: string,
): ScraperBookmarkLanguageFilterMode => {
  const mode = modes[languageCode];
  return mode === "only" || mode === "without" ? mode : "default";
};

const hasActiveLanguageFilter = (modes: ScraperBookmarkLanguageFilterModes): boolean => (
  Object.values(modes).some((mode) => mode === "only" || mode === "without")
);

const toPositiveNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

const parseBookmarkPageCount = (value: string | undefined): number | null => {
  const match = String(value ?? "").match(/\d+(?:[\s.,]\d{3})*/);
  if (!match) {
    return null;
  }

  return toPositiveNumber(match[0].replace(/[^\d]/g, ""));
};

const getReaderProgressStatus = (
  currentPageValue: unknown,
  totalPagesValue: unknown,
): ScraperBookmarkReadingStatus => {
  const currentPage = toPositiveNumber(currentPageValue);
  const totalPages = toPositiveNumber(totalPagesValue);

  if (currentPage === null) {
    return "unread";
  }

  if (totalPages !== null && currentPage >= totalPages) {
    return "read";
  }

  if (currentPage > 1 && (totalPages === null || currentPage < totalPages)) {
    return "inProgress";
  }

  return "unread";
};

const createStableHash = (input: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const createScraperMangaId = (scraperId: string, sourceUrl: string, contextKey?: string | null): string => (
  `scraper-${scraperId}-${createStableHash(`${scraperId}::${sourceUrl}::${contextKey || ""}`)}`
);

const buildProgressSourceKey = (scraperId: string, sourceUrl: string | undefined): string => {
  const normalizedScraperId = String(scraperId ?? "").trim();
  const normalizedSourceUrl = normalizeScraperViewHistorySourceUrl(sourceUrl);

  return normalizedScraperId && normalizedSourceUrl
    ? `${normalizedScraperId}::${normalizedSourceUrl}`
    : "";
};

const buildProgressIndex = (records: ScraperReaderProgressRecord[]) => {
  const recordsById = new Map<string, ScraperReaderProgressRecord>();
  const recordsBySourceKey = new Map<string, ScraperReaderProgressRecord[]>();

  records.forEach((record) => {
    recordsById.set(record.id, record);

    const sourceKey = buildProgressSourceKey(record.scraperId, record.sourceUrl);
    if (!sourceKey) {
      return;
    }

    const sourceRecords = recordsBySourceKey.get(sourceKey) ?? [];
    sourceRecords.push(record);
    recordsBySourceKey.set(sourceKey, sourceRecords);
  });

  return {
    recordsById,
    recordsBySourceKey,
  };
};

const buildBookmarkViewHistoryIdentity = (
  bookmark: ScraperBookmarkRecord,
): ScraperViewHistoryCardIdentity => ({
  scraperId: bookmark.scraperId,
  sourceUrl: bookmark.sourceUrl,
  title: bookmark.title,
  thumbnailUrl: bookmark.cover,
});

const getBookmarkViewHistoryId = (bookmark: ScraperBookmarkRecord): string => (
  buildScraperViewHistoryCardId(buildBookmarkViewHistoryIdentity(bookmark))
);

const getBookmarkViewState = (
  bookmark: ScraperBookmarkRecord,
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>,
): ScraperBookmarkViewState => {
  const record = viewHistoryRecordsById.get(getBookmarkViewHistoryId(bookmark)) ?? null;

  if (record?.readAt) {
    return "read";
  }

  return record ? "seen" : "new";
};

const getBookmarkReadingStatusFromIndex = (
  bookmark: ScraperBookmarkRecord,
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>,
  progressIndex: ReturnType<typeof buildProgressIndex>,
): ScraperBookmarkReadingStatus => {
  const viewHistoryRecord = viewHistoryRecordsById.get(getBookmarkViewHistoryId(bookmark)) ?? null;

  if (viewHistoryRecord?.readAt) {
    return "read";
  }

  const standaloneProgress = progressIndex.recordsById.get(createScraperMangaId(
    bookmark.scraperId,
    bookmark.sourceUrl,
  ));

  if (standaloneProgress) {
    const standaloneStatus = getReaderProgressStatus(standaloneProgress.currentPage, standaloneProgress.totalPages);
    if (standaloneStatus !== "unread") {
      return standaloneStatus;
    }
  }

  const sourceProgressRecords = progressIndex.recordsBySourceKey.get(
    buildProgressSourceKey(bookmark.scraperId, bookmark.sourceUrl),
  ) ?? [];
  const hasStartedSourceProgress = sourceProgressRecords.some((record) => (
    getReaderProgressStatus(record.currentPage, record.totalPages) !== "unread"
  ));

  return hasStartedSourceProgress ? "inProgress" : "unread";
};

const getScraperSingleSourceLanguageCodes = (
  scraper: ScraperRecord | null | undefined,
): string[] => {
  const sourceLanguages = normalizeLanguageCodes(scraper?.globalConfig.sourceLanguages);
  return sourceLanguages.length === 1 ? sourceLanguages : [];
};

const getScraperBookmarkLanguageCodes = (
  bookmark: ScraperBookmarkRecord,
  scraper: ScraperRecord | null | undefined,
): string[] => {
  const bookmarkLanguageCodes = normalizeLanguageCodes(bookmark.languageCodes);
  return bookmarkLanguageCodes.length
    ? bookmarkLanguageCodes
    : getScraperSingleSourceLanguageCodes(scraper);
};

const getBookmarkLanguageValues = (
  languageCodes: string[],
): string[] => (
  languageCodes.length ? languageCodes : [UNKNOWN_BOOKMARK_LANGUAGE_VALUE]
);

const matchesLanguageFilters = (
  languageValues: string[],
  modes: ScraperBookmarkLanguageFilterModes,
): boolean => {
  if (!hasActiveLanguageFilter(modes)) {
    return true;
  }

  const onlyLanguages = Object.keys(modes).filter((languageCode) => (
    getLanguageFilterMode(modes, languageCode) === "only"
  ));
  const excludedLanguages = Object.keys(modes).filter((languageCode) => (
    getLanguageFilterMode(modes, languageCode) === "without"
  ));

  if (excludedLanguages.some((languageCode) => languageValues.includes(languageCode))) {
    return false;
  }

  if (onlyLanguages.length && !onlyLanguages.some((languageCode) => languageValues.includes(languageCode))) {
    return false;
  }

  return true;
};

const matchesQuery = (
  bookmark: ScraperBookmarkRecord,
  scraper: ScraperRecord | null | undefined,
  query: string,
): boolean => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalizeSearchText([
    bookmark.title,
    bookmark.sourceUrl,
    bookmark.summary,
    bookmark.description,
    bookmark.mangaStatus,
    scraper?.name,
    ...(bookmark.authors ?? []),
    ...(bookmark.tags ?? []),
  ].filter(Boolean).join(" "));

  return haystack.includes(normalizedQuery);
};

const compareDates = (left: string | undefined, right: string | undefined): number => (
  Date.parse(left || "") - Date.parse(right || "")
);

const comparePageCounts = (left: ScraperBookmarkRecord, right: ScraperBookmarkRecord): number => {
  const leftPages = parseBookmarkPageCount(left.pageCount);
  const rightPages = parseBookmarkPageCount(right.pageCount);

  if (leftPages === null && rightPages === null) {
    return 0;
  }

  if (leftPages === null) {
    return 1;
  }

  if (rightPages === null) {
    return -1;
  }

  return leftPages - rightPages;
};

const getTieBreaker = (
  left: ScraperBookmarkRecord,
  right: ScraperBookmarkRecord,
): number => (
  left.title.localeCompare(right.title)
  || left.sourceUrl.localeCompare(right.sourceUrl)
  || left.scraperId.localeCompare(right.scraperId)
);

const normalizeBlacklistValue = (value: unknown): string => {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized).toString().toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
};

const getBlacklistEntries = (
  blacklist: Record<string, ScraperBookmarkViewTagBlacklistEntry[]> | null | undefined,
  scraperId: string,
): ScraperBookmarkViewTagBlacklistEntry[] => {
  const entries = blacklist?.[scraperId];
  return Array.isArray(entries) ? entries : [];
};

const getBlacklistEntryValues = (entry: ScraperBookmarkViewTagBlacklistEntry): string[] => (
  [entry.value, entry.label]
    .map(normalizeBlacklistValue)
    .filter(Boolean)
);

const hasBlacklistedTags = (
  entries: ScraperBookmarkViewTagBlacklistEntry[],
  tags: readonly string[] | null | undefined,
): boolean => {
  if (!Array.isArray(tags) || !tags.length || !entries.length) {
    return false;
  }

  const entryValues = entries.flatMap(getBlacklistEntryValues);
  return tags.some((tag) => entryValues.includes(normalizeBlacklistValue(tag)));
};

type BookmarkViewCandidate = ScraperBookmarkViewRecord & {
  scraper: ScraperRecord | null;
  languageValues: string[];
};

const buildBookmarkViewCandidate = (
  bookmark: ScraperBookmarkRecord,
  scraper: ScraperRecord | null,
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>,
  progressIndex: ReturnType<typeof buildProgressIndex>,
): BookmarkViewCandidate => {
  const languageCodes = getScraperBookmarkLanguageCodes(bookmark, scraper);
  const viewHistoryId = getBookmarkViewHistoryId(bookmark);
  const viewState = getBookmarkViewState(bookmark, viewHistoryRecordsById);

  return {
    bookmark,
    scraper,
    languageCodes,
    languageValues: getBookmarkLanguageValues(languageCodes),
    viewHistoryId,
    viewState,
    readingStatus: getBookmarkReadingStatusFromIndex(bookmark, viewHistoryRecordsById, progressIndex),
  };
};

const matchesBookmarkFilters = (
  candidate: BookmarkViewCandidate,
  filters: ScraperBookmarkFilterState,
): boolean => {
  if (!matchesQuery(candidate.bookmark, candidate.scraper, filters.query)) {
    return false;
  }

  if (!matchesLanguageFilters(candidate.languageValues, filters.languageFilterModes)) {
    return false;
  }

  const minPages = toPositiveNumber(filters.minPages);
  const maxPages = toPositiveNumber(filters.maxPages);
  const pageCount = parseBookmarkPageCount(candidate.bookmark.pageCount);
  if (minPages !== null && (pageCount === null || pageCount < minPages)) {
    return false;
  }

  if (maxPages !== null && (pageCount === null || pageCount > maxPages)) {
    return false;
  }

  const selectedStatuses = new Set(filters.readingStatuses);
  if (selectedStatuses.size && !selectedStatuses.has(candidate.readingStatus)) {
    return false;
  }

  return true;
};

const compareBookmarkViewCandidates = (
  left: BookmarkViewCandidate,
  right: BookmarkViewCandidate,
  sortBy: ScraperBookmarkSortKey,
): number => {
  let compare = 0;

  switch (sortBy) {
    case "created-asc":
      compare = compareDates(left.bookmark.createdAt, right.bookmark.createdAt);
      break;
    case "updated-desc":
      compare = compareDates(right.bookmark.updatedAt, left.bookmark.updatedAt);
      break;
    case "title-asc":
      compare = left.bookmark.title.localeCompare(right.bookmark.title);
      break;
    case "title-desc":
      compare = right.bookmark.title.localeCompare(left.bookmark.title);
      break;
    case "page-desc":
      compare = comparePageCounts(right.bookmark, left.bookmark);
      break;
    case "page-asc":
      compare = comparePageCounts(left.bookmark, right.bookmark);
      break;
    case "scraper-asc":
      compare = (left.scraper?.name ?? left.bookmark.scraperId)
        .localeCompare(right.scraper?.name ?? right.bookmark.scraperId);
      break;
    case "created-desc":
    default:
      compare = compareDates(right.bookmark.createdAt, left.bookmark.createdAt);
      break;
  }

  if (compare !== 0) {
    return compare;
  }

  if (sortBy === "scraper-asc") {
    return getTieBreaker(left.bookmark, right.bookmark);
  }

  const statusCompare = READING_STATUS_ORDER[left.readingStatus] - READING_STATUS_ORDER[right.readingStatus];
  return statusCompare || getTieBreaker(left.bookmark, right.bookmark);
};

const buildLanguageFilterCodes = (candidates: BookmarkViewCandidate[]): string[] => {
  const seen = new Set<string>();

  candidates.forEach((candidate) => {
    candidate.languageValues.forEach((languageCode) => {
      seen.add(languageCode);
    });
  });

  return Array.from(seen).sort((left, right) => left.localeCompare(right));
};

const toResponseRecord = (candidate: BookmarkViewCandidate): ScraperBookmarkViewRecord => ({
  bookmark: candidate.bookmark,
  languageCodes: candidate.languageCodes,
  viewHistoryId: candidate.viewHistoryId,
  viewState: candidate.viewState,
  readingStatus: candidate.readingStatus,
});

export async function getScraperBookmarkView(
  _event: IpcMainInvokeEvent,
  request: ScraperBookmarkViewRequest | null | undefined,
): Promise<ScraperBookmarkViewResponse> {
  const normalizedScraperId = String(request?.scraperId ?? "").trim();
  const filters = normalizeBookmarkFilters(request?.filters);

  const [
    allBookmarks,
    scrapers,
    viewHistoryRecords,
    allProgressRecords,
  ] = await Promise.all([
    readScraperBookmarksFile(),
    readScrapersFile(),
    getScraperViewHistory(undefined, normalizedScraperId || null),
    readScraperReaderProgressFile(),
  ]);

  const scrapersById = new Map(scrapers.map((scraper) => [scraper.id, scraper]));
  const viewHistoryRecordsById = new Map(viewHistoryRecords.map((record) => [record.id, record]));
  const scopeBookmarks = normalizedScraperId
    ? allBookmarks.filter((bookmark) => bookmark.scraperId === normalizedScraperId)
    : allBookmarks;
  const progressRecords = normalizedScraperId
    ? allProgressRecords.filter((record) => record.scraperId === normalizedScraperId)
    : allProgressRecords;
  const progressIndex = buildProgressIndex(progressRecords);

  const candidates = scopeBookmarks.map((bookmark) => (
    buildBookmarkViewCandidate(
      bookmark,
      scrapersById.get(bookmark.scraperId) ?? null,
      viewHistoryRecordsById,
      progressIndex,
    )
  ));
  const filteredCandidates = candidates
    .filter((candidate) => matchesBookmarkFilters(candidate, filters))
    .sort((left, right) => compareBookmarkViewCandidates(left, right, filters.sortBy));
  const visibleCandidates = request?.hideBlacklistedCards
    ? filteredCandidates.filter((candidate) => !hasBlacklistedTags(
      getBlacklistEntries(request.blacklistedTagsByScraper, candidate.bookmark.scraperId),
      candidate.bookmark.tags,
    ))
    : filteredCandidates;

  return {
    bookmarks: visibleCandidates.map(toResponseRecord),
    allBookmarkCount: allBookmarks.length,
    scopeCount: scopeBookmarks.length,
    filteredCount: filteredCandidates.length,
    hiddenBlacklistedCount: filteredCandidates.length - visibleCandidates.length,
    languageCodes: buildLanguageFilterCodes(candidates),
  };
}
