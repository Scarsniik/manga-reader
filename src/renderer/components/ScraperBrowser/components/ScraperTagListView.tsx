import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  hasScraperFieldSelectorValue,
  type FetchScraperDocumentRequest,
  type FetchScraperDocumentResult,
  type SaveScraperTagListCacheRequest,
  type ScraperRecord,
  type ScraperTagFavoriteRecord,
  type ScraperTagListCacheRecord,
  type ScraperTagListFeatureConfig,
  type ScraperTagListItem,
} from "@/shared/scraper";
import ScraperSourceFavoriteDialog from "@/renderer/components/ScraperSourceFavoriteDialog/ScraperSourceFavoriteDialog";
import { CloseXIcon, DownloadArrowIcon, FilterRemoveIcon, StarIcon } from "@/renderer/components/icons";
import { useModal } from "@/renderer/hooks/useModal";
import useParams, {
  type ScraperTagListSortDirection,
  type ScraperTagListSortMode,
  type ScraperTagListViewSettings,
} from "@/renderer/hooks/useParams";
import {
  removeScraperTagFavoriteSource,
  saveScraperTagFavorite,
  useScraperTagFavorites,
} from "@/renderer/stores/scraperTagFavorites";
import {
  extractScraperTagListPageFromDocument,
  hasTagListPagePlaceholder,
  resolveScraperTagListTargetUrl,
  type ScraperRuntimeTagListPageResult,
} from "@/renderer/utils/scraperRuntime";
import {
  buildScraperTagBlacklistEntry,
  findScraperTagBlacklistEntry,
  getScraperTagBlacklistEntries,
  removeScraperTagBlacklistEntry,
  type ScraperTagBlacklistEntry,
} from "@/renderer/utils/scraperTagBlacklist";
import {
  findScraperTagFavoriteSource,
  getScraperTagFavoriteSources,
  type ScraperTagFavoriteSourceTarget,
} from "@/renderer/utils/scraperTagFavorites";
import VirtualizedTagGrid from "@/renderer/components/ScraperBrowser/components/VirtualizedTagGrid";

type Props = {
  scraper: ScraperRecord;
  config: ScraperTagListFeatureConfig;
  searchQuery: string;
  hasTag: boolean;
  onOpenTag: (value: string, title: string) => void;
  onOpenTagInWorkspace: (value: string, title: string) => void;
  onRuntimeMessage: (message: string | null) => void;
  onRuntimeError: (message: string | null) => void;
};

type TagListApi = {
  fetchScraperDocument?: (request: FetchScraperDocumentRequest) => Promise<FetchScraperDocumentResult>;
  getScraperTagListCache?: (scraperId: string) => Promise<ScraperTagListCacheRecord | null>;
  saveScraperTagListCache?: (request: SaveScraperTagListCacheRequest) => Promise<ScraperTagListCacheRecord>;
};

type ContextMenuState = {
  tag: ScraperTagListItem;
  x: number;
  y: number;
};

type TagListSortOption = "alpha-asc" | "alpha-desc" | "count-desc" | "count-asc";

const MAX_TAG_LIST_PAGES = 1000;
const DEFAULT_TAG_LIST_VIEW_SETTINGS: Required<ScraperTagListViewSettings> = {
  sortMode: "alpha",
  sortDirection: "asc",
  minCount: null,
  maxCount: null,
};

const getTagListApi = (): TagListApi => (
  (window.api ?? {}) as TagListApi
);

const normalizeText = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const normalizeSearchText = (value: unknown): string => (
  normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
);

const normalizeVisitedUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

const normalizeTagIdentity = (tag: ScraperTagListItem): string => (
  normalizeSearchText(tag.url || tag.name)
);

const getTagMatchKeys = (tag: ScraperTagListItem): string[] => (
  [tag.url, tag.name]
    .map(normalizeSearchText)
    .filter(Boolean)
);

const getTagTargetValue = (tag: ScraperTagListItem): string => (
  normalizeText(tag.url) || normalizeText(tag.name)
);

const normalizeCountFilterValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.floor(parsed));
};

