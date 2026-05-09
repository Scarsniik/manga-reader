import React, { useCallback, useMemo, useState } from "react";
import type {
  SaveScraperAuthorFavoriteRequest,
  ScraperAuthorFavoriteRecord,
} from "@/shared/scraper";
import { OpenBookIcon, StarIcon } from "@/renderer/components/icons";
import buildConfirmActionModal from "@/renderer/components/Modal/modales/ConfirmActionModal";
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
  onOpenFavorite?: (favorite: ScraperAuthorFavoriteRecord) => void;
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
  onOpenFavorite,
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

  const handleRemove = useCallback(() => {
    if (!favorite || pending) {
      return;
    }

    openModal(buildConfirmActionModal({
      title: "Retirer l'auteur favori",
      message: (
        <>
          Retirer <strong>{normalizedSourceName}</strong> des auteurs favoris ?
        </>
      ),
      confirmLabel: "Retirer",
      confirmVariant: "danger",
      onConfirm: async () => {
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
      },
    }));
  }, [favorite, normalizedAuthorUrl, normalizedScraperId, normalizedSourceName, openModal, pending]);

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
  const handleOpenFavorite = useCallback(() => {
    if (disabled || pending || !favorite || !onOpenFavorite) {
      return;
    }

    onOpenFavorite(favorite);
  }, [disabled, favorite, onOpenFavorite, pending]);

  if (!normalizedScraperId || !normalizedAuthorUrl) {
    return null;
  }

  return (
    <div className={["scraper-author-favorite-actions", className].join(" ").trim()}>
      <button
        type="button"
        className={[
          "scraper-author-favorite-button",
          isFavorite ? "is-favorite" : "",
          pending ? "is-pending" : "",
        ].join(" ").trim()}
        onClick={handleClick}
        disabled={disabled || pending}
        aria-pressed={isFavorite}
        aria-label={label}
        title={`${label} (${scraperName})`}
      >
        <StarIcon aria-hidden="true" focusable="false" />
      </button>
      {isFavorite && favorite && onOpenFavorite ? (
        <button
          type="button"
          className="scraper-author-favorite-open-button"
          onClick={handleOpenFavorite}
          disabled={disabled || pending}
          aria-label={`Ouvrir la page favori ${favorite.name}`}
          title={`Ouvrir la page favori ${favorite.name}`}
        >
          <OpenBookIcon aria-hidden="true" focusable="false" />
          <span>Voir favori</span>
        </button>
      ) : null}
    </div>
  );
}
