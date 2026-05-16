import React from "react";
import type {
  SaveScraperAuthorFavoriteRequest,
  ScraperAuthorFavoriteRecord,
} from "@/shared/scraper";
import ScraperSourceFavoriteDialog from "@/renderer/components/ScraperSourceFavoriteDialog/ScraperSourceFavoriteDialog";
import {
  saveScraperAuthorFavorite,
  useScraperAuthorFavorites,
} from "@/renderer/stores/scraperAuthorFavorites";

type AuthorFavoriteSourceDraft = SaveScraperAuthorFavoriteRequest["source"];

type Props = {
  defaultFavoriteName: string;
  defaultSourceName: string;
  source: Omit<AuthorFavoriteSourceDraft, "name">;
  onCancel: () => void;
  onSaved: (favorite: ScraperAuthorFavoriteRecord) => void;
};

export default function ScraperAuthorFavoriteDialog({
  defaultFavoriteName,
  defaultSourceName,
  source,
  onCancel,
  onSaved,
}: Props) {
  const { favorites, loading } = useScraperAuthorFavorites();

  return (
    <ScraperSourceFavoriteDialog
      favorites={favorites}
      loading={loading}
      labels={{
        existingMode: "Auteur existant",
        newMode: "Nouvel auteur",
        favoriteField: "Auteur favori",
        sourceField: "Nom dans ce scrapper",
        commonNamePlaceholder: "Nom commun",
        sourceNamePlaceholder: "Nom source",
        saving: "Enregistrement...",
        save: "Enregistrer",
        cancel: "Annuler",
        error: "Impossible d'enregistrer ce favori auteur.",
      }}
      defaultFavoriteName={defaultFavoriteName}
      defaultSourceName={defaultSourceName}
      sourceCover={source.cover}
      onCancel={onCancel}
      onSaved={onSaved}
      onSave={(request) => saveScraperAuthorFavorite({
        favoriteId: request.favoriteId,
        name: request.name,
        cover: request.cover,
        source: {
          ...source,
          name: request.sourceName,
        },
      })}
    />
  );
}
