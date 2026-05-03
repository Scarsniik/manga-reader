import React, { ChangeEvent } from 'react';
import {
  ScraperFieldSelector,
  ScraperLanguageDetectionConfig,
  ScraperLanguageValueMapping,
} from '@/shared/scraper';
import { Field } from '@/renderer/components/utils/Form/types';
import { languages } from '@/renderer/consts/languages';
import ScraperConfigField from '@/renderer/components/ScraperConfig/shared/ScraperConfigField';
import ScraperFieldSelectorField from '@/renderer/components/ScraperConfig/shared/ScraperFieldSelectorField';

type Props = {
  value: ScraperLanguageDetectionConfig | undefined;
  fieldErrors: Record<string, string>;
  onDetectFromTitleChange: (enabled: boolean) => void;
  onFieldSelectorChange: (
    fieldName: 'languageSelector' | 'processedLanguageSelector',
  ) => (value: ScraperFieldSelector) => void;
  onValueMappingsChange: (valueMappings: ScraperLanguageValueMapping[]) => void;
  disabled?: boolean;
};

const DETECT_FROM_TITLE_FIELD: Field = {
  name: 'languageDetection.detectFromTitle',
  label: 'Detecter dans le titre',
  type: 'checkbox',
};

const LANGUAGE_SELECTOR_FIELD: Field = {
  name: 'languageDetection.languageSelector',
  label: 'Selecteur de langue',
  type: 'text',
  placeholder: 'Exemple : .language, .meta .lang',
};

const PROCESSED_LANGUAGE_SELECTOR_FIELD: Field = {
  name: 'languageDetection.processedLanguageSelector',
  label: 'Selecteur de langue processed',
  type: 'text',
  placeholder: 'Exemple 3hentai : .title@class ou \\bflag-([a-z]{2,4})\\b',
};

export default function ScraperLanguageDetectionSection({
  value,
  fieldErrors,
  onDetectFromTitleChange,
  onFieldSelectorChange,
  onValueMappingsChange,
  disabled = false,
}: Props) {
  const config = value ?? { detectFromTitle: false, valueMappings: [] };
  const valueMappings = config.valueMappings ?? [];

  const updateValueMapping = (
    index: number,
    fieldName: keyof ScraperLanguageValueMapping,
    nextValue: string,
  ) => {
    onValueMappingsChange(valueMappings.map((mapping, mappingIndex) => (
      mappingIndex === index
        ? { ...mapping, [fieldName]: nextValue }
        : mapping
    )));
  };

  const addValueMapping = () => {
    onValueMappingsChange([
      ...valueMappings,
      { value: '', languageCode: '' },
    ]);
  };

  const removeValueMapping = (index: number) => {
    onValueMappingsChange(valueMappings.filter((_, mappingIndex) => mappingIndex !== index));
  };

  return (
    <>
      <div className="scraper-config-section__grid">
        <ScraperConfigField
          field={DETECT_FROM_TITLE_FIELD}
          value={config.detectFromTitle}
          error={fieldErrors[DETECT_FROM_TITLE_FIELD.name]}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onDetectFromTitleChange(event.target.checked)}
        />
      </div>

      <div className="scraper-config-section__grid">
        <ScraperFieldSelectorField
          field={LANGUAGE_SELECTOR_FIELD}
          value={config.languageSelector}
          error={fieldErrors[LANGUAGE_SELECTOR_FIELD.name]}
          onChange={onFieldSelectorChange('languageSelector')}
        />
        <ScraperFieldSelectorField
          field={PROCESSED_LANGUAGE_SELECTOR_FIELD}
          value={config.processedLanguageSelector}
          error={fieldErrors[PROCESSED_LANGUAGE_SELECTOR_FIELD.name]}
          onChange={onFieldSelectorChange('processedLanguageSelector')}
        />
      </div>

      <div className="scraper-config-hint">
        Le selecteur processed sert pour les metadonnees non textuelles. Pour 3hentai, extraire la
        classe <code>flag-eng</code> permet de detecter <code>en</code>.
      </div>

      <div className="scraper-language-mapping">
        <div className="scraper-language-mapping__header">
          <strong>Table de correspondance</strong>
          <button
            type="button"
            className="secondary"
            onClick={addValueMapping}
            disabled={disabled}
          >
            Ajouter une correspondance
          </button>
        </div>

        {valueMappings.length ? (
          <div className="scraper-language-mapping__rows">
            {valueMappings.map((mapping, index) => (
              <div key={index} className="scraper-language-mapping__row">
                <div className="mh-form__field">
                  <label htmlFor={`language-mapping-value-${index}`}>Valeur detectee</label>
                  <input
                    id={`language-mapping-value-${index}`}
                    type="text"
                    placeholder="Exemple : flag-eng, eng, translated"
                    value={mapping.value}
                    disabled={disabled}
                    onChange={(event) => updateValueMapping(index, 'value', event.target.value)}
                  />
                  {fieldErrors[`languageDetection.valueMappings.${index}.value`] ? (
                    <div className="mh-form__field-error">
                      {fieldErrors[`languageDetection.valueMappings.${index}.value`]}
                    </div>
                  ) : null}
                </div>

                <div className="mh-form__field">
                  <label htmlFor={`language-mapping-code-${index}`}>Langue</label>
                  <select
                    id={`language-mapping-code-${index}`}
                    value={mapping.languageCode}
                    disabled={disabled}
                    onChange={(event) => updateValueMapping(index, 'languageCode', event.target.value)}
                  >
                    <option value="">--</option>
                    {languages.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.frenchName}
                      </option>
                    ))}
                  </select>
                  {fieldErrors[`languageDetection.valueMappings.${index}.languageCode`] ? (
                    <div className="mh-form__field-error">
                      {fieldErrors[`languageDetection.valueMappings.${index}.languageCode`]}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="secondary scraper-language-mapping__remove"
                  onClick={() => removeValueMapping(index)}
                  disabled={disabled}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="scraper-config-placeholder">
            Aucune correspondance definie. Sans table, le mode processed garde la detection
            automatique actuelle, par exemple <code>flag-eng</code> vers <code>en</code>.
          </div>
        )}

        <div className="scraper-config-hint">
          Si le selecteur processed renvoie plusieurs valeurs, la premiere valeur presente dans
          cette table est utilisee. La regex peut viser les classes du conteneur direct de la card.
        </div>
      </div>
    </>
  );
}
