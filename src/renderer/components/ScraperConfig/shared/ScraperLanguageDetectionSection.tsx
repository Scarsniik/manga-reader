import React, { ChangeEvent } from 'react';
import {
  ScraperFieldSelector,
  ScraperLanguageDetectionConfig,
} from '@/shared/scraper';
import { Field } from '@/renderer/components/utils/Form/types';
import ScraperConfigField from '@/renderer/components/ScraperConfig/shared/ScraperConfigField';
import ScraperFieldSelectorField from '@/renderer/components/ScraperConfig/shared/ScraperFieldSelectorField';

type Props = {
  value: ScraperLanguageDetectionConfig | undefined;
  fieldErrors: Record<string, string>;
  onDetectFromTitleChange: (enabled: boolean) => void;
  onFieldSelectorChange: (
    fieldName: 'languageSelector' | 'processedLanguageSelector',
  ) => (value: ScraperFieldSelector) => void;
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
}: Props) {
  const config = value ?? { detectFromTitle: false };

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
    </>
  );
}
