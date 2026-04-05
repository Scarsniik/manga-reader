import React, { ChangeEvent } from 'react';
import ScraperConfigField from '@/renderer/components/ScraperConfig/shared/ScraperConfigField';
import {
  REQUEST_BODY_MODE_FIELD,
  REQUEST_METHOD_FIELD,
  SearchRequestFieldFormItem,
  SearchRequestFormState,
} from '@/renderer/components/ScraperConfig/search/searchFeatureEditor.utils';

type Props = {
  request: SearchRequestFormState;
  fieldErrors: Record<string, string>;
  validating: boolean;
  saving: boolean;
  onMethodChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBodyModeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBodyChange: (value: string) => void;
  onContentTypeChange: (value: string) => void;
  onAddField: () => void;
  onRemoveField: (draftId: string) => void;
  onUpdateField: (
    draftId: string,
    field: keyof Omit<SearchRequestFieldFormItem, 'draftId'>,
    value: string,
  ) => void;
};

export default function SearchRequestSection({
  request,
  fieldErrors,
  validating,
  saving,
  onMethodChange,
  onBodyModeChange,
  onBodyChange,
  onContentTypeChange,
  onAddField,
  onRemoveField,
  onUpdateField,
}: Props) {
  return (
    <>
      <ScraperConfigField
        field={REQUEST_METHOD_FIELD}
        value={request.method}
        error={fieldErrors.requestMethod}
        onChange={onMethodChange}
      />

      <div className="scraper-config-hint">
        Tu peux reutiliser dans l&apos;URL et dans le body les placeholders
        <code>{' {{query}}'}</code>, <code>{'{{rawQuery}}'}</code>, <code>{'{{page}}'}</code>,
        <code>{'{{pageIndex}}'}</code> et leurs variantes deja supportees par la recherche.
      </div>

      {request.method === 'POST' ? (
        <>
          <ScraperConfigField
            field={REQUEST_BODY_MODE_FIELD}
            value={request.bodyMode}
            error={fieldErrors.requestBodyMode}
            onChange={onBodyModeChange}
          />

          {request.bodyMode === 'form' ? (
            <>
              {request.bodyFields.length ? (
                <div className="scraper-request-fields">
                  {request.bodyFields.map((bodyField, index) => (
                    <div key={bodyField.draftId} className="scraper-request-field-card">
                      <div className="scraper-request-field-card__header">
                        <strong>{bodyField.key || `Champ POST ${index + 1}`}</strong>
                        <button
                          type="button"
                          className="secondary scraper-request-field-card__remove"
                          onClick={() => onRemoveField(bodyField.draftId)}
                          disabled={validating || saving}
                        >
                          Supprimer
                        </button>
                      </div>

                      <div className="scraper-config-section__grid">
                        <div className="mh-form__field">
                          <label htmlFor={`search-request-key-${bodyField.draftId}`}>Nom du champ *</label>
                          <input
                            id={`search-request-key-${bodyField.draftId}`}
                            type="text"
                            placeholder="Exemple : search_term"
                            value={bodyField.key}
                            onChange={(event) => onUpdateField(bodyField.draftId, 'key', event.target.value)}
                          />
                          {fieldErrors[`request.bodyFields.${bodyField.draftId}.key`] ? (
                            <div className="mh-form__field-error">
                              {fieldErrors[`request.bodyFields.${bodyField.draftId}.key`]}
                            </div>
                          ) : null}
                        </div>

                        <div className="mh-form__field">
                          <label htmlFor={`search-request-value-${bodyField.draftId}`}>Valeur</label>
                          <input
                            id={`search-request-value-${bodyField.draftId}`}
                            type="text"
                            placeholder="Exemple : {{rawQuery}}"
                            value={bodyField.value}
                            onChange={(event) => onUpdateField(bodyField.draftId, 'value', event.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="scraper-config-placeholder">
                  Aucun champ POST defini pour le moment. Ajoute les paires cle/valeur attendues
                  par le formulaire du site, par exemple <code>search_term</code>, <code>page</code>
                  ou un <code>nonce</code>.
                </div>
              )}

              <div className="scraper-request-fields__actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={onAddField}
                  disabled={validating || saving}
                >
                  Ajouter un champ POST
                </button>
              </div>
            </>
          ) : (
            <div className="scraper-request-raw">
              <div className="mh-form__field">
                <label htmlFor="search-request-content-type">Content-Type optionnel</label>
                <input
                  id="search-request-content-type"
                  type="text"
                  placeholder="Exemple : application/json"
                  value={request.contentType}
                  onChange={(event) => onContentTypeChange(event.target.value)}
                />
              </div>

              <div className="mh-form__field">
                <label htmlFor="search-request-body">Body brut</label>
                <textarea
                  id="search-request-body"
                  rows={8}
                  placeholder={'Exemple : {"query":"{{rawQuery}}","page":"{{page}}"}'}
                  value={request.body}
                  onChange={(event) => onBodyChange(event.target.value)}
                />
              </div>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
