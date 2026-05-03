import React from 'react';
import {
  createScraperFieldSelector,
  normalizeScraperFieldSelector,
  ScraperFieldSelector,
} from '@/shared/scraper';
import { Field } from '@/renderer/components/utils/Form/types';

type Props = {
  field: Field;
  value?: ScraperFieldSelector | string;
  error?: string;
  onChange: (value: ScraperFieldSelector) => void;
};

const getFormSelectorValue = (value: ScraperFieldSelector | string | undefined): ScraperFieldSelector => {
  if (value && typeof value === 'object') {
    return createScraperFieldSelector(value.kind === 'regex' ? 'regex' : 'css', value.value ?? '');
  }

  return normalizeScraperFieldSelector(value) ?? createScraperFieldSelector();
};

export default function ScraperFieldSelectorField({
  field,
  value,
  error,
  onChange,
}: Props) {
  const selector = getFormSelectorValue(value);
  const isRegex = selector.kind === 'regex';
  const toggleTitle = isRegex
    ? 'Mode regex actif. La regex est appliquee au HTML du bloc courant.'
    : 'Mode selecteur CSS actif. Clique pour passer en regex.';

  const handleToggle = () => {
    onChange(createScraperFieldSelector(isRegex ? 'css' : 'regex', selector.value));
  };

  return (
    <div className="mh-form__field scraper-field-selector">
      {field.label ? <label htmlFor={field.name}>{field.label}{field.required ? ' *' : ''}</label> : null}

      <div className="scraper-field-selector__control">
        <button
          type="button"
          className={`scraper-field-selector__toggle${isRegex ? ' is-active' : ''}`}
          title={toggleTitle}
          aria-label={toggleTitle}
          aria-pressed={isRegex}
          onClick={handleToggle}
        >
          .*
        </button>
        <input
          id={field.name}
          name={field.name}
          type="text"
          placeholder={field.placeholder}
          value={selector.value}
          onChange={(event) => onChange(createScraperFieldSelector(selector.kind, event.target.value))}
        />
      </div>

      {error ? <div className="mh-form__field-error">{error}</div> : null}
    </div>
  );
}
