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
  cover?: string;
  sources: AuthorFavoriteSourceDraft[];
  onCancel: () => void;
  onSaved: (favorite: ScraperAuthorFavoriteRecord) => void;
};

export default function AuthorCorrespondenceFavoriteDialog({
  defaultFavoriteName,
  cover,
  sources,
  onCancel,
  onSaved,
}: Props) {
  const { favorites, loading } = useScraperAuthorFavorites();
  const sourceNames = React.useMemo(() => sources.map((source) => source.name), [sources]);

  const saveSources = async (request: {
    favoriteId?: string;
    name: string;
    cover?: string;
  }): Promise<ScraperAuthorFavoriteRecord> => {
    let savedFavorite: ScraperAuthorFavoriteRecord | null = null;

    for (const source of sources) {
      savedFavorite = await saveScraperAuthorFavorite({
        favoriteId: savedFavorite?.id ?? request.favoriteId,
        name: savedFavorite?.name ?? request.name,
        cover: savedFavorite ? undefined : request.cover,
        source,
      });
    }

    if (!savedFavorite) {
      throw new Error("Aucune page auteur ne peut être ajoutée.");
    }

    return savedFavorite;
  };

  return (
    <ScraperSourceFavoriteDialog
      favorites={favorites}
      loading={loading}
      description={(
        <p>
          Les {sources.length} page(s) auteur non invalidée(s) seront regroupée(s) dans un seul favori.
        </p>
      )}
      labels={{
        existingMode: "Auteur existant",
        newMode: "Nouvel auteur",
        favoriteField: "Auteur favori",
        sourceField: "Nom dans ce scrapper",
        commonNamePlaceholder: "Nom commun",
        sourceNamePlaceholder: "Nom source",
        saving: "Enregistrement...",
        save: "Tout ajouter",
        cancel: "Annuler",
        error: "Impossible d'enregistrer toutes les pages de cet auteur.",
      }}
      defaultFavoriteName={defaultFavoriteName}
      defaultSourceName={defaultFavoriteName}
      sourceNamesForMatching={sourceNames}
      sourceCover={cover}
      showSourceField={false}
      onCancel={onCancel}
      onSaved={onSaved}
      onSave={saveSources}
    />
  );
}
