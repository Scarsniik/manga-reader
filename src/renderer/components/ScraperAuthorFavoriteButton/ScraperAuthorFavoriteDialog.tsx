import React, { useMemo, useState } from "react";
import type {
  SaveScraperAuthorFavoriteRequest,
  ScraperAuthorFavoriteRecord,
} from "@/shared/scraper";
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

const getInitialMode = (favorites: ScraperAuthorFavoriteRecord[]): "existing" | "new" => (
  favorites.length ? "existing" : "new"
);

export default function ScraperAuthorFavoriteDialog({
  defaultFavoriteName,
  defaultSourceName,
  source,
  onCancel,
  onSaved,
}: Props) {
  const { favorites, loading } = useScraperAuthorFavorites();
  const [mode, setMode] = useState<"existing" | "new">(() => getInitialMode(favorites));
  const [favoriteId, setFavoriteId] = useState(() => favorites[0]?.id ?? "");
  const [favoriteName, setFavoriteName] = useState(defaultFavoriteName);
  const [sourceName, setSourceName] = useState(defaultSourceName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedFavorite = useMemo(
    () => favorites.find((favorite) => favorite.id === favoriteId) ?? favorites[0] ?? null,
    [favoriteId, favorites],
  );
  const effectiveMode = favorites.length ? mode : "new";
  const trimmedFavoriteName = favoriteName.trim();
  const trimmedSourceName = sourceName.trim();
  const canSubmit = Boolean(
    trimmedSourceName
    && (effectiveMode === "new" ? trimmedFavoriteName : selectedFavorite),
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const saved = await saveScraperAuthorFavorite({
        favoriteId: effectiveMode === "existing" ? selectedFavorite?.id : undefined,
        name: effectiveMode === "existing"
          ? selectedFavorite?.name ?? trimmedFavoriteName
          : trimmedFavoriteName,
        cover: effectiveMode === "new" || !selectedFavorite?.cover ? source.cover : undefined,
        source: {
          ...source,
          name: trimmedSourceName,
        },
      });

      onSaved(saved);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer ce favori auteur.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="scraper-author-favorite-dialog" onSubmit={handleSubmit}>
      <div className="scraper-author-favorite-dialog__modes">
        <button
          type="button"
          className={effectiveMode === "existing" ? "is-active" : ""}
          onClick={() => setMode("existing")}
          disabled={!favorites.length}
        >
          Auteur existant
        </button>
        <button
          type="button"
          className={effectiveMode === "new" ? "is-active" : ""}
          onClick={() => setMode("new")}
        >
          Nouvel auteur
        </button>
      </div>

      {effectiveMode === "existing" ? (
        <label className="scraper-author-favorite-dialog__field">
          <span>Auteur favori</span>
          <select
            value={selectedFavorite?.id ?? ""}
            onChange={(event) => setFavoriteId(event.target.value)}
            disabled={loading || saving}
          >
            {favorites.map((favorite) => (
              <option key={favorite.id} value={favorite.id}>
                {favorite.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="scraper-author-favorite-dialog__field">
          <span>Nom de l'auteur favori</span>
          <input
            type="text"
            value={favoriteName}
            onChange={(event) => setFavoriteName(event.target.value)}
            placeholder="Nom commun"
            autoFocus
          />
        </label>
      )}

      <label className="scraper-author-favorite-dialog__field">
        <span>Nom dans ce scrapper</span>
        <input
          type="text"
          value={sourceName}
          onChange={(event) => setSourceName(event.target.value)}
          placeholder="Nom source"
        />
      </label>

      {error ? <div className="scraper-author-favorite-dialog__error">{error}</div> : null}

      <div className="scraper-author-favorite-dialog__actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          Annuler
        </button>
        <button type="submit" disabled={!canSubmit || saving}>
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
