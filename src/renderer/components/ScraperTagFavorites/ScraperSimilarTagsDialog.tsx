import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ScraperRecord, ScraperTagFavoriteRecord } from "@/shared/scraper";
import { CloseXIcon, MagnifyingGlassIcon, StarIcon } from "@/renderer/components/icons";
import { useModal } from "@/renderer/hooks/useModal";
import {
  removeScraperTagFavoriteSource,
  saveScraperTagFavorite,
  useScraperTagFavorites,
} from "@/renderer/stores/scraperTagFavorites";
import { findScraperTagFavoriteSource } from "@/renderer/utils/scraperTagFavorites";
import {
  searchSimilarScraperTags,
  type ScraperSimilarTagResult,
  type ScraperSimilarTagSearchResult,
} from "@/renderer/utils/scraperSimilarTags";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";
import "@/renderer/components/ScraperTagFavorites/similar-tags.scss";

type Props = {
  favoriteId: string;
  searchTerms: string[];
  scrapers: ScraperRecord[];
};

const EMPTY_SEARCH_RESULT: ScraperSimilarTagSearchResult = {
  results: [],
  totalMatchCount: 0,
  configuredScraperCount: 0,
  cachedScraperCount: 0,
  missingCacheCount: 0,
  failedScraperCount: 0,
};

const findFavoriteSourceForResult = (
  favorite: ScraperTagFavoriteRecord | null,
  result: ScraperSimilarTagResult,
) => {
  if (!favorite) {
    return null;
  }

  return findScraperTagFavoriteSource(
    favorite.sources
      .filter((source) => source.scraperId === result.scraperId)
      .map((source) => ({ favorite, source })),
    result.tagName,
    result.tagUrl,
  );
};

