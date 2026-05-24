import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  DetailsHistoryRecord,
  ReadingHistoryRecord,
  SearchHistoryRecord,
} from "@/shared/history";
import type { ScraperRecord } from "@/shared/scraper";
import {
  HISTORY_MULTI_SOURCE_FILTER,
  HISTORY_PAGE_SIZE,
  HISTORY_TABS,
  matchesHistoryScraperFilter,
  matchesHistorySearch,
  resolveReadingProgressRecord,
  toPositiveInteger,
  type HistoryTabId,
} from "@/renderer/components/History/historyUtils";
import {
  HistoryDetailsCard,
  HistoryReadingCard,
} from "@/renderer/components/History/HistoryRecordCards";
import HistorySearchRows from "@/renderer/components/History/HistorySearchRows";
import {
  HistoryFilters,
  HistoryPagination,
  HistoryTabs,
} from "@/renderer/components/History/HistoryControls";
import { useHistoryData } from "@/renderer/components/History/useHistoryData";
import { useHistoryRecordRemoval } from "@/renderer/components/History/useHistoryRecordRemoval";
import { resolveScraperReader } from "@/renderer/components/History/historyReader";
import { createScraperMangaId } from "@/renderer/utils/scraperRuntime";
import { writeScraperRouteState } from "@/renderer/utils/scraperBrowserNavigation";
import { recordReadingHistorySafe, toLocalImageUrl } from "@/renderer/utils/history";
import {
  buildReaderPath,
  openReaderWorkspaceTarget,
} from "@/renderer/utils/workspaceTargets";
import "./style.scss";

type Props = {
  scrapers: ScraperRecord[];
};

const getHistoryApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

