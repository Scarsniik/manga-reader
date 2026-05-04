import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ScraperAuthorFavoriteRecord, ScraperRecord } from "@/shared/scraper";
import ScraperCard, { type ScraperCardAction } from "@/renderer/components/ScraperCard/ScraperCard";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
import {
  buildMultiSearchResultLanguageFilterCodes,
  filterMultiSearchMergedResultsByLanguage,
  getMultiSearchLanguageFilterMode,
  toggleMultiSearchLanguageFilterMode,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import {
  flattenMultiSearchSources,
  mergeMultiSearchResults,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { Manga } from "@/renderer/types";
import useParams from "@/renderer/hooks/useParams";
import { getScraperBookmarkKey, useScraperBookmarks } from "@/renderer/stores/scraperBookmarks";
import {
  removeScraperAuthorFavorite,
  useScraperAuthorFavorites,
} from "@/renderer/stores/scraperAuthorFavorites";
import { writeScraperRouteState } from "@/renderer/utils/scraperBrowserNavigation";
import useAuthorFavoriteRuns from "@/renderer/components/ScraperAuthorFavorites/useAuthorFavoriteRuns";
import "@/renderer/components/MultiSearch/style.scss";
import "@/renderer/components/MultiSearch/card.scss";
import "./style.scss";

type Props = {
  scrapers: ScraperRecord[];
};

const formatSourceSummary = (favorite: ScraperAuthorFavoriteRecord, scrapersById: Map<string, ScraperRecord>) => (
  favorite.sources
    .map((source) => {
      const scraperName = scrapersById.get(source.scraperId)?.name ?? "Scrapper inconnu";
      return `${scraperName}: ${source.name}`;
    })
    .join("\n")
);

export default function ScraperAuthorFavoritesView({
  scrapers,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { params } = useParams();
  const { favorites, loading, error } = useScraperAuthorFavorites();
  const { bookmarks } = useScraperBookmarks();
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<string | null>(null);
  const [libraryMangas, setLibraryMangas] = useState<Manga[]>([]);
  const [openError, setOpenError] = useState<string | null>(null);
  const [languageFilterModes, setLanguageFilterModes] = useState<MultiSearchLanguageFilterModes>({});
  const scrapersById = useMemo(
    () => new Map(scrapers.map((scraper) => [scraper.id, scraper])),
    [scrapers],
  );
  const selectedFavorite = useMemo(
    () => favorites.find((favorite) => favorite.id === selectedFavoriteId) ?? null,
    [favorites, selectedFavoriteId],
  );
  const bookmarkedSourceKeys = useMemo(
    () => new Set(bookmarks.map((bookmark) => getScraperBookmarkKey(bookmark.scraperId, bookmark.sourceUrl))),
    [bookmarks],
  );
  const {
    runs,
    loading: loadingRuns,
    message: runMessage,
    error: runError,
    canLoadMore,
    start,
    loadMoreForAll,
    loadMoreForRun,
  } = useAuthorFavoriteRuns(
    selectedFavorite,
    scrapersById,
    params?.scraperAuthorFavoritePageCount ?? 1,
  );
  const loadedSources = useMemo(() => flattenMultiSearchSources(runs), [runs]);
  const mergedResults = useMemo(() => mergeMultiSearchResults(loadedSources), [loadedSources]);
  const resultLanguageCodes = useMemo(
    () => buildMultiSearchResultLanguageFilterCodes(loadedSources),
    [loadedSources],
  );
  const visibleMergedResults = useMemo(
    () => filterMultiSearchMergedResultsByLanguage(mergedResults, languageFilterModes),
    [languageFilterModes, mergedResults],
  );

  useEffect(() => {
    if (selectedFavoriteId && !favorites.some((favorite) => favorite.id === selectedFavoriteId)) {
      setSelectedFavoriteId(null);
    }
  }, [favorites, selectedFavoriteId]);

  useEffect(() => {
    if (!selectedFavorite) {
      return;
    }

    setLanguageFilterModes({});
    void start();
  }, [selectedFavorite, start]);

  useEffect(() => {
    if (!window.api || typeof window.api.getMangas !== "function") {
      setLibraryMangas([]);
      return;
    }

    void window.api.getMangas()
      .then((data: unknown) => {
        setLibraryMangas(Array.isArray(data) ? data as Manga[] : []);
      })
      .catch((loadError: unknown) => {
        console.warn("Failed to load library mangas for author favorites", loadError);
        setLibraryMangas([]);
      });
  }, []);

  const handleRemoveFavorite = useCallback(async (favorite: ScraperAuthorFavoriteRecord) => {
    const confirmed = window.confirm(`Supprimer l'auteur favori "${favorite.name}" ?`);
    if (!confirmed) {
      return;
    }

    await removeScraperAuthorFavorite({ favoriteId: favorite.id });
    if (selectedFavoriteId === favorite.id) {
      setSelectedFavoriteId(null);
    }
  }, [selectedFavoriteId]);

  const handleToggleLanguageFilterMode = useCallback((
    languageCode: string,
    mode: Exclude<MultiSearchLanguageFilterMode, "default">,
  ) => {
    setLanguageFilterModes((currentModes) => {
      const currentMode = getMultiSearchLanguageFilterMode(currentModes, languageCode);
      const nextMode = toggleMultiSearchLanguageFilterMode(currentMode, mode);
      return {
        ...currentModes,
        [languageCode]: nextMode,
      };
    });
  }, []);

  const handleOpenSource = useCallback((source: MultiSearchSourceResult) => {
    const detailUrl = source.result.detailUrl;
    if (!detailUrl) {
      setOpenError("Cette source ne fournit pas d'URL de fiche.");
      return;
    }

    setOpenError(null);

    if (source.canOpenDetails) {
      navigate({
        pathname: location.pathname,
        search: writeScraperRouteState(location.search, {
          scraperId: source.scraper.id,
          mode: "manga",
          searchActive: false,
          searchQuery: "",
          searchPage: 1,
          authorActive: false,
          authorQuery: "",
          authorPage: 1,
          mangaQuery: "",
          mangaUrl: detailUrl,
          bookmarksFilterScraperId: null,
        }),
      });
      return;
    }

    if (window.api && typeof window.api.openExternalUrl === "function") {
      void window.api.openExternalUrl(detailUrl);
      return;
    }

    setOpenError("L'ouverture de liens externes n'est pas disponible dans cette version.");
  }, [location.pathname, location.search, navigate]);

  const handleOpenSourceInWorkspace = useCallback((source: MultiSearchSourceResult) => {
    const detailUrl = source.result.detailUrl;
    if (!detailUrl) {
      setOpenError("Cette source ne fournit pas d'URL de fiche.");
      return;
    }

    if (!source.canOpenDetails) {
      if (window.api && typeof window.api.openExternalUrl === "function") {
        void window.api.openExternalUrl(detailUrl);
        return;
      }

      setOpenError("Cette source ne peut pas etre ouverte dans un onglet scraper.");
      return;
    }

    if (!window.api || typeof window.api.openWorkspaceTarget !== "function") {
      setOpenError("L'ouverture dans un onglet workspace n'est pas disponible dans cette version.");
      return;
    }

    setOpenError(null);
    void window.api.openWorkspaceTarget({
      kind: "scraper.details",
      scraperId: source.scraper.id,
      sourceUrl: detailUrl,
      title: source.result.title,
    }).then((opened: boolean) => {
      if (!opened) {
        setOpenError("Impossible d'ouvrir cette source dans un onglet workspace.");
      }
    }).catch((workspaceError: unknown) => {
      setOpenError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Impossible d'ouvrir cette source dans un onglet workspace.",
      );
    });
  }, []);

  if (selectedFavorite) {
    return (
      <section className="scraper-author-favorites-view scraper-browser__panel">
        <div className="scraper-author-favorites-view__header">
          <div>
            <button
              type="button"
              className="scraper-author-favorites-view__back"
              onClick={() => setSelectedFavoriteId(null)}
            >
              Retour aux auteurs favoris
            </button>
            <h2>{selectedFavorite.name}</h2>
            <p>{selectedFavorite.sources.length} source(s) auteur associee(s).</p>
          </div>
          <button
            type="button"
            className="scraper-author-favorites-view__clear"
            onClick={() => void start()}
            disabled={loadingRuns}
          >
            Recharger
          </button>
        </div>

        {runMessage ? <div className="multi-search__message is-info">{runMessage}</div> : null}
        {runError || openError ? (
          <div className="multi-search__message is-error">{runError || openError}</div>
        ) : null}

        <section className="scraper-author-favorites-view__sources">
          <div className="multi-search__section-head">
            <div>
              <h3>Sources</h3>
              <p>{runs.length} source(s), {loadedSources.length} resultat(s) charge(s).</p>
            </div>
            <button
              type="button"
              className="multi-search__export-json-button"
              onClick={() => void loadMoreForAll()}
              disabled={loadingRuns || !canLoadMore}
            >
              Charger plus
            </button>
          </div>
          <div className="scraper-author-favorites-view__source-list">
            {runs.map((run) => (
              <div key={run.key} className={`scraper-author-favorites-view__source is-${run.status}`}>
                <div>
                  <strong>{run.scraper.name}</strong>
                  <span>{run.favoriteSource.name}</span>
                  {run.error ? <small>{run.error}</small> : null}
                </div>
                <div>
                  <span>{run.loadedPages} page(s)</span>
                  <button
                    type="button"
                    onClick={() => void loadMoreForRun(run.key)}
                    disabled={loadingRuns || !run.hasNextPage || run.status === "loading"}
                  >
                    Plus
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {loadedSources.length ? (
          <section className="multi-search__results">
            <div className="multi-search__section-head">
              <div>
                <h3>Resultats combines</h3>
                <p>{visibleMergedResults.length} carte(s), {loadedSources.length} source(s) chargee(s).</p>
                <MultiSearchLanguageFilterBar
                  languageCodes={resultLanguageCodes}
                  filterModes={languageFilterModes}
                  onToggleFilterMode={handleToggleLanguageFilterMode}
                />
              </div>
            </div>

            <div className="multi-search__results-grid">
              {visibleMergedResults.map((result) => (
                <MultiSearchResultCard
                  key={result.id}
                  result={result}
                  libraryMangas={libraryMangas}
                  bookmarkedSourceKeys={bookmarkedSourceKeys}
                  onOpenSource={handleOpenSource}
                  onOpenSourceInWorkspace={handleOpenSourceInWorkspace}
                />
              ))}
            </div>
          </section>
        ) : loadingRuns ? (
          <div className="scraper-browser__message">Chargement de l'auteur combine...</div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="scraper-author-favorites-view scraper-browser__panel">
      <div className="scraper-author-favorites-view__header">
        <div>
          <h2>Auteurs favoris</h2>
          <p>Cette vue regroupe les pages auteur sauvegardees depuis les scrappers.</p>
        </div>
      </div>

      {error ? <div className="scraper-browser__message is-error">{error}</div> : null}

      {favorites.length ? (
        <div className="scraper-browser__results-grid">
          {favorites.map((favorite) => {
            const actions: ScraperCardAction[] = [
              {
                id: "open-author-favorite",
                type: "primary",
                label: "Ouvrir",
                onClick: () => setSelectedFavoriteId(favorite.id),
              },
              {
                id: "remove-author-favorite",
                type: "secondary",
                label: "Supprimer",
                onClick: () => void handleRemoveFavorite(favorite),
              },
            ];

            return (
              <ScraperCard
                key={favorite.id}
                title={favorite.name}
                coverUrl={favorite.cover}
                coverAlt={favorite.name}
                summary={formatSourceSummary(favorite, scrapersById)}
                metadata={(
                  <div className="scraper-card__metadata">
                    <span>{favorite.sources.length} source(s)</span>
                  </div>
                )}
                actions={actions}
                isActionable
                onClick={() => setSelectedFavoriteId(favorite.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedFavoriteId(favorite.id);
                  }
                }}
                ariaLabel={`Ouvrir l'auteur favori ${favorite.name}`}
              />
            );
          })}
        </div>
      ) : loading ? (
        <div className="scraper-browser__message">Chargement des auteurs favoris...</div>
      ) : (
        <div className="scraper-browser__message">
          Aucun auteur favori. Ouvre une page auteur dans un scrapper puis utilise l'etoile.
        </div>
      )}
    </section>
  );
}
