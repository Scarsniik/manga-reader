import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OpenBookIcon, TrashCanIcon } from "@/renderer/components/icons";
import type { ReaderLocationState } from "@/renderer/components/Reader/types";
import { normalizeReaderAssetSrc } from "@/renderer/components/Reader/utils";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import type { SavedReadingList } from "@/shared/readingList";
import "@/renderer/components/ScraperBookmarks/savedReadingLists.scss";

type SavedReadingListsApi = {
  deleteSavedReadingList?: (id: string) => Promise<boolean>;
  getSavedReadingLists?: () => Promise<SavedReadingList<ReaderLocationState>[]>;
  onSavedReadingListsUpdated?: (callback: () => void) => () => void;
};

type SavedList = SavedReadingList<ReaderLocationState>;

const SAVED_LIST_PREVIEW_COUNT = 4;

const getSavedReadingListsApi = (): SavedReadingListsApi => (
  (window.api ?? {}) as SavedReadingListsApi
);

const formatSavedListDate = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const getSavedListWorkspaceTitle = (list: SavedList): string => {
  const date = new Date(list.createdAt);
  if (Number.isNaN(date.getTime())) {
    return "Liste de lecture enregistrée";
  }

  const formattedDate = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
  }).format(date);
  return `Liste de lecture - ${formattedDate}`;
};

type SavedReadingListRowProps = {
  deleting: boolean;
  list: SavedList;
  onDelete: (list: SavedList) => void;
  onOpen: (list: SavedList, autoStart: boolean) => void;
};

function SavedReadingListRow({
  deleting,
  list,
  onDelete,
  onOpen,
}: SavedReadingListRowProps) {
  const previewItems = list.items.slice(0, SAVED_LIST_PREVIEW_COUNT);
  const remainingItemCount = Math.max(0, list.items.length - previewItems.length);
  const mangaCountLabel = `${list.items.length} manga${list.items.length > 1 ? "s" : ""}`;

  return (
    <article className="saved-reading-list-row">
      <button
        type="button"
        className="saved-reading-list-row__open"
        onClick={() => onOpen(list, false)}
        aria-label={`Ouvrir la liste de lecture de ${mangaCountLabel}`}
      >
        <span className="saved-reading-list-row__covers" aria-hidden="true">
          {previewItems.map((item, index) => {
            const coverSrc = normalizeReaderAssetSrc(item.metadata.cover ?? null);

            return (
              <span
                key={`${item.id}:${index}`}
                className="saved-reading-list-row__cover"
              >
                {coverSrc ? <img src={coverSrc} alt="" /> : <span>—</span>}
              </span>
            );
          })}
          {remainingItemCount > 0 ? (
            <span className="saved-reading-list-row__remaining">+{remainingItemCount}</span>
          ) : null}
        </span>

        <span className="saved-reading-list-row__details">
          <strong>Liste de lecture</strong>
          <span>{mangaCountLabel}</span>
          <time dateTime={list.createdAt}>Enregistrée le {formatSavedListDate(list.createdAt)}</time>
        </span>
      </button>

      <span className="saved-reading-list-row__actions">
        <button
          type="button"
          className="saved-reading-list-row__action is-primary"
          onClick={() => onOpen(list, true)}
          disabled={deleting || list.items.length === 0}
          title="Lire cette liste maintenant"
        >
          <OpenBookIcon aria-hidden="true" focusable="false" />
          Lecture
        </button>
        <button
          type="button"
          className="saved-reading-list-row__action is-danger"
          onClick={() => onDelete(list)}
          disabled={deleting}
          title="Supprimer cette liste enregistrée"
        >
          <TrashCanIcon aria-hidden="true" focusable="false" />
          {deleting ? "Suppression..." : "Supprimer"}
        </button>
      </span>
    </article>
  );
}

