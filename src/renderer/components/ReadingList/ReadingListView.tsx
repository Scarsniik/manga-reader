import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Reader from "@/renderer/components/Reader/Reader";
import ReadingListCard from "@/renderer/components/ReadingList/ReadingListCard";
import ReadingListSetup from "@/renderer/components/ReadingList/ReadingListSetup";
import {
  getReadingListBookmarkTarget,
  resolveReadingListDetailsTarget,
  resolveReadingListReaderTarget,
} from "@/renderer/components/ReadingList/readingListReader";
import { shuffleReadingListItems } from "@/renderer/components/ReadingList/readingListItems";
import {
  autoSortReadingListItems,
  moveReadingListItem,
  reorderReadingListItems,
  type ReadingListDropEdge,
} from "@/renderer/components/ReadingList/readingListOrdering";
import useSaveReadingList from "@/renderer/components/ReadingList/useSaveReadingList";
import useAuthors from "@/renderer/hooks/useAuthors";
import useTags from "@/renderer/hooks/useTags";
import {
  getScraperBookmarkKey,
  loadScraperBookmarks,
  removeScraperBookmark,
} from "@/renderer/stores/scraperBookmarks";
import type { Manga } from "@/renderer/types";
import type {
  ReadingListItem,
  ReadingListItemStatus,
  ReadingListOptions,
} from "@/renderer/types/readingList";
import type { ReaderWorkspaceTarget } from "@/renderer/types/workspace";
import {
  buildReaderSearch,
  openWorkspaceTarget,
} from "@/renderer/utils/workspaceTargets";
import "@/renderer/components/ReadingList/style.scss";

type Props = {
  initialItems: ReadingListItem[];
  autoStart?: boolean;
};

type ReadingListPhase = "setup" | "reading" | "summary";

const DEFAULT_OPTIONS: ReadingListOptions = {
  randomOrder: false,
  removeBookmarkAfterReading: true,
  resumeProgress: true,
};

