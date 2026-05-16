import React, { useMemo, useState } from "react";

export type ScraperSourceFavoriteDialogRecord = {
  id: string;
  name: string;
  cover?: string;
  sources?: Array<{
    name?: string;
  }>;
};

type SaveFavoriteRequest<TFavorite extends ScraperSourceFavoriteDialogRecord> = {
  favoriteId?: string;
  name: string;
  cover?: string;
  sourceName: string;
  selectedFavorite?: TFavorite | null;
};

type Props<TFavorite extends ScraperSourceFavoriteDialogRecord> = {
  favorites: TFavorite[];
  loading: boolean;
  labels: {
    existingMode: string;
    newMode: string;
    favoriteField: string;
    sourceField: string;
    commonNamePlaceholder: string;
    sourceNamePlaceholder: string;
    saving: string;
    save: string;
    cancel: string;
    error: string;
  };
  defaultFavoriteName: string;
  defaultSourceName: string;
  sourceCover?: string;
  onCancel: () => void;
  onSaved: (favorite: TFavorite) => void;
  onSave: (request: SaveFavoriteRequest<TFavorite>) => Promise<TFavorite>;
};

const getInitialMode = <TFavorite extends ScraperSourceFavoriteDialogRecord>(
  favorites: TFavorite[],
): "existing" | "new" => (
  favorites.length ? "existing" : "new"
);

const normalizeMatchText = (value: string): string => (
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
);

const getMatchTokens = (value: string): string[] => (
  normalizeMatchText(value)
    .split(" ")
    .filter(Boolean)
);

const getLevenshteinDistance = (leftValue: string, rightValue: string): number => {
  const left = Array.from(leftValue);
  const right = Array.from(rightValue);

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  left.forEach((leftChar, leftIndex) => {
    const currentRow = [leftIndex + 1];

    right.forEach((rightChar, rightIndex) => {
      const insertion = currentRow[rightIndex] + 1;
      const deletion = previousRow[rightIndex + 1] + 1;
      const substitution = previousRow[rightIndex] + (leftChar === rightChar ? 0 : 1);
      currentRow.push(Math.min(insertion, deletion, substitution));
    });

    previousRow = currentRow;
  });

  return previousRow[right.length];
};

const getTextMatchScore = (sourceValue: string, candidateValue: string): number => {
  const source = normalizeMatchText(sourceValue);
  const candidate = normalizeMatchText(candidateValue);

  if (!source || !candidate) {
    return 0;
  }

  if (source === candidate) {
    return 1000;
  }

  const sourceTokens = new Set(getMatchTokens(source));
  const candidateTokens = new Set(getMatchTokens(candidate));
  const sharedTokenCount = Array.from(sourceTokens).filter((token) => candidateTokens.has(token)).length;
  const tokenScore = sharedTokenCount
    ? (sharedTokenCount / Math.max(sourceTokens.size, candidateTokens.size)) * 600
    : 0;
  const containsScore = source.includes(candidate) || candidate.includes(source)
    ? (Math.min(source.length, candidate.length) / Math.max(source.length, candidate.length)) * 800
    : 0;
  const distance = getLevenshteinDistance(source, candidate);
  const distanceScore = (1 - (distance / Math.max(source.length, candidate.length))) * 500;

  return Math.max(tokenScore, containsScore, distanceScore);
};

const getFavoriteMatchValues = <TFavorite extends ScraperSourceFavoriteDialogRecord>(
  favorite: TFavorite,
): string[] => {
  const values = [
    favorite.name,
    ...(favorite.sources ?? []).map((source) => source.name ?? ""),
  ];
  const seenValues = new Set<string>();

  return values.filter((value) => {
    const normalizedValue = normalizeMatchText(value);
    if (!normalizedValue || seenValues.has(normalizedValue)) {
      return false;
    }

    seenValues.add(normalizedValue);
    return true;
  });
};

const findClosestFavorite = <TFavorite extends ScraperSourceFavoriteDialogRecord>(
  favorites: TFavorite[],
  sourceNames: string[],
): TFavorite | null => {
  const normalizedSourceNames = sourceNames
    .map((name) => normalizeMatchText(name))
    .filter(Boolean);

  if (!favorites.length || !normalizedSourceNames.length) {
    return favorites[0] ?? null;
  }

  return favorites.reduce<{ favorite: TFavorite; score: number } | null>((bestMatch, favorite) => {
    const favoriteScore = getFavoriteMatchValues(favorite).reduce((bestScore, favoriteName) => (
      Math.max(
        bestScore,
        ...normalizedSourceNames.map((sourceName) => getTextMatchScore(sourceName, favoriteName)),
      )
    ), 0);

    if (!bestMatch || favoriteScore > bestMatch.score) {
      return {
        favorite,
        score: favoriteScore,
      };
    }

    return bestMatch;
  }, null)?.favorite ?? favorites[0] ?? null;
};

export default function ScraperSourceFavoriteDialog<TFavorite extends ScraperSourceFavoriteDialogRecord>({
  favorites,
  loading,
  labels,
  defaultFavoriteName,
  defaultSourceName,
  sourceCover,
  onCancel,
  onSaved,
  onSave,
}: Props<TFavorite>) {
  const closestFavorite = useMemo(
    () => findClosestFavorite(favorites, [defaultFavoriteName, defaultSourceName]),
    [defaultFavoriteName, defaultSourceName, favorites],
  );
  const [mode, setMode] = useState<"existing" | "new">(() => getInitialMode(favorites));
  const [favoriteId, setFavoriteId] = useState(() => closestFavorite?.id ?? "");
  const [favoriteName, setFavoriteName] = useState(defaultFavoriteName);
  const [sourceName, setSourceName] = useState(defaultSourceName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedFavorite = useMemo(
    () => favorites.find((favorite) => favorite.id === favoriteId) ?? closestFavorite ?? null,
    [closestFavorite, favoriteId, favorites],
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
      const saved = await onSave({
        favoriteId: effectiveMode === "existing" ? selectedFavorite?.id : undefined,
        name: effectiveMode === "existing"
          ? selectedFavorite?.name ?? trimmedFavoriteName
          : trimmedFavoriteName,
        cover: effectiveMode === "new" || !selectedFavorite?.cover ? sourceCover : undefined,
        sourceName: trimmedSourceName,
        selectedFavorite,
      });

      onSaved(saved);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : labels.error);
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
          {labels.existingMode}
        </button>
        <button
          type="button"
          className={effectiveMode === "new" ? "is-active" : ""}
          onClick={() => setMode("new")}
        >
          {labels.newMode}
        </button>
      </div>

      {effectiveMode === "existing" ? (
        <label className="scraper-author-favorite-dialog__field">
          <span>{labels.favoriteField}</span>
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
          <span>{labels.favoriteField}</span>
          <input
            type="text"
            value={favoriteName}
            onChange={(event) => setFavoriteName(event.target.value)}
            placeholder={labels.commonNamePlaceholder}
            autoFocus
          />
        </label>
      )}

      <label className="scraper-author-favorite-dialog__field">
        <span>{labels.sourceField}</span>
        <input
          type="text"
          value={sourceName}
          onChange={(event) => setSourceName(event.target.value)}
          placeholder={labels.sourceNamePlaceholder}
        />
      </label>

      {error ? <div className="scraper-author-favorite-dialog__error">{error}</div> : null}

      <div className="scraper-author-favorite-dialog__actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          {labels.cancel}
        </button>
        <button type="submit" disabled={!canSubmit || saving}>
          {saving ? labels.saving : labels.save}
        </button>
      </div>
    </form>
  );
}
