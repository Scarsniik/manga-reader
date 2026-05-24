import React from "react";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import { languages } from "@/renderer/consts/languages";
import { UNKNOWN_MULTI_SEARCH_VALUE } from "@/renderer/components/MultiSearch/multiSearchConstants";
import type { ScraperRecord } from "@/shared/scraper";

type IncludeOption = {
  id: string;
  label: string;
};

type ScraperLatestIncludePanelProps = {
  title: string;
  allLabel: string;
  allButtonLabel: string;
  emptySelectionLabel: string;
  emptyOptionsLabel?: string;
  ariaLabel: string;
  value: string[];
  options: IncludeOption[];
  onChange: (value: string[]) => void;
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
): string[] => (
  normalizeStringList(value, { allowedValues: allowedScraperIds })
);

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

function ScraperLatestIncludePanel({
  title,
  allLabel,
  allButtonLabel,
  emptySelectionLabel,
  emptyOptionsLabel,
  ariaLabel,
  value,
  options,
  onChange,
  renderOptionContent,
}: ScraperLatestIncludePanelProps) {
  const selectedIds = React.useMemo(() => new Set(value), [value]);
  const selectedOptions = React.useMemo(
    () => options.filter((option) => selectedIds.has(option.id)),
    [options, selectedIds],
  );
  const selectedLabel = !value.length
    ? allLabel
    : selectedOptions.length
      ? formatSelectedLabels(selectedOptions.map((option) => option.label))
      : emptySelectionLabel;

  const toggleOption = React.useCallback((optionId: string) => {
    if (selectedIds.has(optionId)) {
      onChange(value.filter((currentId) => currentId !== optionId));
      return;
    }

    onChange([...value, optionId]);
  }, [onChange, selectedIds, value]);

  return (
    <div className="scraper-latest__include-panel">
      <div>
        <strong>{title}</strong>
        <span>{selectedLabel}</span>
      </div>
      <div className="scraper-latest__include-actions" aria-label={ariaLabel}>
        {options.length ? (
          <>
            <button
              type="button"
              className={!value.length ? "is-active" : ""}
              onClick={() => onChange([])}
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
      emptySelectionLabel="Aucun scrapper inclus"
      emptyOptionsLabel="Aucun scrapper actif dans les nouveautes"
      ariaLabel="Scrappers inclus dans les nouveautes"
      value={value}
      options={scraperOptions}
      onChange={onChange}
    />
  );
}
