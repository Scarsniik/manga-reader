import React, { useMemo, useState } from "react";
import { CloseXIcon, MagnifyingGlassIcon, StarIcon } from "@/renderer/components/icons";
import {
  getScraperAuthorFavoriteSourceKey,
  useScraperAuthorFavorites,
} from "@/renderer/stores/scraperAuthorFavorites";
import type { MultiSearchAuthorResult } from "@/renderer/components/MultiSearch/multiSearchAuthors";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";
import "@/renderer/components/MultiSearch/MultiSearchAuthorsDialog.scss";

type Props = {
  authors: MultiSearchAuthorResult[];
  onOpenAuthor: (author: MultiSearchAuthorResult) => void;
  onOpenAllAuthors: (authors: MultiSearchAuthorResult[]) => void;
};

export default function MultiSearchAuthorsDialog({
  authors,
  onOpenAuthor,
  onOpenAllAuthors,
}: Props) {
  const { sourceMap: authorFavoriteSourceMap } = useScraperAuthorFavorites();
  const [filterQuery, setFilterQuery] = useState("");
  const normalizedFilterQuery = useMemo(
    () => normalizeFuzzyText(filterQuery),
    [filterQuery],
  );
  const visibleAuthors = useMemo(() => {
    if (!normalizedFilterQuery) {
      return authors;
    }

    return authors.filter((author) => normalizeFuzzyText([
      author.name,
      author.scraperName,
      author.sourceTitle,
    ].join(" ")).includes(normalizedFilterQuery));
  }, [authors, normalizedFilterQuery]);
  const authorCountLabel = normalizedFilterQuery
    ? `${visibleAuthors.length}/${authors.length} auteur(s) visible(s)`
    : `${authors.length} auteur(s) trouve(s)`;

  return (
    <div className="multi-search-authors-dialog">
      <div className="multi-search-authors-dialog__toolbar">
        <span>{authorCountLabel}</span>
        <button
          type="button"
          onClick={() => onOpenAllAuthors(visibleAuthors)}
          disabled={!visibleAuthors.length}
        >
          Tout ouvrir
        </button>
      </div>

      {authors.length ? (
        <div className="multi-search-authors-dialog__filter">
          <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
          <input
            type="search"
            autoFocus
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.currentTarget.value)}
            placeholder="Filtrer par auteur, source ou scrapper"
            aria-label="Filtrer les auteurs"
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
        </div>
      ) : null}

      {visibleAuthors.length ? (
        <div className="multi-search-authors-dialog__list">
          {visibleAuthors.map((author) => {
            const favoriteSourceKey = getScraperAuthorFavoriteSourceKey(author.scraperId, author.url);
            const isAuthorFavorite = favoriteSourceKey
              ? authorFavoriteSourceMap.has(favoriteSourceKey)
              : false;

            return (
              <button
                key={author.key}
                type="button"
                className="multi-search-authors-dialog__item"
                onClick={() => onOpenAuthor(author)}
                title={author.url}
              >
                <strong>{author.name}</strong>
                <span className="multi-search-authors-dialog__item-meta">
                  <span>{author.scraperName}</span>
                  {isAuthorFavorite ? (
                    <span
                      className="multi-search-authors-dialog__favorite"
                      title="Auteur deja dans un favori auteur"
                      role="img"
                      aria-label="Auteur deja dans un favori auteur"
                    >
                      <StarIcon aria-hidden="true" focusable="false" />
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : authors.length ? (
        <p className="multi-search-authors-dialog__empty">
          Aucun auteur ne correspond au filtre actuel.
        </p>
      ) : (
        <p className="multi-search-authors-dialog__empty">
          Aucun auteur avec URL n'a ete trouve dans les resultats charges.
        </p>
      )}
    </div>
  );
}