export default function ScraperSimilarTagsDialog({
  favoriteId,
  searchTerms,
  scrapers,
}: Props) {
  const { closeModal } = useModal();
  const { favorites, loaded } = useScraperTagFavorites();
  const [searchResult, setSearchResult] = useState(EMPTY_SEARCH_RESULT);
  const [loading, setLoading] = useState(true);
  const [pendingResultKeys, setPendingResultKeys] = useState<Set<string>>(new Set());
  const [filterQuery, setFilterQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const favorite = useMemo(
    () => favorites.find((candidate) => candidate.id === favoriteId) ?? null,
    [favoriteId, favorites],
  );
  const normalizedFilterQuery = useMemo(
    () => normalizeFuzzyText(filterQuery),
    [filterQuery],
  );
  const visibleResults = useMemo(() => {
    if (!normalizedFilterQuery) {
      return searchResult.results;
    }

    return searchResult.results.filter((result) => (
      normalizeFuzzyText(`${result.tagName} ${result.scraperName}`).includes(normalizedFilterQuery)
    ));
  }, [normalizedFilterQuery, searchResult.results]);
  const searchTermsKey = searchTerms.join("\u0000");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void searchSimilarScraperTags(scrapers, searchTerms).then((result) => {
      if (active) {
        setSearchResult(result);
      }
    }).catch((searchError) => {
      if (active) {
        setError(searchError instanceof Error ? searchError.message : "La recherche de tags similaires a echoue.");
      }
    }).finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [scrapers, searchTermsKey]);

  useEffect(() => {
    if (loaded && !favorite) {
      closeModal();
    }
  }, [closeModal, favorite, loaded]);

  const setResultPending = useCallback((resultKey: string, pending: boolean) => {
    setPendingResultKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (pending) {
        nextKeys.add(resultKey);
      } else {
        nextKeys.delete(resultKey);
      }
      return nextKeys;
    });
  }, []);

  const handleToggleFavorite = useCallback(async (result: ScraperSimilarTagResult) => {
    if (!favorite || pendingResultKeys.has(result.key)) {
      return;
    }

    const favoriteSource = findFavoriteSourceForResult(favorite, result);
    setResultPending(result.key, true);
    setError(null);

    try {
      if (favoriteSource) {
        await removeScraperTagFavoriteSource({
          favoriteId: favorite.id,
          scraperId: result.scraperId,
          tagUrl: favoriteSource.source.tagUrl,
        });
      } else {
        await saveScraperTagFavorite({
          favoriteId: favorite.id,
          name: favorite.name,
          cover: favorite.cover,
          source: {
            scraperId: result.scraperId,
            tagUrl: result.tagUrl,
            name: result.tagName,
          },
        });
      }
    } catch (toggleError) {
      setError(toggleError instanceof Error
        ? toggleError.message
        : "La modification du favori tag a echoue.");
    } finally {
      setResultPending(result.key, false);
    }
  }, [favorite, pendingResultKeys, setResultPending]);

  const cacheSummary = `${searchResult.cachedScraperCount}/${searchResult.configuredScraperCount} liste(s) chargee(s)`;
  const resultSummary = normalizedFilterQuery
    ? `${visibleResults.length}/${searchResult.results.length} tag(s) visible(s)`
    : searchResult.totalMatchCount > searchResult.results.length
      ? `${searchResult.results.length} premier(s) tag(s) sur ${searchResult.totalMatchCount}`
      : `${searchResult.results.length} tag(s) similaire(s)`;

  return (
    <div className="scraper-similar-tags-dialog">
      <div className="scraper-similar-tags-dialog__summary">
        <span>{loading ? "Recherche en cours..." : resultSummary}</span>
        {!loading ? <small>{cacheSummary}</small> : null}
      </div>

      {!loading && searchResult.configuredScraperCount === 0 ? (
        <div className="scraper-similar-tags-dialog__notice">
          Aucun scrapper ne dispose d&apos;un module Liste de tags configure.
        </div>
      ) : null}
      {searchResult.missingCacheCount > 0 ? (
        <div className="scraper-similar-tags-dialog__notice">
          {searchResult.missingCacheCount} scrapper(s) n&apos;ont pas encore de liste de tags enregistree.
        </div>
      ) : null}
      {searchResult.failedScraperCount > 0 ? (
        <div className="scraper-similar-tags-dialog__notice is-error">
          {searchResult.failedScraperCount} liste(s) de tags n&apos;ont pas pu etre chargee(s).
        </div>
      ) : null}
      {error ? <div className="scraper-similar-tags-dialog__notice is-error">{error}</div> : null}

      {!loading && searchResult.results.length ? (
        <label className="scraper-similar-tags-dialog__filter">
          <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
          <input
            type="search"
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.currentTarget.value)}
            placeholder="Filtrer par tag ou scrapper"
            aria-label="Filtrer les tags similaires"
          />
          {filterQuery ? (
            <button
              type="button"
              onClick={() => setFilterQuery("")}
              aria-label="Effacer le filtre"
              title="Effacer le filtre"
            >
              <CloseXIcon aria-hidden="true" focusable="false" />
            </button>
          ) : null}
        </label>
      ) : null}

      {loading ? (
        <div className="scraper-similar-tags-dialog__empty">Recherche dans les caches de tags...</div>
      ) : visibleResults.length ? (
        <div className="scraper-similar-tags-dialog__list">
          {visibleResults.map((result) => {
            const favoriteSource = findFavoriteSourceForResult(favorite, result);
            const isFavorite = Boolean(favoriteSource);
            const pending = pendingResultKeys.has(result.key);
            const actionLabel = isFavorite
              ? `Retirer ${result.tagName} de ce favori`
              : `Ajouter ${result.tagName} a ce favori`;

            return (
              <div key={result.key} className="scraper-similar-tags-dialog__item">
                <div>
                  <strong>{result.tagName}</strong>
                  <span>{result.scraperName}</span>
                </div>
                <button
                  type="button"
                  className={isFavorite ? "is-favorite" : ""}
                  onClick={() => void handleToggleFavorite(result)}
                  disabled={pending || !favorite}
                  aria-label={actionLabel}
                  aria-pressed={isFavorite}
                  title={actionLabel}
                >
                  <StarIcon aria-hidden="true" focusable="false" />
                </button>
              </div>
            );
          })}
        </div>
      ) : searchResult.results.length ? (
        <div className="scraper-similar-tags-dialog__empty">
          Aucun tag ne correspond au filtre actuel.
        </div>
      ) : (
        <div className="scraper-similar-tags-dialog__empty">
          Aucun tag similaire n&apos;a ete trouve dans les listes enregistrees.
        </div>
      )}
    </div>
  );
}
