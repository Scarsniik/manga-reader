import React from "react";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import { languages } from "@/renderer/consts/languages";
import { UNKNOWN_MULTI_SEARCH_VALUE } from "@/renderer/components/MultiSearch/multiSearchConstants";
import type {
  ScraperAuthorFavoriteRecord,
  ScraperRecord,
  ScraperTagFavoriteRecord,
} from "@/shared/scraper";

type IncludeOption = {
  id: string;
  label: string;
};

export const LATEST_ALL_TAG_FAVORITES_VALUE = "__all_tag_favorites__";
export const LATEST_NO_SCRAPERS_VALUE = "__no_scrapers__";
export const LATEST_NO_AUTHOR_FAVORITES_VALUE = "__no_author_favorites__";

type ScraperLatestIncludePanelProps = {
  title: string;
  allLabel: string;
  allButtonLabel: string;
  noneLabel?: string;
  noneButtonLabel?: string;
  emptySelectionLabel: string;
  emptyOptionsLabel?: string;
  ariaLabel: string;
  value: string[];
  options: IncludeOption[];
  onChange: (value: string[]) => void;
  allValue?: string;
  noneValue?: string;
  renderOptionContent?: (option: IncludeOption) => React.ReactNode;
};

const LATEST_LANGUAGE_OPTIONS = [
  ...languages.map((language) => ({
    id: language.code,
    label: language.frenchName,
  })),
  {
    id: UNKNOWN_MULTI_SEARCH_VALUE,
    label: "Inconnue",
  },
];

const formatSelectedLabels = (labels: string[]): string => {
  if (labels.length <= 4) {
    return labels.join(", ");
  }

  return `${labels.slice(0, 4).join(", ")} et ${labels.length - 4} autre(s)`;
};

const normalizeStringList = (
  value: unknown,
  options?: {
    lowercase?: boolean;
    allowedValues?: readonly string[];
  },
): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowedValues = options?.allowedValues
    ? new Set(options.allowedValues)
    : null;
  const seen = new Set<string>();

  return value.reduce<string[]>((result, entry) => {
    const normalizedEntry = String(entry ?? "").trim();
    const normalized = options?.lowercase
      ? normalizedEntry.toLowerCase()
      : normalizedEntry;

    if (!normalized || seen.has(normalized) || (allowedValues && !allowedValues.has(normalized))) {
      return result;
    }

    seen.add(normalized);
    result.push(normalized);
    return result;
  }, []);
};

export const normalizeLatestIncludedLanguageCodes = (value: unknown): string[] => (
  normalizeStringList(value, { lowercase: true })
);

export const normalizeLatestIncludedScraperIds = (
  value: unknown,
  allowedScraperIds?: readonly string[],
): string[] => {
  const normalizedValues = normalizeStringList(value);
  if (normalizedValues.includes(LATEST_NO_SCRAPERS_VALUE)) {
    return [LATEST_NO_SCRAPERS_VALUE];
  }

  return normalizeStringList(value, { allowedValues: allowedScraperIds });
};

export const normalizeLatestIncludedAuthorFavoriteIds = (
  value: unknown,
  allowedFavoriteIds?: readonly string[],
): string[] => {
  const normalizedValues = normalizeStringList(value);
  if (normalizedValues.includes(LATEST_NO_AUTHOR_FAVORITES_VALUE)) {
    return [LATEST_NO_AUTHOR_FAVORITES_VALUE];
  }

  return normalizeStringList(value, { allowedValues: allowedFavoriteIds });
};

export const normalizeLatestIncludedTagFavoriteIds = (
  value: unknown,
  allowedFavoriteIds?: readonly string[],
): string[] => {
  const normalizedValues = normalizeStringList(value);
  if (normalizedValues.includes(LATEST_ALL_TAG_FAVORITES_VALUE)) {
    return [LATEST_ALL_TAG_FAVORITES_VALUE];
  }

  return normalizeStringList(value, { allowedValues: allowedFavoriteIds });
};

export const getEnabledLatestScrapers = (scrapers: readonly ScraperRecord[]): ScraperRecord[] => (
  scrapers.filter((scraper) => scraper.globalConfig.latest?.enabled)
);

export const getLatestLanguageLabel = (languageCode: string): string => (
  LATEST_LANGUAGE_OPTIONS.find((language) => language.id === languageCode)?.label ?? languageCode
);

export const getLatestScraperLabels = (
  scraperIds: readonly string[],
  scrapers: readonly ScraperRecord[],
): string[] => {
  const scrapersById = new Map(scrapers.map((scraper) => [scraper.id, scraper.name]));

  return scraperIds
    .map((scraperId) => scrapersById.get(scraperId))
    .filter((label): label is string => Boolean(label));
};

