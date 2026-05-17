import React from "react";
import type { ScraperRecord } from "@/shared/scraper";
import ScraperCard, { type ScraperCardAction } from "@/renderer/components/ScraperCard/ScraperCard";

type ScraperSourceFavoriteSource = {
  scraperId: string;
  name: string;
};

type ScraperSourceFavoriteRecord<TSource extends ScraperSourceFavoriteSource> = {
  id: string;
  name: string;
  cover?: string;
  sources: TSource[];
};

type Props<
  TRecord extends ScraperSourceFavoriteRecord<TSource>,
  TSource extends ScraperSourceFavoriteSource,
> = {
  favorites: TRecord[];
  loading: boolean;
  error: string | null;
  scrapersById: Map<string, ScraperRecord>;
  title: string;
  description: string;
  loadingMessage: string;
  emptyMessage: string;
  actionPrefix: string;
  favoriteKindLabel: string;
  onSelectFavorite: (favoriteId: string) => void;
  onRemoveFavorite: (favorite: TRecord) => void;
};

const formatSourceSummary = <
  TRecord extends ScraperSourceFavoriteRecord<TSource>,
  TSource extends ScraperSourceFavoriteSource,
>(
  favorite: TRecord,
  scrapersById: Map<string, ScraperRecord>,
) => (
  favorite.sources
    .map((source) => {
      const scraperName = scrapersById.get(source.scraperId)?.name ?? "Scrapper inconnu";
      return `${scraperName}: ${source.name}`;
    })
    .join("\n")
);

export default function ScraperSourceFavoritesList<
  TRecord extends ScraperSourceFavoriteRecord<TSource>,
  TSource extends ScraperSourceFavoriteSource,
>({
  favorites,
  loading,
  error,
  scrapersById,
  title,
  description,
  loadingMessage,
  emptyMessage,
  actionPrefix,
  favoriteKindLabel,
  onSelectFavorite,
  onRemoveFavorite,
}: Props<TRecord, TSource>) {
  return (
    <section className="scraper-author-favorites-view scraper-browser__panel">
      <div className="scraper-author-favorites-view__header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      {error ? <div className="scraper-browser__message is-error">{error}</div> : null}

      {favorites.length ? (
        <div className="scraper-browser__results-grid">
          {favorites.map((favorite) => {
            const actions: ScraperCardAction[] = [
              {
                id: `open-${actionPrefix}-favorite`,
                type: "primary",
                label: "Ouvrir",
                onClick: () => onSelectFavorite(favorite.id),
              },
              {
                id: `remove-${actionPrefix}-favorite`,
                type: "secondary",
                label: "Supprimer",
                onClick: () => onRemoveFavorite(favorite),
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
                onClick={() => onSelectFavorite(favorite.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectFavorite(favorite.id);
                  }
                }}
                ariaLabel={`Ouvrir ${favoriteKindLabel} ${favorite.name}`}
              />
            );
          })}
        </div>
      ) : loading ? (
        <div className="scraper-browser__message">{loadingMessage}</div>
      ) : (
        <div className="scraper-browser__message">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}
