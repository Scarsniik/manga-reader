import React from "react";

export type MultiSearchCheckboxOption = {
  label: string;
  value: string;
  description?: string;
};

type CheckboxGroupProps = {
  title: string;
  options: MultiSearchCheckboxOption[];
  selectedValues: string[];
  onChange: (value: string[]) => void;
};

type Props = {
  scraperOptions: MultiSearchCheckboxOption[];
  languageOptions: MultiSearchCheckboxOption[];
  contentTypeOptions: MultiSearchCheckboxOption[];
  selectedScraperIds: string[];
  selectedLanguageCodes: string[];
  selectedContentTypes: string[];
  onSelectedScraperIdsChange: (value: string[]) => void;
  onSelectedLanguageCodesChange: (value: string[]) => void;
  onSelectedContentTypesChange: (value: string[]) => void;
};

function MultiSearchCheckboxGroup({
  title,
  options,
  selectedValues,
  onChange,
}: CheckboxGroupProps) {
  const selectedSet = new Set(selectedValues);

  return (
    <div className="multi-search__filter-group">
      <div className="multi-search__filter-head">
        <strong>{title}</strong>
        <div>
          <button type="button" onClick={() => onChange(options.map((option) => option.value))}>
            Tout
          </button>
          <button type="button" onClick={() => onChange([])}>
            Aucun
          </button>
        </div>
      </div>

      <div className="multi-search__checkbox-list">
        {options.length ? options.map((option) => (
          <label key={option.value} className="multi-search__checkbox">
            <input
              type="checkbox"
              checked={selectedSet.has(option.value)}
              onChange={(event) => {
                if (event.target.checked) {
                  onChange([...selectedValues, option.value]);
                  return;
                }

                onChange(selectedValues.filter((value) => value !== option.value));
              }}
            />
            <span>
              {option.label}
              {option.description ? <small>{option.description}</small> : null}
            </span>
          </label>
        )) : (
          <span className="multi-search__empty-filter">Aucune option disponible</span>
        )}
      </div>
    </div>
  );
}

export default function MultiSearchFilters({
  scraperOptions,
  languageOptions,
  contentTypeOptions,
  selectedScraperIds,
  selectedLanguageCodes,
  selectedContentTypes,
  onSelectedScraperIdsChange,
  onSelectedLanguageCodesChange,
  onSelectedContentTypesChange,
}: Props) {
  return (
    <div className="multi-search__filters">
      <MultiSearchCheckboxGroup
        title="Scrappers"
        options={scraperOptions}
        selectedValues={selectedScraperIds}
        onChange={onSelectedScraperIdsChange}
      />
      <MultiSearchCheckboxGroup
        title="Langues"
        options={languageOptions}
        selectedValues={selectedLanguageCodes}
        onChange={onSelectedLanguageCodesChange}
      />
      <MultiSearchCheckboxGroup
        title="Types"
        options={contentTypeOptions}
        selectedValues={selectedContentTypes}
        onChange={onSelectedContentTypesChange}
      />
    </div>
  );
}