export const getLatestAuthorFavoriteLabels = (
  favoriteIds: readonly string[],
  favorites: readonly ScraperAuthorFavoriteRecord[],
): string[] => {
  const favoritesById = new Map(favorites.map((favorite) => [favorite.id, favorite.name]));

  return favoriteIds
    .map((favoriteId) => favoritesById.get(favoriteId))
    .filter((label): label is string => Boolean(label));
};

export const getLatestTagFavoriteLabels = (
  favoriteIds: readonly string[],
  favorites: readonly ScraperTagFavoriteRecord[],
): string[] => {
  const favoritesById = new Map(favorites.map((favorite) => [favorite.id, favorite.name]));

  return favoriteIds
    .map((favoriteId) => favoritesById.get(favoriteId))
    .filter((label): label is string => Boolean(label));
};

export const getIncludedLatestAuthorFavorites = (
  favorites: readonly ScraperAuthorFavoriteRecord[],
  includedFavoriteIds: readonly string[],
): ScraperAuthorFavoriteRecord[] => {
  if (includedFavoriteIds.includes(LATEST_NO_AUTHOR_FAVORITES_VALUE)) {
    return [];
  }

  if (!includedFavoriteIds.length) {
    return [...favorites];
  }

  const includedFavoriteIdSet = new Set(includedFavoriteIds);
  return favorites.filter((favorite) => includedFavoriteIdSet.has(favorite.id));
};

export const getIncludedLatestTagFavorites = (
  favorites: readonly ScraperTagFavoriteRecord[],
  includedFavoriteIds: readonly string[],
): ScraperTagFavoriteRecord[] => {
  if (includedFavoriteIds.includes(LATEST_ALL_TAG_FAVORITES_VALUE)) {
    return [...favorites];
  }

  if (!includedFavoriteIds.length) {
    return [];
  }

  const includedFavoriteIdSet = new Set(includedFavoriteIds);
  return favorites.filter((favorite) => includedFavoriteIdSet.has(favorite.id));
};

function ScraperLatestIncludePanel({
  title,
  allLabel,
  allButtonLabel,
  noneLabel,
  noneButtonLabel,
  emptySelectionLabel,
  emptyOptionsLabel,
  ariaLabel,
  value,
  options,
  onChange,
  allValue,
  noneValue,
  renderOptionContent,
}: ScraperLatestIncludePanelProps) {
  const isAllSelected = allValue ? value.includes(allValue) : !value.length;
  const isNoneSelected = noneValue
    ? value.includes(noneValue)
    : Boolean(noneButtonLabel) && !value.length;
  const selectedValue = React.useMemo(
    () => value.filter((entry) => entry !== allValue && entry !== noneValue),
    [allValue, noneValue, value],
  );
  const selectedIds = React.useMemo(() => new Set(selectedValue), [selectedValue]);
  const selectedOptions = React.useMemo(
    () => options.filter((option) => selectedIds.has(option.id)),
    [options, selectedIds],
  );
  const selectedLabel = React.useMemo(() => {
    if (isAllSelected) {
      return allLabel;
    }

    if (isNoneSelected) {
      return noneLabel ?? emptySelectionLabel;
    }

    if (!selectedValue.length) {
      return noneLabel ?? emptySelectionLabel;
    }

    if (!selectedOptions.length) {
      return emptySelectionLabel;
    }

    return formatSelectedLabels(selectedOptions.map((option) => option.label));
  }, [allLabel, emptySelectionLabel, isAllSelected, isNoneSelected, noneLabel, selectedOptions, selectedValue.length]);

  const toggleOption = React.useCallback((optionId: string) => {
    if (selectedIds.has(optionId)) {
      onChange(selectedValue.filter((currentId) => currentId !== optionId));
      return;
    }

    onChange([...selectedValue, optionId]);
  }, [onChange, selectedIds, selectedValue]);

  return (
    <div className="scraper-latest__include-panel">
      <div>
        <strong>{title}</strong>
        <span>{selectedLabel}</span>
      </div>
      <div className="scraper-latest__include-actions" aria-label={ariaLabel}>
        {options.length ? (
          <>
            {noneButtonLabel ? (
              <button
                type="button"
                className={isNoneSelected ? "is-active" : ""}
                onClick={() => onChange(noneValue ? [noneValue] : [])}
              >
                {noneButtonLabel}
              </button>
            ) : null}
            <button
              type="button"
              className={isAllSelected ? "is-active" : ""}
              onClick={() => onChange(allValue ? [allValue] : [])}
            >
              {allButtonLabel}
            </button>
            {options.map((option) => {
              const isActive = selectedIds.has(option.id);

              return (
                <button
                  key={option.id}
                  type="button"
                  className={isActive ? "is-active" : ""}
                  onClick={() => toggleOption(option.id)}
                  aria-pressed={isActive}
                  title={option.label}
                >
                  {renderOptionContent
                    ? renderOptionContent(option)
                    : <span>{option.label}</span>}
                </button>
              );
            })}
          </>
        ) : (
          <span className="scraper-latest__include-empty">{emptyOptionsLabel ?? emptySelectionLabel}</span>
        )}
      </div>
    </div>
  );
}