export default function SavedReadingListsView() {
  const mountedRef = useRef(true);
  const [lists, setLists] = useState<SavedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);

  const sortedLists = useMemo(() => (
    [...lists].sort((left, right) => (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    ))
  ), [lists]);

  const loadLists = useCallback(async (showLoading = false) => {
    const api = getSavedReadingListsApi();
    if (typeof api.getSavedReadingLists !== "function") {
      if (mountedRef.current) {
        setLists([]);
        setLoading(false);
        setError("Les listes de lecture enregistrées ne sont pas disponibles dans cette version.");
      }
      return;
    }

    if (showLoading && mountedRef.current) {
      setLoading(true);
    }

    try {
      const savedLists = await api.getSavedReadingLists();
      if (mountedRef.current) {
        setLists(Array.isArray(savedLists) ? savedLists : []);
        setError(null);
      }
    } catch (loadError) {
      if (mountedRef.current) {
        setError(loadError instanceof Error
          ? loadError.message
          : "Impossible de charger les listes de lecture enregistrées.");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadLists(true);

    const api = getSavedReadingListsApi();
    const unsubscribe = typeof api.onSavedReadingListsUpdated === "function"
      ? api.onSavedReadingListsUpdated(() => {
        void loadLists();
      })
      : undefined;

    return () => {
      mountedRef.current = false;
      unsubscribe?.();
    };
  }, [loadLists]);

  const handleOpenList = useCallback((list: SavedList, autoStart: boolean) => {
    setError(null);
    void openWorkspaceTarget({
      kind: "reading-list",
      items: list.items,
      title: getSavedListWorkspaceTitle(list),
      autoStart,
    }, { activate: true }).then((opened) => {
      if (!opened && mountedRef.current) {
        setError("Impossible d'ouvrir cette liste de lecture dans le workspace.");
      }
    }).catch((openError: unknown) => {
      if (mountedRef.current) {
        setError(openError instanceof Error
          ? openError.message
          : "Impossible d'ouvrir cette liste de lecture dans le workspace.");
      }
    });
  }, []);

  const handleDeleteList = useCallback(async (list: SavedList) => {
    const api = getSavedReadingListsApi();
    if (typeof api.deleteSavedReadingList !== "function") {
      setError("La suppression des listes de lecture n'est pas disponible dans cette version.");
      return;
    }

    setDeletingListId(list.id);
    setError(null);
    try {
      const deleted = await api.deleteSavedReadingList(list.id);
      if (!deleted) {
        throw new Error("La liste de lecture n'a pas pu être supprimée.");
      }

      if (mountedRef.current) {
        setLists((currentLists) => currentLists.filter((currentList) => currentList.id !== list.id));
      }
    } catch (deleteError) {
      if (mountedRef.current) {
        setError(deleteError instanceof Error
          ? deleteError.message
          : "Impossible de supprimer cette liste de lecture.");
      }
    } finally {
      if (mountedRef.current) {
        setDeletingListId(null);
      }
    }
  }, []);

  return (
    <div className="saved-reading-lists-view">
      <header className="saved-reading-lists-view__header">
        <div>
          <span className="scraper-browser__eyebrow">Listes de lecture</span>
          <h2>Listes enregistrées</h2>
          <p>Retrouvez vos listes telles qu'elles étaient au moment de leur enregistrement.</p>
        </div>
        {!loading ? (
          <span className="saved-reading-lists-view__count" aria-live="polite">
            {lists.length} liste{lists.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </header>

      {error ? <div className="scraper-browser__message is-error" role="alert">{error}</div> : null}

      {loading ? (
        <div className="scraper-browser__message" role="status">
          Chargement des listes de lecture...
        </div>
      ) : sortedLists.length === 0 ? (
        <div className="saved-reading-lists-view__empty" role="status">
          <OpenBookIcon aria-hidden="true" focusable="false" />
          <strong>Aucune liste enregistrée</strong>
          <span>Enregistrez une liste de lecture pour la retrouver ici.</span>
        </div>
      ) : (
        <div className="saved-reading-lists-view__list">
          {sortedLists.map((list) => (
            <SavedReadingListRow
              key={list.id}
              list={list}
              deleting={deletingListId === list.id}
              onDelete={handleDeleteList}
              onOpen={handleOpenList}
            />
          ))}
        </div>
      )}
    </div>
  );
}
