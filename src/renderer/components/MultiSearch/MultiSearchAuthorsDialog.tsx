import React from "react";
import { BookmarkRibbonIcon } from "@/renderer/components/icons";
import {
  getScraperAuthorFavoriteSourceKey,
  useScraperAuthorFavorites,
} from "@/renderer/stores/scraperAuthorFavorites";
import type { MultiSearchAuthorResult } from "@/renderer/components/MultiSearch/multiSearchAuthors";

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

  return (
    <div className="multi-search-authors-dialog">
      <div className="multi-search-authors-dialog__toolbar">
        <span>{authors.length} auteur(s) trouve(s)</span>
        <button
          type="button"
          onClick={() => onOpenAllAuthors(authors)}
          disabled={!authors.length}
        >
          Tout ouvrir
        </button>
      </div>

      {authors.length ? (
        <div className="multi-search-authors-dialog__list">
          {authors.map((author) => {
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
                    >
                      <BookmarkRibbonIcon aria-hidden="true" focusable="false" />
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="multi-search-authors-dialog__empty">
          Aucun auteur avec URL n'a ete trouve dans les resultats charges.
        </p>
      )}
    </div>
  );
}
