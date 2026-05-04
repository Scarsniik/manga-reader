import React, { useCallback, useMemo, useState } from "react";
import type { SaveScraperAuthorFavoriteRequest } from "@/shared/scraper";
import { StarIcon } from "@/renderer/components/icons";
import { useModal } from "@/renderer/hooks/useModal";
import {
  removeScraperAuthorFavoriteSource,
  useScraperAuthorFavoriteSource,
} from "@/renderer/stores/scraperAuthorFavorites";
import ScraperAuthorFavoriteDialog from "@/renderer/components/ScraperAuthorFavoriteButton/ScraperAuthorFavoriteDialog";
import "./style.scss";

type Props = {
  scraperId: string;
  scraperName: string;
  authorUrl: string;
  sourceName: string;
  cover?: string | null;
  templateContext?: Record<string, string | undefined> | null;
  className?: string;
  disabled?: boolean;
};

const normalizeText = (value: string | null | undefined): string => (
  String(value ?? "").trim()
);

export default function ScraperAuthorFavoriteButton({
  scraperId,
  scraperName,
  authorUrl,
  sourceName,
  cover,
  templateContext,
  className = "",
  disabled = false,
}: Props) {
  const { openModal, closeModal } = useModal();
  const normalizedScraperId = normalizeText(scraperId);
  const normalizedAuthorUrl = normalizeText(authorUrl);
  const normalizedSourceName = normalizeText(sourceName) || normalizedAuthorUrl || "Auteur";
  const normalizedCover = normalizeText(cover) || undefined;
  const { favorite, isFavorite } = useScraperAuthorFavoriteSource(normalizedScraperId, normalizedAuthorUrl);
  const [pending, setPending] = useState(false);
  const source = useMemo<Omit<SaveScraperAuthorFavoriteRequest["source"], "name">>(() => ({
    scraperId: normalizedScraperId,
    authorUrl: normalizedAuthorUrl,
    cover: normalizedCover,
    templateContext: templateContext ?? undefined,
  }), [normalizedAuthorUrl, normalizedCover, normalizedScraperId, templateContext]);
  const label = isFavorite
    ? `Retirer ${normalizedSourceName} des auteurs favoris`
    : `Ajouter ${normalizedSourceName} aux auteurs favoris`;

  const handleRemove = useCallback(async () => {
    if (!favorite || pending) {
      return;
    }

    const confirmed = window.confirm(`Retirer ${normalizedSourceName} des auteurs favoris ?`);
    if (!confirmed) {
      return;
    }

    setPending(true);
    try {
      await removeScraperAuthorFavoriteSource({
        favoriteId: favorite.id,
        scraperId: normalizedScraperId,
        authorUrl: normalizedAuthorUrl,
      });
    } finally {
      setPending(false);
    }
  }, [favorite, normalizedAuthorUrl, normalizedScraperId, normalizedSourceName, pending]);

  const handleAdd = useCallback(() => {
    openModal({
      title: "Ajouter un auteur favori",
      content: (
        <ScraperAuthorFavoriteDialog
          defaultFavoriteName={normalizedSourceName}
          defaultSourceName={normalizedSourceName}
          source={source}
          onCancel={closeModal}
          onSaved={() => closeModal()}
        />
      ),
      className: "scraper-author-favorite-modal",
    });
  }, [closeModal, normalizedSourceName, openModal, source]);

  const handleClick = useCallback(() => {
    if (disabled || !normalizedScraperId || !normalizedAuthorUrl || pending) {
      return;
    }

    if (isFavorite) {
      void handleRemove();
      return;
    }

    handleAdd();
  }, [
    disabled,
    handleAdd,
    handleRemove,
    isFavorite,
    normalizedAuthorUrl,
    normalizedScraperId,
    pending,
  ]);

  if (!normalizedScraperId || !normalizedAuthorUrl) {
    return null;
  }

  return (
    <button
      type="button"
      className={[
        "scraper-author-favorite-button",
        isFavorite ? "is-favorite" : "",
        pending ? "is-pending" : "",
        className,
      ].join(" ").trim()}
      onClick={handleClick}
      disabled={disabled || pending}
      aria-pressed={isFavorite}
      aria-label={label}
      title={`${label} (${scraperName})`}
    >
      <StarIcon aria-hidden="true" focusable="false" />
    </button>
  );
}
