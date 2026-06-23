import React from "react";
import IncludeFilterBar, {
  type IncludeFilterOption,
} from "@/renderer/components/IncludeFilterBar/IncludeFilterBar";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import { languages } from "@/renderer/consts/languages";
import {
  NO_MULTI_SEARCH_CONTENT_TYPES_VALUE,
  NO_MULTI_SEARCH_LANGUAGES_VALUE,
  NO_MULTI_SEARCH_SCRAPERS_VALUE,
  UNKNOWN_MULTI_SEARCH_VALUE,
} from "@/renderer/components/MultiSearch/multiSearchConstants";

export type MultiSearchFilterOption = {
  label: string;
  value: string;
};

type Props = {
  scraperOptions: MultiSearchFilterOption[];
  languageOptions: MultiSearchFilterOption[];
  contentTypeOptions: MultiSearchFilterOption[];
  selectedScraperIds: string[];
  selectedLanguageCodes: string[];
  includedLanguageCodes: string[];
  selectedContentTypes: string[];
  onSelectedScraperIdsChange: (value: string[]) => void;
  onSelectedLanguageCodesChange: (value: string[]) => void;
  onIncludedLanguageCodesChange: (value: string[]) => void;
  onSelectedContentTypesChange: (value: string[]) => void;
};

const toIncludeOptions = (options: MultiSearchFilterOption[]): IncludeFilterOption[] => (
  options.map((option) => ({
    id: option.value,
    label: option.label,
  }))
);

const INCLUDED_LANGUAGE_OPTIONS: IncludeFilterOption[] = [
  ...languages.map((language) => ({
    id: language.code,
    label: language.frenchName,
  })),
  {
    id: UNKNOWN_MULTI_SEARCH_VALUE,
    label: "Inconnue",
  },
];

export default function MultiSearchFilters({
  scraperOptions,
  languageOptions,
  contentTypeOptions,
  selectedScraperIds,
  selectedLanguageCodes,
  includedLanguageCodes,
  selectedContentTypes,
  onSelectedScraperIdsChange,
  onSelectedLanguageCodesChange,
  onIncludedLanguageCodesChange,
  onSelectedContentTypesChange,
}: Props) {
  const includeScraperOptions = React.useMemo(
    () => toIncludeOptions(scraperOptions),
    [scraperOptions],
  );
  const includeLanguageOptions = React.useMemo(
    () => toIncludeOptions(languageOptions),
    [languageOptions],
  );
  const includeContentTypeOptions = React.useMemo(
    () => toIncludeOptions(contentTypeOptions),
    [contentTypeOptions],
  );

  return (
    <div className="multi-search__filters">
      <IncludeFilterBar
        title="Scrappers"
        allLabel="Tous les scrappers"
        allButtonLabel="Tous"
        noneLabel="Aucun scrapper"
        noneButtonLabel="Aucun"
        emptySelectionLabel="Aucun scrapper"
        emptyOptionsLabel="Aucun scrapper disponible"
        ariaLabel="Scrappers inclus dans la recherche multi-source"
        value={selectedScraperIds}
        options={includeScraperOptions}
        onChange={onSelectedScraperIdsChange}
        noneValue={NO_MULTI_SEARCH_SCRAPERS_VALUE}
      />
      <IncludeFilterBar
        title="Langues des scrappers"
        allLabel="Toutes les langues"
        allButtonLabel="Toutes"
        noneLabel="Aucune langue"
        noneButtonLabel="Aucun"
        emptySelectionLabel="Aucune langue"
        emptyOptionsLabel="Aucune langue disponible"
        ariaLabel="Langues utilisees pour selectionner les scrappers de la recherche multi-source"
        value={selectedLanguageCodes}
        options={includeLanguageOptions}
        onChange={onSelectedLanguageCodesChange}
        noneValue={NO_MULTI_SEARCH_LANGUAGES_VALUE}
        renderOptionContent={(language) => (
          <>
            <LanguageFlags languageCodes={[language.id]} />
            <span>{language.label}</span>
          </>
        )}
      />
      <IncludeFilterBar
        title="Types"
        allLabel="Tous les types"
        allButtonLabel="Tous"
        noneLabel="Aucun type"
        noneButtonLabel="Aucun"
        emptySelectionLabel="Aucun type"
        emptyOptionsLabel="Aucun type disponible"
        ariaLabel="Types inclus dans la recherche multi-source"
        value={selectedContentTypes}
        options={includeContentTypeOptions}
        onChange={onSelectedContentTypesChange}
        noneValue={NO_MULTI_SEARCH_CONTENT_TYPES_VALUE}
      />
      <IncludeFilterBar
        title="Langues incluses"
        allLabel="Toutes les langues"
        allButtonLabel="Toutes"
        emptySelectionLabel="Aucune langue incluse"
        ariaLabel="Langues incluses dans les resultats de la recherche multi-source"
        value={includedLanguageCodes}
        options={INCLUDED_LANGUAGE_OPTIONS}
        onChange={onIncludedLanguageCodesChange}
        renderOptionContent={(language) => (
          <>
            <LanguageFlags languageCodes={[language.id]} />
            <span>{language.label}</span>
          </>
        )}
      />
    </div>
  );
}
