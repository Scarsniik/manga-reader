import React, { useCallback, useMemo, useState } from "react";
import type {
  SaveScraperTagFavoriteRequest,
  ScraperTagFavoriteRecord,
} from "@/shared/scraper";
import { OpenBookIcon, StarIcon } from "@/renderer/components/icons";
import buildConfirmActionModal from "@/renderer/components/Modal/modales/ConfirmActionModal";
import ScraperSourceFavoriteDialog from "@/renderer/components/ScraperSourceFavoriteDialog/ScraperSourceFavoriteDialog";
import { useModal } from "@/renderer/hooks/useModal";
import {
  removeScraperTagFavoriteSource,
  saveScraperTagFavorite,
  useScraperTagFavoriteSource,
  useScraperTagFavorites,
} from "@/renderer/stores/scraperTagFavorites";
import "@/renderer/components/ScraperAuthorFavoriteButton/style.scss";

type Props = {
  scraperId: string;
  scraperName: string;
  tagUrl: string;
  sourceName: string;
  cover?: string | null;
  onOpenFavorite?: (favorite: ScraperTagFavoriteRecord) => void;
  className?: string;
  disabled?: boolean;
};

const normalizeText = (value: string | null | undefined): string => (
  String(value ?? "").trim()
);

export default function ScraperTagFavoriteButton({
  scraperId,
  scraperName,
  tagUrl,
  sourceName,
  cover,
  onOpenFavorite,
  className = "",
  disabled = false,
}: Props) {
  const { openModal, closeModal } = useModal();
  const { favorites, loading } = useScraperTagFavorites();
  const normalizedScraperId = normalizeText(scraperId);
  const normalizedTagUrl = normalizeText(tagUrl);
  const normalizedSourceName = normalizeText(sourceName) || normalizedTagUrl || "Tag";
  const normalizedCover = normalizeText(cover) || undefined;
  const { favorite, isFavorite } = useScraperTagFavoriteSource(normalizedScraperId, normalizedTagUrl);
  const [pending, setPending] = useState(false);
  const source = useMemo<Omit<SaveScraperTagFavoriteRequest["source"], "name">>(() => ({
    scraperId: normalizedScraperId,
    tagUrl: normalizedTagUrl,
    cover: normalizedCover,
  }), [normalizedCover, normalizedScraperId, normalizedTagUrl]);
  const label = isFavorite
    ? `Retirer ${normalizedSourceName} des tags favoris`
    : `Ajouter ${normalizedSourceName} aux tags favoris`;

  const handleRemove = useCallback(() => {
    if (!favorite || pending) {
      return;
    }

    openModal(buildConfirmActionModal({
      title: "Retirer le tag favori",
      message: (
        <>
          Retirer <strong>{normalizedSourceName}</strong> des tags favoris ?
        </>
      ),
      confirmLabel: "Retirer",
      confirmVariant: "danger",
      onConfirm: async () => {
        setPending(true);
        try {
          await removeScraperTagFavoriteSource({
            favoriteId: favorite.id,
            scraperId: normalizedScraperId,
            tagUrl: normalizedTagUrl,
          });
        } finally {
          setPending(false);
        }
      },
    }));
  }, [favorite, normalizedScraperId, normalizedSourceName, normalizedTagUrl, openModal, pending]);

  const handleAdd = useCallback(() => {
    openModal({
      title: "Ajouter un tag favori",
      content: (
        <ScraperSourceFavoriteDialog
          favorites={favorites}
          loading={loading}
          labels={{
            existingMode: "Tag existant",
            newMode: "Nouveau tag",
            favoriteField: "Tag favori",
            sourceField: "Nom dans ce scrapper",
            commonNamePlaceholder: "Nom commun",
            sourceNamePlaceholder: "Nom source",
            saving: "Enregistrement...",
            save: "Enregistrer",
            cancel: "Annuler",
            error: "Impossible d'enregistrer ce favori tag.",
          }}
          defaultFavoriteName={normalizedSourceName}
          defaultSourceName={normalizedSourceName}
          sourceCover={source.cover}
          onCancel={closeModal}
          onSaved={() => closeModal()}
          onSave={(request) => saveScraperTagFavorite({
            favoriteId: request.favoriteId,
            name: request.name,
            cover: request.cover,
            source: {
              ...source,
              name: request.sourceName,
            },
          })}
        />
      ),
      className: "scraper-author-favorite-modal",
    });
  }, [closeModal, favorites, loading, normalizedSourceName, openModal, source]);

  const handleClick = useCallback(() => {
    if (disabled || !normalizedScraperId || !normalizedTagUrl || pending) {
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
    normalizedScraperId,
    normalizedTagUrl,
    pending,
  ]);
  const handleOpenFavorite = useCallback(() => {
    if (disabled || pending || !favorite || !onOpenFavorite) {
      return;
    }

    onOpenFavorite(favorite);
  }, [disabled, favorite, onOpenFavorite, pending]);

  if (!normalizedScraperId || !normalizedTagUrl) {
    return null;
  }

  return (
    <div className={["scraper-author-favorite-actions", "scraper-tag-favorite-actions", className].join(" ").trim()}>
      <button
        type="button"
        className={[
          "scraper-author-favorite-button",
          "scraper-tag-favorite-button",
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
