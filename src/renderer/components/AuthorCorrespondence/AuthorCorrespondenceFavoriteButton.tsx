import React from "react";
import type {
  SaveScraperAuthorFavoriteRequest,
  ScraperAuthorFavoriteRecord,
} from "@/shared/scraper";
import { StarIcon } from "@/renderer/components/icons";
import { useModal } from "@/renderer/hooks/useModal";
import { getScraperAuthorFavoriteSourceKey } from "@/renderer/stores/scraperAuthorFavorites";
import AuthorCorrespondenceFavoriteDialog from "@/renderer/components/AuthorCorrespondence/AuthorCorrespondenceFavoriteDialog";
import "@/renderer/components/ScraperAuthorFavoriteButton/style.scss";
import "./favoriteButton.scss";

type Props = {
  favorite: Pick<ScraperAuthorFavoriteRecord, "name" | "cover" | "sources">;
  disabled?: boolean;
};

export default function AuthorCorrespondenceFavoriteButton({
  favorite,
  disabled = false,
}: Props) {
  const { openModal, closeModal } = useModal();
  const sources = React.useMemo<SaveScraperAuthorFavoriteRequest["source"][]>(() => {
    const sourceKeys = new Set<string>();

    return favorite.sources.reduce<SaveScraperAuthorFavoriteRequest["source"][]>((items, source) => {
      const sourceKey = getScraperAuthorFavoriteSourceKey(source.scraperId, source.authorUrl);
      if (!sourceKey || sourceKeys.has(sourceKey)) {
        return items;
      }

      sourceKeys.add(sourceKey);
      items.push({
        scraperId: source.scraperId,
        authorUrl: source.authorUrl,
        name: source.name,
        cover: source.cover,
        templateContext: source.templateContext,
      });
      return items;
    }, []);
  }, [favorite.sources]);

  const handleClick = React.useCallback(() => {
    if (disabled || !sources.length) {
      return;
    }

    openModal({
      title: "Ajouter l’auteur aux favoris",
      content: (
        <AuthorCorrespondenceFavoriteDialog
          defaultFavoriteName={favorite.name}
          cover={favorite.cover}
          sources={sources}
          onCancel={closeModal}
          onSaved={() => closeModal()}
        />
      ),
      className: "scraper-author-favorite-modal",
    });
  }, [closeModal, disabled, favorite.cover, favorite.name, openModal, sources]);

  if (!sources.length) {
    return null;
  }

  return (
    <button
      type="button"
      className="author-correspondence-favorite-button"
      onClick={handleClick}
      disabled={disabled}
      title={`Regrouper ${sources.length} page(s) auteur non invalidée(s) dans un favori`}
    >
      <StarIcon aria-hidden="true" focusable="false" />
      <span>Ajouter l’auteur aux favoris</span>
    </button>
  );
}
