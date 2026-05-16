import React from "react";
import type {
  ScraperRecord,
  ScraperTagFavoriteRecord,
} from "@/shared/scraper";
import ScraperCard, { type ScraperCardAction } from "@/renderer/components/ScraperCard/ScraperCard";

type Props = {
  favorites: ScraperTagFavoriteRecord[];
  loading: boolean;
  error: string | null;
  scrapersById: Map<string, ScraperRecord>;
  onSelectFavorite: (favoriteId: string) => void;
  onRemoveFavorite: (favorite: ScraperTagFavoriteRecord) => void;
};

const formatSourceSummary = (
  favorite: ScraperTagFavoriteRecord,
  scrapersById: Map<string, ScraperRecord>,
) => (
  favorite.sources
    .map((source) => {
      const scraperName = scrapersById.get(source.scraperId)?.name ?? "Scrapper inconnu";
      return `${scraperName}: ${source.name}`;
    })
    .join("\n")
);

export default function ScraperTagFavoritesList({
  favorites,
  loading,
  error,
  scrapersById,
  onSelectFavorite,
  onRemoveFavorite,
}: Props) {
  return (
    <section className="scraper-author-favorites-view scraper-browser__panel">
      <div className="scraper-author-favorites-view__header">
        <div>
          <h2>Tags favoris</h2>
          <p>Cette vue regroupe les pages tag sauvegardees depuis les scrappers.</p>
        </div>
      </div>

      {error ? <div className="scraper-browser__message is-error">{error}</div> : null}

      {favorites.length ? (
        <div className="scraper-browser__results-grid">
          {favorites.map((favorite) => {
            const actions: ScraperCardAction[] = [
              {
                id: "open-tag-favorite",
                type: "primary",
                label: "Ouvrir",
                onClick: () => onSelectFavorite(favorite.id),
              },
              {
                id: "remove-tag-favorite",
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
                ariaLabel={`Ouvrir le tag favori ${favorite.name}`}
              />
            );
          })}
        </div>
      ) : loading ? (
        <div className="scraper-browser__message">Chargement des tags favoris...</div>
      ) : (
        <div className="scraper-browser__message">
          Aucun tag favori. Ouvre une page tag dans un scrapper puis utilise l'etoile.
        </div>
      )}
    </section>
  );
}