type ScraperLatestLanguageIncludeBarProps = {
  value: string[];
  onChange: (value: string[]) => void;
};

export function ScraperLatestLanguageIncludeBar({
  value,
  onChange,
}: ScraperLatestLanguageIncludeBarProps) {
  return (
    <ScraperLatestIncludePanel
      title="Langues incluses"
      allLabel="Toutes les langues"
      allButtonLabel="Toutes"
      emptySelectionLabel="Aucune langue incluse"
      ariaLabel="Langues incluses dans les nouveautes scrappers"
      value={value}
      options={LATEST_LANGUAGE_OPTIONS}
      onChange={onChange}
      renderOptionContent={(language) => (
        <>
          <LanguageFlags languageCodes={[language.id]} />
          <span>{language.label}</span>
        </>
      )}
    />
  );
}

type ScraperLatestAuthorFavoriteIncludeBarProps = {
  favorites: ScraperAuthorFavoriteRecord[];
  value: string[];
  onChange: (value: string[]) => void;
};

export function ScraperLatestAuthorFavoriteIncludeBar({
  favorites,
  value,
  onChange,
}: ScraperLatestAuthorFavoriteIncludeBarProps) {
  const favoriteOptions = React.useMemo(
    () => favorites.map((favorite) => ({
      id: favorite.id,
      label: favorite.name,
    })),
    [favorites],
  );

  return (
    <ScraperLatestIncludePanel
      title="Auteurs favoris inclus"
      allLabel="Tous les auteurs favoris"
      allButtonLabel="Tous"
      noneLabel="Aucun auteur favori inclus"
      noneButtonLabel="Aucun"
      emptySelectionLabel="Aucun auteur favori inclus"
      emptyOptionsLabel="Aucun auteur favori disponible"
      ariaLabel="Auteurs favoris inclus dans les nouveautes"
      value={value}
      options={favoriteOptions}
      onChange={onChange}
      noneValue={LATEST_NO_AUTHOR_FAVORITES_VALUE}
    />
  );
}

type ScraperLatestScraperIncludeBarProps = {
  scrapers: ScraperRecord[];
  value: string[];
  onChange: (value: string[]) => void;
};

export function ScraperLatestScraperIncludeBar({
  scrapers,
  value,
  onChange,
}: ScraperLatestScraperIncludeBarProps) {
  const scraperOptions = React.useMemo(
    () => scrapers.map((scraper) => ({
      id: scraper.id,
      label: scraper.name,
    })),
    [scrapers],
  );

  return (
    <ScraperLatestIncludePanel
      title="Scrappers inclus"
      allLabel="Tous les scrappers actifs"
      allButtonLabel="Tous"
      noneLabel="Aucun scrapper inclus"
      noneButtonLabel="Aucun"
      emptySelectionLabel="Aucun scrapper inclus"
      emptyOptionsLabel="Aucun scrapper actif dans les nouveautes"
      ariaLabel="Scrappers inclus dans les nouveautes"
      value={value}
      options={scraperOptions}
      onChange={onChange}
      noneValue={LATEST_NO_SCRAPERS_VALUE}
    />
  );
}

type ScraperLatestTagFavoriteIncludeBarProps = {
  favorites: ScraperTagFavoriteRecord[];
  value: string[];
  onChange: (value: string[]) => void;
};

export function ScraperLatestTagFavoriteIncludeBar({
  favorites,
  value,
  onChange,
}: ScraperLatestTagFavoriteIncludeBarProps) {
  const favoriteOptions = React.useMemo(
    () => favorites.map((favorite) => ({
      id: favorite.id,
      label: favorite.name,
    })),
    [favorites],
  );

  return (
    <ScraperLatestIncludePanel
      title="Tags favoris inclus"
      allLabel="Tous les tags favoris"
      allButtonLabel="Tous"
      noneLabel="Aucun tag favori inclus"
      noneButtonLabel="Aucun"
      emptySelectionLabel="Aucun tag favori inclus"
      emptyOptionsLabel="Aucun tag favori disponible"
      ariaLabel="Tags favoris inclus dans les nouveautes"
      value={value}
      options={favoriteOptions}
      onChange={onChange}
      allValue={LATEST_ALL_TAG_FAVORITES_VALUE}
    />
  );
}
