import React, { ChangeEvent } from 'react';
import { ScraperFieldSelector } from '@/shared/scraper';
import { Field } from '@/renderer/components/utils/Form/types';
import ScraperConfigField from '@/renderer/components/ScraperConfig/shared/ScraperConfigField';
import ScraperFieldSelectorField from '@/renderer/components/ScraperConfig/shared/ScraperFieldSelectorField';
import { formatDisplayUrl } from '@/renderer/components/ScraperConfig/shared/validationDisplay';

type ScraperFeatureActionsProps = {
  validating: boolean;
  saving: boolean;
  validateLabel: string;
  onBack: () => void;
  onValidate: () => void;
  onSave: () => void;
};

export function ScraperFeatureActions({
  validating,
  saving,
  validateLabel,
  onBack,
  onValidate,
  onSave,
}: ScraperFeatureActionsProps) {
  return (
    <div className="scraper-config-step__actions">
      <button type="button" className="secondary" onClick={onBack} disabled={validating || saving}>
        Retour
      </button>
      <button type="button" className="secondary" onClick={onValidate} disabled={validating || saving}>
        {validating ? 'Validation en cours...' : validateLabel}
      </button>
      <button type="button" className="primary" onClick={onSave} disabled={validating || saving}>
        {saving ? 'Enregistrement...' : 'Enregistrer la configuration'}
      </button>
    </div>
  );
}

type ScraperResolvedUrlPreviewProps = {
  url: string | null;
  emptyMessage: string;
  label?: string;
};

export function ScraperResolvedUrlPreview({
  url,
  emptyMessage,
  label = 'URL de test resolue',
}: ScraperResolvedUrlPreviewProps) {
  return (
    <div className="scraper-config-preview">
      <span>{label}</span>
      <strong>{url ? formatDisplayUrl(url) : emptyMessage}</strong>
    </div>
  );
}

type ScraperConfigFieldGridProps = {
  fields: Field[];
  fieldSelectorNames?: readonly string[];
  getValue: (fieldName: string) => string | boolean | ScraperFieldSelector | undefined;
  getError: (fieldName: string) => string | undefined;
  onFieldChange: (fieldName: string) => (event: ChangeEvent<HTMLInputElement>) => void;
  onFieldSelectorChange?: (fieldName: string) => (value: ScraperFieldSelector) => void;
};

export function ScraperConfigFieldGrid({
  fields,
  fieldSelectorNames = [],
  getValue,
  getError,
  onFieldChange,
  onFieldSelectorChange,
}: ScraperConfigFieldGridProps) {
  const fieldSelectorNameSet = new Set(fieldSelectorNames);

  return (
    <div className="scraper-config-section__grid">
      {fields.map((field) => {
        if (fieldSelectorNameSet.has(field.name) && onFieldSelectorChange) {
          return (
            <ScraperFieldSelectorField
              key={field.name}
              field={field}
              value={getValue(field.name) as ScraperFieldSelector | string | undefined}
              error={getError(field.name)}
              onChange={onFieldSelectorChange(field.name)}
            />
          );
        }

        return (
          <ScraperConfigField
            key={field.name}
            field={field}
            value={getValue(field.name) as string | boolean | undefined ?? ''}
            error={getError(field.name)}
            onChange={onFieldChange(field.name)}
          />
        );
      })}
    </div>
  );
}

type ScraperUrlTemplateFieldsProps = {
  strategyField: Field;
  strategyValue: string;
  strategyError?: string;
  onStrategyChange: (event: ChangeEvent<HTMLInputElement>) => void;
  showTemplateFields: boolean;
  templateField: Field;
  templateValue?: string;
  templateError?: string;
  onTemplateChange: (event: ChangeEvent<HTMLInputElement>) => void;
  templateBaseField?: Field;
  templateBaseValue?: string;
  templateBaseError?: string;
  onTemplateBaseChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  children?: React.ReactNode;
};

export function ScraperUrlTemplateFields({
  strategyField,
  strategyValue,
  strategyError,
  onStrategyChange,
  showTemplateFields,
  templateField,
  templateValue = '',
  templateError,
  onTemplateChange,
  templateBaseField,
  templateBaseValue = '',
  templateBaseError,
  onTemplateBaseChange,
  children,
}: ScraperUrlTemplateFieldsProps) {
  return (
    <>
      <ScraperConfigField
        field={strategyField}
        value={strategyValue}
        error={strategyError}
        onChange={onStrategyChange}
      />

      {showTemplateFields ? (
        <>
          <ScraperConfigField
            field={templateField}
            value={templateValue}
            error={templateError}
            onChange={onTemplateChange}
          />

          {templateBaseField && onTemplateBaseChange ? (
            <ScraperConfigField
              field={templateBaseField}
              value={templateBaseValue}
              error={templateBaseError}
              onChange={onTemplateBaseChange}
            />
          ) : null}

          {children}
        </>
      ) : null}
    </>
  );
}
