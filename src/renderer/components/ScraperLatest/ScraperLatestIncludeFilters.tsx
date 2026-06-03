import React from "react";
import IncludeFilterBar from "@/renderer/components/IncludeFilterBar/IncludeFilterBar";
import {
  buildIncludeFilterExcludedValue,
  getIncludeFilterExcludedId,
  splitIncludeFilterValues,
} from "@/renderer/components/IncludeFilterBar/includeFilterValues";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import { languages } from "@/renderer/consts/languages";
import { UNKNOWN_MULTI_SEARCH_VALUE } from "@/renderer/components/MultiSearch/multiSearchConstants";
import type {
  ScraperAuthorFavoriteRecord,
  ScraperRecord,
  ScraperTagFavoriteRecord,
} from "@/shared/scraper";

export const LATEST_ALL_TAG_FAVORITES_VALUE = "__all_tag_favorites__";
export const LATEST_NO_SCRAPERS_VALUE = "__no_scrapers__";
export const LATEST_NO_AUTHOR_FAVORITES_VALUE = "__no_author_favorites__";

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
    const rawEntry = String(entry ?? "").trim();
    const excludedId = getIncludeFilterExcludedId(rawEntry);
    const normalizedEntry = excludedId ?? rawEntry;
    const normalizedValue = options?.lowercase
      ? normalizedEntry.toLowerCase()
      : normalizedEntry;
    const normalized = excludedId ? buildIncludeFilterExcludedValue(normalizedValue) : normalizedValue;

    if (
      !normalizedValue
      || seen.has(normalized)
      || (allowedValues && !allowedValues.has(normalizedValue))
    ) {
      return result;
    }

    seen.add(normalized);
    result.push(normalized);
    return result;
  }, []);
};

const filterByIncludeValues = <Item,>(
  items: readonly Item[],
  values: readonly string[],
  getId: (item: Item) => string,
  defaultMode: "all" | "none",
): Item[] => {
  const { includedValues, excludedValues } = splitIncludeFilterValues(values);
  const excludedValueSet = new Set(excludedValues);

  if (includedValues.length) {
    const includedValueSet = new Set(includedValues);
    return items.filter((item) => {
      const itemId = getId(item);
      return includedValueSet.has(itemId) && !excludedValueSet.has(itemId);
    });
  }

  if (!excludedValues.length && defaultMode === "none") {
    return [];
  }

  return items.filter((item) => !excludedValueSet.has(getId(item)));
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

  return filterByIncludeValues(favorites, includedFavoriteIds, (favorite) => favorite.id, "all");
};

export const getIncludedLatestTagFavorites = (
  favorites: readonly ScraperTagFavoriteRecord[],
  includedFavoriteIds: readonly string[],
): ScraperTagFavoriteRecord[] => {
  if (includedFavoriteIds.includes(LATEST_ALL_TAG_FAVORITES_VALUE)) {
    return [...favorites];
  }

  return filterByIncludeValues(favorites, includedFavoriteIds, (favorite) => favorite.id, "none");
};

type ScraperLatestLanguageIncludeBarProps = {
  value: string[];
  onChange: (value: string[]) => void;
};

export function ScraperLatestLanguageIncludeBar({
  value,
  onChange,
}: ScraperLatestLanguageIncludeBarProps) {
  return (
    <IncludeFilterBar
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
    <IncludeFilterBar
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
    <IncludeFilterBar
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
    <IncludeFilterBar
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