export default function HistoryView({ scrapers }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<HistoryTabId>("reading");
  const [query, setQuery] = useState("");
  const [scraperFilter, setScraperFilter] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyRecordId, setBusyRecordId] = useState<string | null>(null);
  const {
    historyRecords,
    setHistoryRecords,
    mangaById,
    progressIndexes,
    scrapersById,
    loading,
    loadError,
    refreshData,
  } = useHistoryData(scrapers);
  const {
    removeReadingRecord,
    removeDetailsRecord,
    removeSearchRecord,
  } = useHistoryRecordRemoval({
    setHistoryRecords,
    setBusyRecordId,
    setMessage,
    setError,
  });

  useEffect(() => {
    setPage(1);
  }, [activeTab, query, scraperFilter]);

  useEffect(() => {
    if (activeTab !== "reading" && scraperFilter === "library") {
      setScraperFilter("");
    }

    if (activeTab !== "searches" && scraperFilter === HISTORY_MULTI_SOURCE_FILTER) {
      setScraperFilter("");
    }
  }, [activeTab, scraperFilter]);

  const filteredReadingRecords = useMemo(() => (
    historyRecords.reading.filter((record) => (
      matchesHistorySearch(record, scrapersById, query)
      && matchesHistoryScraperFilter(record, scraperFilter)
    ))
  ), [historyRecords.reading, query, scraperFilter, scrapersById]);

  const filteredDetailsRecords = useMemo(() => (
    historyRecords.details.filter((record) => (
      matchesHistorySearch(record, scrapersById, query)
      && matchesHistoryScraperFilter(record, scraperFilter)
    ))
  ), [historyRecords.details, query, scraperFilter, scrapersById]);

  const filteredSearchRecords = useMemo(() => (
    historyRecords.searches.filter((record) => (
      matchesHistorySearch(record, scrapersById, query)
      && matchesHistoryScraperFilter(record, scraperFilter)
    ))
  ), [historyRecords.searches, query, scraperFilter, scrapersById]);

  const activeRecords = activeTab === "reading"
    ? filteredReadingRecords
    : activeTab === "details"
      ? filteredDetailsRecords
      : filteredSearchRecords;
  const totalPages = Math.max(1, Math.ceil(activeRecords.length / HISTORY_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRecords = activeRecords.slice(
    (currentPage - 1) * HISTORY_PAGE_SIZE,
    currentPage * HISTORY_PAGE_SIZE,
  );

  const openDetailsRecord = useCallback((record: DetailsHistoryRecord) => {
    navigate({
      pathname: location.pathname,
      search: writeScraperRouteState(location.search, {
        scraperId: record.scraperId,
        mode: "manga",
        searchActive: false,
        searchQuery: "",
        searchPage: 1,
        authorActive: false,
        authorQuery: "",
        authorPage: 1,
        mangaQuery: "",
        mangaUrl: record.sourceUrl,
      }),
    });
  }, [location.pathname, location.search, navigate]);

  const openScraperReader = useCallback(async (
    record: ReadingHistoryRecord | DetailsHistoryRecord,
    openInWorkspace = false,
  ) => {
    if (!record.scraperId) {
      return;
    }

    const scraper = scrapersById.get(record.scraperId) ?? null;
    if (!scraper) {
      setError("Le scrapper source est introuvable.");
      return;
    }

    setBusyRecordId(record.id);
    setError(null);
    setMessage(null);
    try {
      const resolution = await resolveScraperReader(record, scraper);
      const readerLocationState = {
        from: {
          pathname: location.pathname,
          search: location.search,
        },
        mangaId: resolution.readerMangaId,
        scraperReader: {
          id: resolution.readerMangaId,
          scraperId: scraper.id,
          title: resolution.title,
          sourceUrl: resolution.sourceUrl,
          cover: resolution.cover,
          language: resolution.detailsResult.languageCodes?.[0] || scraper.globalConfig.defaultLanguage || null,
          pageUrls: resolution.pageUrls,
          chapter: resolution.chapter,
          bookmarkExcludedFields: scraper.globalConfig.bookmark.excludedFields,
        },
      };

      if (openInWorkspace) {
        const opened = await openReaderWorkspaceTarget({
          mangaId: resolution.readerMangaId,
          page: resolution.initialPage,
          title: resolution.title,
          locationState: readerLocationState,
        });

        if (!opened) {
          throw new Error("L'ouverture du lecteur dans un onglet workspace n'est pas disponible dans cette version.");
        }
        return;
      }

      navigate(
        buildReaderPath(resolution.readerMangaId, resolution.initialPage),
        {
          state: readerLocationState,
        },
      );
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Impossible d'ouvrir le lecteur.");
    } finally {
      setBusyRecordId(null);
    }
  }, [location.pathname, location.search, navigate, scrapersById]);

  const openLibraryReader = useCallback(async (
    record: ReadingHistoryRecord,
    openInWorkspace = false,
  ) => {
    if (!record.mangaId) {
      return;
    }

    const manga = mangaById.get(record.mangaId);
    if (!manga) {
      setError("Ce manga n'existe plus dans la bibliotheque.");
      return;
    }

    let totalPageCount = toPositiveInteger(manga.pages);
    if (totalPageCount === null && manga.path && typeof getHistoryApi()?.countPages === "function") {
      totalPageCount = toPositiveInteger(await getHistoryApi().countPages(manga.path));
    }

    const savedPage = toPositiveInteger(manga.currentPage) ?? 1;
    const targetPage = totalPageCount !== null && savedPage >= totalPageCount ? 1 : savedPage;
    const readerLocationState = {
      from: {
        pathname: location.pathname,
        search: location.search,
      },
      mangaId: manga.id,
    };

    if (openInWorkspace) {
      const opened = await openReaderWorkspaceTarget({
        mangaId: manga.id,
        page: targetPage,
        title: manga.title,
        locationState: readerLocationState,
      });

      if (!opened) {
        setError("L'ouverture du lecteur dans un onglet workspace n'est pas disponible dans cette version.");
      }
      return;
    }

    navigate(
      buildReaderPath(manga.id, targetPage),
      {
        state: readerLocationState,
      },
    );
  }, [location.pathname, location.search, mangaById, navigate]);

  const markReadingRecordRead = useCallback(async (record: ReadingHistoryRecord) => {
    setBusyRecordId(record.id);
    setError(null);
    setMessage(null);
    try {
      if (record.sourceKind === "library") {
        const manga = record.mangaId ? mangaById.get(record.mangaId) : null;
        if (!manga) {
          throw new Error("Ce manga n'existe plus dans la bibliotheque.");
        }

        const totalPagesForManga = toPositiveInteger(manga.pages)
          ?? (manga.path && typeof getHistoryApi()?.countPages === "function"
            ? toPositiveInteger(await getHistoryApi().countPages(manga.path))
            : null);
        if (totalPagesForManga === null) {
          throw new Error("Le nombre de pages est inconnu pour ce manga.");
        }

        await getHistoryApi().updateManga({
          id: manga.id,
          currentPage: totalPagesForManga,
          pages: totalPagesForManga,
        });
        await recordReadingHistorySafe({
          sourceKind: "library",
          mangaId: manga.id,
          title: manga.title,
          cover: toLocalImageUrl(manga.thumbnailPath),
          currentPage: totalPagesForManga,
          totalPages: totalPagesForManga,
        });
      } else {
        const progressRecord = resolveReadingProgressRecord(record, progressIndexes);
        const totalPagesForRecord = toPositiveInteger(progressRecord?.totalPages) ?? toPositiveInteger(record.totalPages);
        if (totalPagesForRecord === null || !record.scraperId || !record.sourceUrl) {
          throw new Error("Le nombre de pages est inconnu pour cette lecture.");
        }

        const readerProgressId = record.readerProgressId
          || progressRecord?.id
          || createScraperMangaId(record.scraperId, record.sourceUrl, record.chapterUrl);
        await getHistoryApi().saveScraperReaderProgress({
          id: readerProgressId,
          scraperId: record.scraperId,
          title: record.title,
          sourceUrl: record.sourceUrl,
          currentPage: totalPagesForRecord,
          totalPages: totalPagesForRecord,
        });
        await recordReadingHistorySafe({
          sourceKind: "scraper",
          scraperId: record.scraperId,
          title: record.title,
          sourceUrl: record.sourceUrl,
          readerProgressId,
          cover: record.cover,
          chapterUrl: record.chapterUrl,
          chapterLabel: record.chapterLabel,
          currentPage: totalPagesForRecord,
          totalPages: totalPagesForRecord,
        });
      }

      await refreshData();
      setMessage("Lecture marquee comme lue.");
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Impossible de marquer cette lecture comme lue.");
    } finally {
      setBusyRecordId(null);
    }
  }, [mangaById, progressIndexes, refreshData]);

  const renderRecords = () => {
    if (activeTab === "reading") {
      return (visibleRecords as ReadingHistoryRecord[]).map((record) => (
        <HistoryReadingCard
          key={record.id}
          record={record}
          busyRecordId={busyRecordId}
          mangaById={mangaById}
          progressIndexes={progressIndexes}
          scrapersById={scrapersById}
          onOpenLibraryReader={(nextRecord, openInWorkspace) => void openLibraryReader(nextRecord, openInWorkspace)}
          onOpenScraperReader={(nextRecord, openInWorkspace) => void openScraperReader(nextRecord, openInWorkspace)}
          onRemove={(nextRecord) => void removeReadingRecord(nextRecord)}
          onMarkRead={(nextRecord) => void markReadingRecordRead(nextRecord)}
        />
      ));
    }

    if (activeTab === "details") {
      return (visibleRecords as DetailsHistoryRecord[]).map((record) => (
        <HistoryDetailsCard
          key={record.id}
          record={record}
          busyRecordId={busyRecordId}
          scrapersById={scrapersById}
          onOpenDetails={openDetailsRecord}
          onOpenScraperReader={(nextRecord, openInWorkspace) => void openScraperReader(nextRecord, openInWorkspace)}
          onRemove={(nextRecord) => void removeDetailsRecord(nextRecord)}
        />
      ));
    }

    return (
      <HistorySearchRows
        records={visibleRecords as SearchHistoryRecord[]}
        busyRecordId={busyRecordId}
        scrapersById={scrapersById}
        onRemove={(record) => void removeSearchRecord(record)}
      />
    );
  };

  return (
    <section className="history-view scraper-browser__panel">
      <div className="history-view__header">
        <div>
          <span className="scraper-browser__eyebrow">Historique</span>
          <h2>Historique</h2>
        </div>
      </div>

      <HistoryTabs
        tabs={HISTORY_TABS}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <HistoryFilters
        activeTab={activeTab}
        query={query}
        scraperFilter={scraperFilter}
        scrapers={scrapers}
        onQueryChange={setQuery}
        onScraperFilterChange={setScraperFilter}
      />

      {message ? <div className="scraper-browser__message is-success">{message}</div> : null}
      {error || loadError ? <div className="scraper-browser__message is-error">{error || loadError}</div> : null}

      {loading ? (
        <div className="scraper-browser__message">Chargement de l'historique...</div>
      ) : activeRecords.length === 0 ? (
        <div className="scraper-browser__message is-warning">
          Aucun element ne correspond a cette vue.
        </div>
      ) : (
        <>
          <HistoryPagination
            currentPage={currentPage}
            totalPages={totalPages}
            resultCount={activeRecords.length}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          />
          <div className={activeTab === "searches" ? "history-search-list" : "scraper-browser__results-grid"}>
            {renderRecords()}
          </div>
        </>
      )}
    </section>
  );
}
