import React from 'react';
import { ScraperFieldSelector } from '@/shared/scraper';
import ScraperFieldSelectorField from '@/renderer/components/ScraperConfig/shared/ScraperFieldSelectorField';
import {
  DERIVED_VALUE_FIELD_OPTIONS,
  DERIVED_VALUE_SOURCE_OPTIONS,
  DerivedValueFormItem,
} from '@/renderer/components/ScraperConfig/details/detailsFeatureEditor.utils';

type Props = {
  derivedValues: DerivedValueFormItem[];
  fieldErrors: Record<string, string>;
  validating: boolean;
  saving: boolean;
  onAdd: () => void;
  onRemove: (draftId: string) => void;
  onUpdate: (
    draftId: string,
    field: keyof Omit<DerivedValueFormItem, 'draftId'>,
    nextValue: string | ScraperFieldSelector,
  ) => void;
};

export default function DetailsDerivedValuesSection({
  derivedValues,
  fieldErrors,
  validating,
  saving,
  onAdd,
  onRemove,
  onUpdate,
}: Props) {
  return (
    <>
      {derivedValues.length ? (
        <div className="scraper-derived-values">
          {derivedValues.map((derivedValue, index) => (
            <DerivedValueCard
              key={derivedValue.draftId}
              derivedValue={derivedValue}
              index={index}
              fieldErrors={fieldErrors}
              validating={validating}
              saving={saving}
              onRemove={onRemove}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      ) : (
        <div className="scraper-config-placeholder">
          Aucune variable definie pour le moment. Tu peux en ajouter une si la fiche contient
          un identifiant, un token ou un chemin utile pour `Pages` ou d&apos;autres blocs.
        </div>
      )}

      <div className="scraper-derived-values__actions">
        <button
          type="button"
          className="secondary"
          onClick={onAdd}
          disabled={validating || saving}
        >
          Ajouter une variable
        </button>
      </div>
    </>
  );
}

type DerivedValueCardProps = {
  derivedValue: DerivedValueFormItem;
  index: number;
  fieldErrors: Record<string, string>;
  validating: boolean;
  saving: boolean;
  onRemove: (draftId: string) => void;
  onUpdate: (
    draftId: string,
    field: keyof Omit<DerivedValueFormItem, 'draftId'>,
    nextValue: string | ScraperFieldSelector,
  ) => void;
};

function DerivedValueCard({
  derivedValue,
  index,
  fieldErrors,
  validating,
  saving,
  onRemove,
  onUpdate,
}: DerivedValueCardProps) {
  const isHtmlSource = derivedValue.sourceType === 'html';
  const isSelectorSource = derivedValue.sourceType === 'selector';
  const isFieldSource = derivedValue.sourceType === 'field';
  const patternLabel = isHtmlSource ? 'Regex HTML *' : 'Regex optionnelle';
  const patternPlaceholder = isHtmlSource
    ? 'Exemple : data-id="(\\d+)"'
    : 'Exemple : d_(\\d+)';

  return (
    <div className="scraper-derived-value-card">
      <div className="scraper-derived-value-card__header">
        <strong>{derivedValue.key ? `{{${derivedValue.key}}}` : `Variable ${index + 1}`}</strong>
        <button
          type="button"
          className="secondary scraper-derived-value-card__remove"
          onClick={() => onRemove(derivedValue.draftId)}
          disabled={validating || saving}
        >
          Supprimer
        </button>
      </div>

      <div className="scraper-config-section__grid">
        <div className="mh-form__field">
          <label htmlFor={`derived-key-${derivedValue.draftId}`}>Nom de variable *</label>
          <input
            id={`derived-key-${derivedValue.draftId}`}
            type="text"
            placeholder="Exemple : mangaId"
            value={derivedValue.key}
            onChange={(event) => onUpdate(derivedValue.draftId, 'key', event.target.value)}
          />
          {fieldErrors[`derivedValues.${derivedValue.draftId}.key`] ? (
            <div className="mh-form__field-error">
              {fieldErrors[`derivedValues.${derivedValue.draftId}.key`]}
            </div>
          ) : null}
        </div>

        <div className="mh-form__field">
          <label htmlFor={`derived-source-type-${derivedValue.draftId}`}>Source *</label>
          <select
            id={`derived-source-type-${derivedValue.draftId}`}
            value={derivedValue.sourceType}
            onChange={(event) => onUpdate(derivedValue.draftId, 'sourceType', event.target.value)}
          >
            {DERIVED_VALUE_SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {isFieldSource ? (
          <div className="mh-form__field">
            <label htmlFor={`derived-source-field-${derivedValue.draftId}`}>Champ source *</label>
            <select
              id={`derived-source-field-${derivedValue.draftId}`}
              value={derivedValue.sourceField ?? ''}
              onChange={(event) => onUpdate(derivedValue.draftId, 'sourceField', event.target.value)}
            >
              <option value="">--</option>
              {DERIVED_VALUE_FIELD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldErrors[`derivedValues.${derivedValue.draftId}.sourceField`] ? (
              <div className="mh-form__field-error">
                {fieldErrors[`derivedValues.${derivedValue.draftId}.sourceField`]}
              </div>
            ) : null}
          </div>
        ) : null}

        {isSelectorSource ? (
          <ScraperFieldSelectorField
            field={{
              name: `derived-selector-${derivedValue.draftId}`,
              label: 'Selecteur source',
              type: 'text',
              required: true,
              placeholder: 'Exemple : #cif .iw img@src',
            }}
            value={derivedValue.selector}
            error={fieldErrors[`derivedValues.${derivedValue.draftId}.selector`]}
            onChange={(nextValue) => onUpdate(derivedValue.draftId, 'selector', nextValue)}
          />
        ) : null}

        <div className="mh-form__field">
          <label htmlFor={`derived-pattern-${derivedValue.draftId}`}>{patternLabel}</label>
          <input
            id={`derived-pattern-${derivedValue.draftId}`}
            type="text"
            placeholder={patternPlaceholder}
            value={derivedValue.pattern ?? ''}
            onChange={(event) => onUpdate(derivedValue.draftId, 'pattern', event.target.value)}
          />
          {fieldErrors[`derivedValues.${derivedValue.draftId}.pattern`] ? (
            <div className="mh-form__field-error">
              {fieldErrors[`derivedValues.${derivedValue.draftId}.pattern`]}
            </div>
          ) : null}
        </div>
      </div>

      <div className="scraper-derived-value-card__footer">
        {isHtmlSource
          ? (
            <>
              La regex s&apos;applique sur tout le HTML brut de la page, puis la variable reste
              reutilisable via <code>{`{{${derivedValue.key || 'nomVariable'}}}`}</code>.
            </>
          )
          : (
            <>
              Cette variable pourra etre reutilisee plus tard dans les autres composants
              via <code>{`{{${derivedValue.key || 'nomVariable'}}}`}</code>.
            </>
          )}
      </div>
    </div>
  );
}