const normalizeTagListViewSettings = (value: unknown): Required<ScraperTagListViewSettings> => {
  if (!value || typeof value !== "object") {
    return DEFAULT_TAG_LIST_VIEW_SETTINGS;
  }

  const raw = value as Partial<ScraperTagListViewSettings>;
  const sortMode: ScraperTagListSortMode = raw.sortMode === "count" ? "count" : "alpha";
  const sortDirection: ScraperTagListSortDirection = raw.sortDirection === "desc" ? "desc" : "asc";

  return {
    sortMode,
    sortDirection,
    minCount: normalizeCountFilterValue(raw.minCount),
    maxCount: normalizeCountFilterValue(raw.maxCount),
  };
};

const parseTagOccurrenceCount = (count: string | undefined): number | null => {
  const normalizedCount = normalizeText(count)
    .toLowerCase()
    .replace(/\u00a0/g, " ");

  if (!normalizedCount) {
    return null;
  }

  const suffixMatch = normalizedCount.match(/([\d\s.,]+)\s*([km])\b/i);
  if (suffixMatch) {
    const parsed = Number(suffixMatch[1].replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return Math.round(parsed * (suffixMatch[2].toLowerCase() === "m" ? 1_000_000 : 1_000));
  }

  const numericPart = normalizedCount.match(/\d[\d\s.,]*/)?.[0];
  if (!numericPart) {
    return null;
  }

  const parsed = Number(numericPart.replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const getTagSortOption = (settings: Required<ScraperTagListViewSettings>): TagListSortOption => (
  `${settings.sortMode}-${settings.sortDirection}` as TagListSortOption
);

const getTagListViewSettingsFromSortOption = (option: string): Pick<
  Required<ScraperTagListViewSettings>,
  "sortMode" | "sortDirection"
> => {
  if (option === "alpha-desc") {
    return { sortMode: "alpha", sortDirection: "desc" };
  }

  if (option === "count-desc") {
    return { sortMode: "count", sortDirection: "desc" };
  }

  if (option === "count-asc") {
    return { sortMode: "count", sortDirection: "asc" };
  }

  return { sortMode: "alpha", sortDirection: "asc" };
};

const hasCustomTagListViewSettings = (settings: Required<ScraperTagListViewSettings>): boolean => (
  settings.sortMode !== DEFAULT_TAG_LIST_VIEW_SETTINGS.sortMode
  || settings.sortDirection !== DEFAULT_TAG_LIST_VIEW_SETTINGS.sortDirection
  || settings.minCount !== DEFAULT_TAG_LIST_VIEW_SETTINGS.minCount
  || settings.maxCount !== DEFAULT_TAG_LIST_VIEW_SETTINGS.maxCount
);

const sortTagsByName = (tags: ScraperTagListItem[]): ScraperTagListItem[] => (
  [...tags].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))
);

const sortTagsForView = (
  tags: ScraperTagListItem[],
  settings: Required<ScraperTagListViewSettings>,
): ScraperTagListItem[] => (
  [...tags].sort((left, right) => {
    if (settings.sortMode === "count") {
      const leftCount = parseTagOccurrenceCount(left.count);
      const rightCount = parseTagOccurrenceCount(right.count);
      const leftHasCount = leftCount !== null;
      const rightHasCount = rightCount !== null;

      if (leftHasCount && rightHasCount && leftCount !== rightCount) {
        return settings.sortDirection === "asc"
          ? leftCount - rightCount
          : rightCount - leftCount;
      }

      if (leftHasCount !== rightHasCount) {
        return leftHasCount ? -1 : 1;
      }
    }

    const alphaComparison = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    return settings.sortDirection === "desc" ? -alphaComparison : alphaComparison;
  })
);

const mergeTagItems = (
  tagsByKey: Map<string, ScraperTagListItem>,
  items: ScraperTagListItem[],
): number => {
  let addedCount = 0;

  items.forEach((item) => {
    const name = normalizeText(item.name);
    if (!name) {
      return;
    }

    const nextItem: ScraperTagListItem = {
      name,
      url: normalizeText(item.url) || undefined,
      count: normalizeText(item.count) || undefined,
    };
    const key = normalizeTagIdentity(nextItem);
    const existing = tagsByKey.get(key);

    if (!existing) {
      tagsByKey.set(key, nextItem);
      addedCount += 1;
      return;
    }

    tagsByKey.set(key, {
      name: existing.name || nextItem.name,
      url: existing.url || nextItem.url,
      count: existing.count || nextItem.count,
    });
  });

  return addedCount;
};

const formatSavedAt = (value: string | undefined): string => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

const getContextMenuPosition = (state: ContextMenuState): React.CSSProperties => {
  if (typeof window === "undefined") {
    return {
      left: state.x,
      top: state.y,
    };
  }

  return {
    left: Math.min(state.x, Math.max(8, window.innerWidth - 276)),
    top: Math.min(state.y, Math.max(8, window.innerHeight - 116)),
  };
};

const isConfigRunnable = (config: ScraperTagListFeatureConfig): boolean => (
  Boolean(
    config.urlTemplate.trim()
    && config.tagItemSelector.trim()
    && hasScraperFieldSelectorValue(config.tagNameSelector),
  )
);

export default function ScraperTagListView({
  scraper,
  config,
  searchQuery,
  hasTag,
  onOpenTag,
  onOpenTagInWorkspace,
  onRuntimeMessage,
  onRuntimeError,
}: Props) {
  const { params, setParams } = useParams();
  const { openModal, closeModal } = useModal();
  const { favorites, loading: favoritesLoading } = useScraperTagFavorites();
  const [tags, setTags] = useState<ScraperTagListItem[]>([]);
  const [cacheRecord, setCacheRecord] = useState<ScraperTagListCacheRecord | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const requestIdRef = useRef(0);

  const tagFavoriteSources = useMemo(
    () => getScraperTagFavoriteSources(favorites, scraper.id),
    [favorites, scraper.id],
  );
  const scraperTagBlacklistEntries = useMemo(
    () => getScraperTagBlacklistEntries(params?.scraperBlacklistedTagsByScraper, scraper.id),
    [params?.scraperBlacklistedTagsByScraper, scraper.id],
  );
  const normalizedSearchQuery = useMemo(
    () => normalizeSearchText(searchQuery),
    [searchQuery],
  );
  const tagListViewSettings = useMemo(
    () => normalizeTagListViewSettings(params?.scraperTagListViewSettingsByScraper?.[scraper.id]),
    [params?.scraperTagListViewSettingsByScraper, scraper.id],
  );
  const hasTagOccurrenceCounts = useMemo(
    () => tags.some((tag) => parseTagOccurrenceCount(tag.count) !== null),
    [tags],
  );
  const activeCountFilter = hasTagOccurrenceCounts
    && (tagListViewSettings.minCount !== null || tagListViewSettings.maxCount !== null);
  const visibleTags = useMemo(() => {
    const searchFilteredTags = normalizedSearchQuery
      ? tags.filter((tag) => (
        normalizeSearchText(`${tag.name} ${tag.url ?? ""} ${tag.count ?? ""}`).includes(normalizedSearchQuery)
      ))
      : tags;
    const countFilteredTags = activeCountFilter
      ? searchFilteredTags.filter((tag) => {
        const count = parseTagOccurrenceCount(tag.count);
        if (count === null) {
          return false;
        }

        if (tagListViewSettings.minCount !== null && count < tagListViewSettings.minCount) {
          return false;
        }

        return !(tagListViewSettings.maxCount !== null && count > tagListViewSettings.maxCount);
      })
      : searchFilteredTags;

    if (tagListViewSettings.sortMode === "count" && !hasTagOccurrenceCounts) {
      return sortTagsForView(countFilteredTags, DEFAULT_TAG_LIST_VIEW_SETTINGS);
    }

    return sortTagsForView(countFilteredTags, tagListViewSettings);
  }, [activeCountFilter, hasTagOccurrenceCounts, normalizedSearchQuery, tagListViewSettings, tags]);
  const favoriteTagItems = useMemo<ScraperTagListItem[]>(() => (
    tagFavoriteSources.map(({ favorite, source }) => ({
      name: source.name || favorite.name,
      url: source.tagUrl,
    }))
  ), [tagFavoriteSources]);
  const blacklistedTagItems = useMemo<ScraperTagListItem[]>(() => (
    scraperTagBlacklistEntries.map((entry) => ({
      name: entry.label || entry.value,
      url: entry.value,
    }))
  ), [scraperTagBlacklistEntries]);
  const favoriteTagKeySet = useMemo(() => new Set(
    tagFavoriteSources.flatMap(({ source }) => (
      [source.tagUrl, source.name].map(normalizeSearchText).filter(Boolean)
    )),
  ), [tagFavoriteSources]);
  const blacklistedTagKeySet = useMemo(() => new Set(
    scraperTagBlacklistEntries.flatMap((entry) => (
      [entry.value, entry.label].map(normalizeSearchText).filter(Boolean)
    )),
  ), [scraperTagBlacklistEntries]);
  const contextFavoriteSource = useMemo(
    () => contextMenu
      ? findScraperTagFavoriteSource(tagFavoriteSources, contextMenu.tag.name, contextMenu.tag.url)
      : null,
    [contextMenu, tagFavoriteSources],
  );
  const contextBlacklistEntry = useMemo<ScraperTagBlacklistEntry | null>(
    () => contextMenu
      ? findScraperTagBlacklistEntry(scraperTagBlacklistEntries, contextMenu.tag.name, contextMenu.tag.url)
      : null,
    [contextMenu, scraperTagBlacklistEntries],
  );
  const cacheSavedAtLabel = formatSavedAt(cacheRecord?.savedAt);
  const runnable = isConfigRunnable(config);
  const customTagListViewSettings = hasCustomTagListViewSettings(tagListViewSettings);

  const saveTagListViewSettings = useCallback((nextSettings: Required<ScraperTagListViewSettings>) => {
    const currentSettingsByScraper = params?.scraperTagListViewSettingsByScraper ?? {};

    setParams({
      scraperTagListViewSettingsByScraper: {
        ...currentSettingsByScraper,
        [scraper.id]: nextSettings,
      },
    }, { remount: false });
  }, [params?.scraperTagListViewSettingsByScraper, scraper.id, setParams]);

  const updateTagListViewSettings = useCallback((patch: Partial<ScraperTagListViewSettings>) => {
    saveTagListViewSettings(normalizeTagListViewSettings({
      ...tagListViewSettings,
      ...patch,
    }));
  }, [saveTagListViewSettings, tagListViewSettings]);

  const handleSortOptionChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    updateTagListViewSettings(getTagListViewSettingsFromSortOption(event.currentTarget.value));
  }, [updateTagListViewSettings]);

  const handleMinCountChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    updateTagListViewSettings({
      minCount: normalizeCountFilterValue(event.currentTarget.value),
    });
  }, [updateTagListViewSettings]);

  const handleMaxCountChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    updateTagListViewSettings({
      maxCount: normalizeCountFilterValue(event.currentTarget.value),
    });
  }, [updateTagListViewSettings]);

  const resetTagListViewSettings = useCallback(() => {
    saveTagListViewSettings(DEFAULT_TAG_LIST_VIEW_SETTINGS);
  }, [saveTagListViewSettings]);

  const loadCache = useCallback(async () => {
    const api = getTagListApi();
    if (typeof api.getScraperTagListCache !== "function") {
      setTags([]);
      setCacheRecord(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setCacheLoading(true);

    try {
      const record = await api.getScraperTagListCache(scraper.id);
      if (requestId !== requestIdRef.current) {
        return;
      }

      setCacheRecord(record);
      setTags(record ? sortTagsByName(record.tags) : []);
    } catch (error) {
      if (requestId === requestIdRef.current) {
        onRuntimeError(error instanceof Error ? error.message : "Impossible de charger la liste de tags enregistree.");
        setCacheRecord(null);
        setTags([]);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setCacheLoading(false);
      }
    }
  }, [onRuntimeError, scraper.id]);

  useEffect(() => {
    void loadCache();

    return () => {
      requestIdRef.current += 1;
    };
  }, [loadCache]);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const handleClose = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("click", handleClose);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const fetchTagListPage = useCallback(async (targetUrl: string): Promise<ScraperRuntimeTagListPageResult> => {
    const api = getTagListApi();
    if (typeof api.fetchScraperDocument !== "function") {
      throw new Error("Le runtime du scrapper n'est pas disponible dans cette version.");
    }

    const documentResult = await api.fetchScraperDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!documentResult?.ok || !documentResult.html) {
      throw new Error(
        documentResult?.error
        || (typeof documentResult?.status === "number"
          ? `La liste de tags a repondu avec le code HTTP ${documentResult.status}.`
          : "Impossible de charger la liste de tags."),
      );
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(documentResult.html, "text/html");
    return extractScraperTagListPageFromDocument(documentNode, config, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
    });
  }, [config, scraper.baseUrl]);

  const scrapeAndSaveTags = useCallback(async () => {
    if (!runnable) {
      onRuntimeError("Le composant Liste de tags n'est pas encore suffisamment configure.");
      return;
    }

    const api = getTagListApi();
    if (typeof api.saveScraperTagListCache !== "function") {
      onRuntimeError("L'enregistrement de la liste de tags n'est pas disponible dans cette version.");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const tagsByKey = new Map<string, ScraperTagListItem>();
    const visitedUrls = new Set<string>();
    const queuedUrls: string[] = [];
    const queuedKeys = new Set<string>();
    const usesTemplatePaging = hasTagListPagePlaceholder(config);
    let firstSourceUrl = "";
    let pageLimitReached = false;

    const enqueueUrl = (url: string | undefined) => {
      const normalizedUrl = normalizeVisitedUrl(url ?? "");
      if (!normalizedUrl || visitedUrls.has(normalizedUrl) || queuedKeys.has(normalizedUrl)) {
        return;
      }

      queuedUrls.push(normalizedUrl);
      queuedKeys.add(normalizedUrl);
    };

    const processTargetUrl = async (targetUrl: string): Promise<{ itemCount: number; newCount: number }> => {
      const normalizedUrl = normalizeVisitedUrl(targetUrl);
      if (!normalizedUrl || visitedUrls.has(normalizedUrl)) {
        return { itemCount: 0, newCount: 0 };
      }

      if (visitedUrls.size >= MAX_TAG_LIST_PAGES) {
        pageLimitReached = true;
        return { itemCount: 0, newCount: 0 };
      }

      visitedUrls.add(normalizedUrl);
      queuedKeys.delete(normalizedUrl);
      onRuntimeMessage(`Scraping des tags : ${visitedUrls.size} page(s), ${tagsByKey.size} tag(s).`);

      const page = await fetchTagListPage(normalizedUrl);
      firstSourceUrl = firstSourceUrl || page.currentPageUrl;
      const newCount = mergeTagItems(tagsByKey, page.items);
      enqueueUrl(page.nextPageUrl);
      page.paginationUrls.forEach(enqueueUrl);
      return { itemCount: page.items.length, newCount };
    };

    setScraping(true);
    onRuntimeError(null);
    onRuntimeMessage("Scraping de la liste de tags en cours...");

    try {
      if (usesTemplatePaging) {
        for (let pageIndex = 0; pageIndex < MAX_TAG_LIST_PAGES; pageIndex += 1) {
          const targetUrl = resolveScraperTagListTargetUrl(scraper.baseUrl, config, { pageIndex });

          try {
            const result = await processTargetUrl(targetUrl);
            if (pageIndex > 0 && result.itemCount === 0) {
              break;
            }

            if (pageIndex > 0 && result.newCount === 0 && queuedUrls.length === 0) {
              break;
            }
          } catch (error) {
            if (pageIndex === 0) {
              throw error;
            }

            break;
          }

          if (requestId !== requestIdRef.current) {
            return;
          }
        }
      } else {
        enqueueUrl(resolveScraperTagListTargetUrl(scraper.baseUrl, config, { pageIndex: 0 }));
      }

      while (queuedUrls.length > 0 && visitedUrls.size < MAX_TAG_LIST_PAGES) {
        const nextUrl = queuedUrls.shift();
        if (!nextUrl) {
          continue;
        }

        await processTargetUrl(nextUrl);
        if (requestId !== requestIdRef.current) {
          return;
        }
      }

      if (queuedUrls.length > 0 || visitedUrls.size >= MAX_TAG_LIST_PAGES) {
        pageLimitReached = true;
      }

      const scrapedTags = sortTagsByName(Array.from(tagsByKey.values()));
      if (!scrapedTags.length) {
        setTags([]);
        setCacheRecord(null);
        onRuntimeMessage(null);
        onRuntimeError("Aucun tag exploitable n'a ete extrait avec la configuration actuelle.");
        return;
      }

      const savedRecord = await api.saveScraperTagListCache({
        scraperId: scraper.id,
        sourceUrl: firstSourceUrl,
        tags: scrapedTags,
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setCacheRecord(savedRecord);
      setTags(sortTagsByName(savedRecord.tags));
      onRuntimeMessage([
        `Liste de tags enregistree : ${savedRecord.tags.length} tag(s) depuis ${visitedUrls.size} page(s).`,
        pageLimitReached ? `Limite de ${MAX_TAG_LIST_PAGES} pages atteinte.` : "",
      ].filter(Boolean).join(" "));
    } catch (error) {
      if (requestId === requestIdRef.current) {
        onRuntimeMessage(null);
        onRuntimeError(error instanceof Error ? error.message : "Impossible de scraper la liste de tags.");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setScraping(false);
      }
    }
  }, [config, fetchTagListPage, onRuntimeError, onRuntimeMessage, runnable, scraper.baseUrl, scraper.id]);

  const openTag = useCallback((tag: ScraperTagListItem) => {
    const targetValue = getTagTargetValue(tag);
    if (!targetValue) {
      return;
    }

    if (!hasTag) {
      onRuntimeError("Configure le composant Tag pour ouvrir les tags depuis cette liste.");
      return;
    }

    onRuntimeError(null);
    onOpenTag(targetValue, tag.name);
  }, [hasTag, onOpenTag, onRuntimeError]);

  const openTagInWorkspace = useCallback((tag: ScraperTagListItem) => {
    const targetValue = getTagTargetValue(tag);
    if (!targetValue) {
      return;
    }

    if (!hasTag) {
      onRuntimeError("Configure le composant Tag pour ouvrir les tags dans un onglet workspace.");
      return;
    }

    onRuntimeError(null);
    onOpenTagInWorkspace(targetValue, tag.name);
  }, [hasTag, onOpenTagInWorkspace, onRuntimeError]);

  const handleTagClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>, tag: ScraperTagListItem) => {
    event.preventDefault();
    openTag(tag);
  }, [openTag]);

  const handleTagAuxClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>, tag: ScraperTagListItem) => {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    openTagInWorkspace(tag);
  }, [openTagInWorkspace]);

  const handleTagContextMenu = useCallback((event: React.MouseEvent<HTMLElement>, tag: ScraperTagListItem) => {
    event.preventDefault();
    setContextMenu({
      tag,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const openFavoriteDialog = useCallback((tag: ScraperTagListItem) => {
    const tagTarget = getTagTargetValue(tag);
    if (!tagTarget) {
      return;
    }

    openModal({
      title: "Ajouter un tag favori",
      content: (
        <ScraperSourceFavoriteDialog<ScraperTagFavoriteRecord>
          favorites={favorites}
          loading={favoritesLoading}
          labels={{
            existingMode: "Tag existant",
            newMode: "Nouveau tag",
            favoriteField: "Tag favori",
            sourceField: "Nom dans ce scrapper",
            commonNamePlaceholder: "Nom commun",
            sourceNamePlaceholder: "Nom source",
            saving: "Enregistrement...",
            save: "Enregistrer",
            cancel: "Annuler",
            error: "Impossible d'enregistrer ce favori tag.",
          }}
          defaultFavoriteName={tag.name}
          defaultSourceName={tag.name}
          onCancel={closeModal}
          onSaved={() => closeModal()}
          onSave={(request) => saveScraperTagFavorite({
            favoriteId: request.favoriteId,
            name: request.name,
            cover: request.cover,
            source: {
              scraperId: scraper.id,
              tagUrl: tagTarget,
              name: request.sourceName,
            },
          })}
        />
      ),
      className: "scraper-author-favorite-modal",
    });
  }, [closeModal, favorites, favoritesLoading, openModal, scraper.id]);

  const handleToggleFavorite = useCallback(async (tag: ScraperTagListItem) => {
    const favoriteSource = findScraperTagFavoriteSource(tagFavoriteSources, tag.name, tag.url);
    setContextMenu(null);

    if (!favoriteSource) {
      openFavoriteDialog(tag);
      return;
    }

    setPendingAction(true);
    try {
      await removeScraperTagFavoriteSource({
        favoriteId: favoriteSource.favorite.id,
        scraperId: scraper.id,
        tagUrl: favoriteSource.source.tagUrl,
      });
    } catch (error) {
      onRuntimeError(error instanceof Error ? error.message : "Impossible de retirer ce tag des favoris.");
    } finally {
      setPendingAction(false);
    }
  }, [openFavoriteDialog, onRuntimeError, scraper.id, tagFavoriteSources]);

  const handleToggleBlacklist = useCallback((tag: ScraperTagListItem) => {
    const tagTarget = getTagTargetValue(tag);
    if (!tagTarget) {
      return;
    }

    const currentBlacklist = params?.scraperBlacklistedTagsByScraper ?? {};
    const currentEntries = getScraperTagBlacklistEntries(currentBlacklist, scraper.id);
    const existingEntry = findScraperTagBlacklistEntry(currentEntries, tag.name, tag.url);
    const nextEntries = existingEntry
      ? removeScraperTagBlacklistEntry(currentEntries, tag.name, tag.url)
      : [
        ...currentEntries,
        buildScraperTagBlacklistEntry(tagTarget, tag.name),
      ];
    const nextBlacklist = {
      ...currentBlacklist,
      [scraper.id]: nextEntries,
    };

    if (nextEntries.length === 0) {
      delete nextBlacklist[scraper.id];
    }

    setParams({
      scraperBlacklistedTagsByScraper: nextBlacklist,
    }, { remount: false });
    setContextMenu(null);
  }, [params?.scraperBlacklistedTagsByScraper, scraper.id, setParams]);

  const renderTag = useCallback((
    tag: ScraperTagListItem,
    options?: {
      favoriteSource?: ScraperTagFavoriteSourceTarget | null;
      compact?: boolean;
    },
  ) => {
    const tagTarget = getTagTargetValue(tag);
    const tagMatchKeys = getTagMatchKeys(tag);
    const blacklisted = tagMatchKeys.some((key) => blacklistedTagKeySet.has(key));
    const favorite = Boolean(options?.favoriteSource) || tagMatchKeys.some((key) => favoriteTagKeySet.has(key));

    return (
      <a
        key={`${tagTarget || tag.name}-${options?.compact ? "favorite" : "tag"}`}
        className={[
          "scraper-tag-list__tag",
          options?.compact ? "is-compact" : "",
          favorite ? "is-favorite" : "",
          blacklisted ? "is-blacklisted" : "",
        ].join(" ").trim()}
        href={tag.url || "#"}
        onClick={(event) => handleTagClick(event, tag)}
        onAuxClick={(event) => handleTagAuxClick(event, tag)}
        onContextMenu={(event) => handleTagContextMenu(event, tag)}
        title={tag.url || tag.name}
      >
        <span>{tag.name}</span>
        {tag.count ? <small>{tag.count}</small> : null}
      </a>
    );
  }, [
    blacklistedTagKeySet,
    favoriteTagKeySet,
    handleTagAuxClick,
    handleTagClick,
    handleTagContextMenu,
  ]);

  return (
    <section className="scraper-browser__results scraper-tag-list">
      <div className="scraper-browser__results-head">
        <div>
          <h3>Liste de tags</h3>
          <p>
            {cacheRecord
              ? `${tags.length} tag(s) enregistres${cacheSavedAtLabel ? ` - ${cacheSavedAtLabel}` : ""}.`
              : cacheLoading
                ? "Chargement de la liste enregistree..."
                : "Aucune liste enregistree pour ce scrapper."}
          </p>
        </div>
        <div className="scraper-browser__results-side">
          <span className="scraper-browser__results-count">{visibleTags.length} visible(s)</span>
          <button
            type="button"
            className="scraper-tag-list__refresh"
            onClick={() => void scrapeAndSaveTags()}
            disabled={scraping || cacheLoading || !runnable}
            title="Scraper et enregistrer la liste de tags"
          >
            <DownloadArrowIcon aria-hidden="true" focusable="false" />
            <span>{scraping ? "Scraping..." : tags.length ? "Actualiser" : "Scraper"}</span>
          </button>
        </div>
      </div>

      {favoriteTagItems.length > 0 ? (
        <div className="scraper-tag-list__favorites">
          <div className="scraper-tag-list__section-title">
            <StarIcon aria-hidden="true" focusable="false" />
            <strong>Favoris</strong>
            <span>{favoriteTagItems.length}</span>
          </div>
          <div className="scraper-tag-list__favorite-list">
            {favoriteTagItems.map((tag, index) => renderTag(tag, {
              favoriteSource: tagFavoriteSources[index] ?? null,
              compact: true,
            }))}
          </div>
        </div>
      ) : null}

      {blacklistedTagItems.length > 0 ? (
        <div className="scraper-tag-list__blacklist">
          <div className="scraper-tag-list__section-title">
            <FilterRemoveIcon aria-hidden="true" focusable="false" />
            <strong>Blacklist</strong>
            <span>{blacklistedTagItems.length}</span>
          </div>
          <div className="scraper-tag-list__favorite-list">
            {blacklistedTagItems.map((tag) => renderTag(tag, {
              compact: true,
            }))}
          </div>
        </div>
      ) : null}

      <div className="scraper-tag-list__controls">
        <label className="scraper-tag-list__control">
          <span>Tri</span>
          <select
            value={getTagSortOption(tagListViewSettings)}
            onChange={handleSortOptionChange}
          >
            <option value="alpha-asc">Alphabetique A-Z</option>
            <option value="alpha-desc">Alphabetique Z-A</option>
            <option value="count-desc" disabled={!hasTagOccurrenceCounts}>Occurrences decroissantes</option>
            <option value="count-asc" disabled={!hasTagOccurrenceCounts}>Occurrences croissantes</option>
          </select>
        </label>
        <label className="scraper-tag-list__control is-number">
          <span>Min</span>
          <input
            type="number"
            min="0"
            step="1"
            value={tagListViewSettings.minCount ?? ""}
            onChange={handleMinCountChange}
            disabled={!hasTagOccurrenceCounts}
          />
        </label>
        <label className="scraper-tag-list__control is-number">
          <span>Max</span>
          <input
            type="number"
            min="0"
            step="1"
            value={tagListViewSettings.maxCount ?? ""}
            onChange={handleMaxCountChange}
            disabled={!hasTagOccurrenceCounts}
          />
        </label>
        <button
          type="button"
          className="scraper-tag-list__reset"
          onClick={resetTagListViewSettings}
          disabled={!customTagListViewSettings}
          title="Reinitialiser le tri et le filtre"
        >
          <CloseXIcon aria-hidden="true" focusable="false" />
          <span>Reinitialiser</span>
        </button>
        {!hasTagOccurrenceCounts ? (
          <span className="scraper-tag-list__control-note">Aucun compteur exploitable.</span>
        ) : null}
      </div>

      {!hasTag ? (
        <div className="scraper-browser__message is-warning">
          Le composant Tag n&apos;est pas configure. La liste peut etre scrapee, mais les tags ne pourront pas
          ouvrir leur page de resultats.
        </div>
      ) : null}

      {!runnable ? (
        <div className="scraper-browser__message is-warning">
          La liste de tags n&apos;est pas assez configuree pour etre scrapee.
        </div>
      ) : null}

      {cacheLoading ? (
        <div className="scraper-browser__message is-info">Chargement du cache de tags...</div>
      ) : visibleTags.length > 0 ? (
        <VirtualizedTagGrid
          tags={visibleTags}
          renderTag={renderTag}
        />
      ) : tags.length > 0 ? (
        <div className="scraper-browser__message is-info">Aucun tag ne correspond au filtre actuel.</div>
      ) : (
        <div className="scraper-browser__message is-info">
          Scrape la liste une premiere fois pour l&apos;enregistrer et pouvoir rechercher dedans sans relancer le scraping.
        </div>
      )}

      {contextMenu ? (
        <div
          className="scraper-tag-list__context-menu"
          style={getContextMenuPosition(contextMenu)}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => void handleToggleFavorite(contextMenu.tag)}
            disabled={pendingAction}
          >
            <StarIcon aria-hidden="true" focusable="false" />
            <span>{contextFavoriteSource ? "Retirer des favoris" : "Ajouter aux favoris"}</span>
          </button>
          <button
            type="button"
            onClick={() => handleToggleBlacklist(contextMenu.tag)}
            disabled={pendingAction}
          >
            <FilterRemoveIcon aria-hidden="true" focusable="false" />
            <span>{contextBlacklistEntry ? "Retirer de la blacklist" : "Ajouter a la blacklist"}</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