export default function ReadingListView({ initialItems, autoStart = false }: Props) {
  const { authors } = useAuthors();
  const { tags } = useTags();
  const [items, setItems] = useState<ReadingListItem[]>(initialItems);
  const [orderedItems, setOrderedItems] = useState<ReadingListItem[]>(initialItems);
  const [options, setOptions] = useState<ReadingListOptions>(DEFAULT_OPTIONS);
  const [phase, setPhase] = useState<ReadingListPhase>("setup");
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTarget, setActiveTarget] = useState<ReaderWorkspaceTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ReadingListItemStatus>>({});
  const requestIdRef = useRef(0);
  const autoStartHandledRef = useRef(false);
  const readingListSave = useSaveReadingList(items);

  const handleOpenDetails = useCallback(async (item: ReadingListItem) => {
    try {
      const detailsTarget = await resolveReadingListDetailsTarget(item);
      if (!detailsTarget) {
        window.alert("Aucune fiche source n'est disponible pour ce manga.");
        return;
      }

      const opened = await openWorkspaceTarget(detailsTarget);
      if (!opened) {
        window.alert("Impossible d'ouvrir la fiche dans un nouvel onglet.");
      }
    } catch (error) {
      console.error("ReadingListView: failed to open manga details", error);
      window.alert(error instanceof Error ? error.message : "Impossible d'ouvrir la fiche du manga.");
    }
  }, []);

  useEffect(() => {
    if (!window.api || typeof window.api.getMangas !== "function") {
      return;
    }

    let cancelled = false;
    void window.api.getMangas().then((mangas: Manga[]) => {
      if (cancelled || !Array.isArray(mangas)) {
        return;
      }

      const mangasById = new Map(mangas.map((manga) => [String(manga.id), manga]));
      const tagsById = new Map(tags.map((tag) => [tag.id, tag.name]));
      const authorsById = new Map(authors.map((author) => [author.id, author.name]));
      setItems((currentItems) => currentItems.map((item) => {
        if (item.sourceTarget.kind !== "reader") {
          return item;
        }

        const manga = mangasById.get(String(item.sourceTarget.mangaId));
        if (!manga) {
          return item;
        }

        return {
          ...item,
          metadata: {
            ...item.metadata,
            title: manga.title || item.metadata.title,
            cover: manga.thumbnailPath || item.metadata.cover,
            authors: manga.authorIds.map((authorId) => authorsById.get(authorId)).filter((name): name is string => Boolean(name)),
            tags: manga.tagIds.map((tagId) => tagsById.get(tagId)).filter((name): name is string => Boolean(name)),
            languageCodes: manga.language ? [manga.language] : item.metadata.languageCodes,
          },
        };
      }));
    }).catch((error: unknown) => {
      console.warn("ReadingListView: failed to enrich library items", error);
    });

    return () => {
      cancelled = true;
    };
  }, [authors, tags]);

  const loadItem = useCallback(async (index: number, sourceItems = orderedItems) => {
    const item = sourceItems[index];
    if (!item) {
      setPhase("summary");
      setActiveTarget(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setLoadError(null);

    try {
      const target = await resolveReadingListReaderTarget(item, options.resumeProgress);
      if (requestId !== requestIdRef.current) {
        return;
      }

      setActiveIndex(index);
      setActiveTarget(target);
      setPhase("reading");
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setActiveIndex(index);
      setActiveTarget(null);
      setPhase("reading");
      setLoadError(error instanceof Error ? error.message : "Impossible d'ouvrir ce manga.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [options.resumeProgress, orderedItems]);

  const handleStart = useCallback(() => {
    const nextOrderedItems = options.randomOrder ? shuffleReadingListItems(items) : [...items];
    setOrderedItems(nextOrderedItems);
    setStatuses({});
    void loadItem(0, nextOrderedItems);
  }, [items, loadItem, options.randomOrder]);

  useEffect(() => {
    if (!autoStart || autoStartHandledRef.current || items.length === 0) {
      return;
    }

    autoStartHandledRef.current = true;
    handleStart();
  }, [autoStart, handleStart, items.length]);

  const handleItemCompleted = useCallback(async () => {
    const item = orderedItems[activeIndex];
    if (!item) {
      return;
    }

    setStatuses((currentStatuses) => ({
      ...currentStatuses,
      [item.id]: {
        bookmarkRemoved: currentStatuses[item.id]?.bookmarkRemoved ?? false,
        completed: true,
      },
    }));

    if (!options.removeBookmarkAfterReading) {
      return;
    }

    const bookmarkTarget = await getReadingListBookmarkTarget(item);
    if (!bookmarkTarget) {
      return;
    }

    try {
      const bookmarks = await loadScraperBookmarks();
      const bookmarkKey = getScraperBookmarkKey(bookmarkTarget.scraperId, bookmarkTarget.sourceUrl);
      const isBookmarked = bookmarks.some((bookmark) => (
        getScraperBookmarkKey(bookmark.scraperId, bookmark.sourceUrl) === bookmarkKey
      ));
      if (!isBookmarked) {
        return;
      }

      const removed = await removeScraperBookmark(bookmarkTarget);
      setStatuses((currentStatuses) => ({
        ...currentStatuses,
        [item.id]: {
          bookmarkRemoved: removed,
          bookmarkRemovalError: removed ? null : "Impossible de retirer le bookmark",
          completed: true,
        },
      }));
    } catch (error) {
      setStatuses((currentStatuses) => ({
        ...currentStatuses,
        [item.id]: {
          bookmarkRemoved: false,
          bookmarkRemovalError: error instanceof Error ? error.message : "Impossible de retirer le bookmark",
          completed: true,
        },
      }));
    }
  }, [activeIndex, options.removeBookmarkAfterReading, orderedItems]);

  const activeItem = orderedItems[activeIndex] ?? null;
  const nextItem = orderedItems[activeIndex + 1] ?? null;
  const readingListNavigation = useMemo(() => ({
    currentPosition: activeIndex + 1,
    totalItems: orderedItems.length,
    nextItem: nextItem?.metadata ?? null,
    onContinue: () => loadItem(activeIndex + 1),
    onCurrentItemCompleted: handleItemCompleted,
    onFinished: () => {
      setActiveTarget(null);
      setPhase("summary");
    },
    onOpenCurrentDetails: () => activeItem ? handleOpenDetails(activeItem) : undefined,
  }), [activeIndex, activeItem, handleItemCompleted, handleOpenDetails, loadItem, nextItem?.metadata, orderedItems.length]);

  const handleSkipUnavailableItem = useCallback(() => {
    if (activeIndex + 1 < orderedItems.length) {
      void loadItem(activeIndex + 1);
      return;
    }

    setPhase("summary");
  }, [activeIndex, loadItem, orderedItems.length]);

  const handleOptionChange = useCallback((
    option: keyof ReadingListOptions,
    checked: boolean,
  ) => {
    setOptions((currentOptions) => ({
      ...currentOptions,
      [option]: checked,
    }));
  }, []);

  const handleAutoSort = useCallback(() => {
    setItems((currentItems) => autoSortReadingListItems(currentItems));
  }, []);

  const handleMove = useCallback((itemId: string, offset: number) => {
    setItems((currentItems) => moveReadingListItem(currentItems, itemId, offset));
  }, []);

  const handleReorder = useCallback((
    sourceItemId: string,
    targetItemId: string,
    dropEdge: ReadingListDropEdge,
  ) => {
    setItems((currentItems) => reorderReadingListItems(
      currentItems,
      sourceItemId,
      targetItemId,
      dropEdge,
    ));
  }, []);

  if (phase === "reading") {
    if (loading) {
      return <div className="reading-list-state">Chargement du manga...</div>;
    }

    if (loadError || !activeTarget || !activeItem) {
      return (
        <section className="reading-list-state is-error">
          <h2>Impossible d&apos;ouvrir ce manga</h2>
          <p>{loadError || "La cible lecteur est indisponible."}</p>
          <div className="reading-list-state__actions">
            <button type="button" onClick={() => void loadItem(activeIndex)}>Réessayer</button>
            <button type="button" onClick={handleSkipUnavailableItem}>Passer au suivant</button>
            <button type="button" onClick={() => setPhase("setup")}>Retour à la liste</button>
          </div>
        </section>
      );
    }

    return (
      <Reader
        key={`${activeItem.id}:${activeTarget.mangaId}`}
        initialLocationSearch={buildReaderSearch(activeTarget.mangaId, activeTarget.page ?? 1)}
        initialLocationState={activeTarget.locationState ?? null}
        onBack={() => {
          requestIdRef.current += 1;
          setActiveTarget(null);
          setPhase("setup");
        }}
        showBackButton
        syncWindowPageParam={false}
        readingListNavigation={readingListNavigation}
      />
    );
  }

  if (phase === "summary") {
    return (
      <section className="reading-list-view reading-list-summary">
        <header className="reading-list-view__header">
          <span className="reading-list-view__eyebrow">Liste terminée</span>
          <h2>Résumé de la lecture</h2>
          <p>{Object.values(statuses).filter((status) => status.completed).length} manga(s) lu(s).</p>
        </header>
        <div className="reading-list-grid">
          {orderedItems.map((item, index) => (
            <ReadingListCard
              key={item.id}
              item={item}
              index={index}
              status={statuses[item.id]}
              showReadingStatus
              onOpenDetails={(targetItem) => {
                void handleOpenDetails(targetItem);
              }}
            />
          ))}
        </div>
        <button type="button" className="reading-list-primary-action" onClick={() => setPhase("setup")}>
          Retour à la liste de lecture
        </button>
      </section>
    );
  }

  return (
    <ReadingListSetup
      items={items}
      loading={loading}
      options={options}
      saved={readingListSave.saved}
      saving={readingListSave.saving}
      saveError={readingListSave.error}
      onAutoSort={handleAutoSort}
      onMove={handleMove}
      onOpenDetails={(item) => {
        void handleOpenDetails(item);
      }}
      onOptionChange={handleOptionChange}
      onRemove={(itemId) => {
        setItems((currentItems) => currentItems.filter((candidate) => candidate.id !== itemId));
      }}
      onSave={() => {
        void readingListSave.save();
      }}
      onReorder={handleReorder}
      onStart={handleStart}
    />
  );
}
