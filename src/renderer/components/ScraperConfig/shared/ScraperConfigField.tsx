import React, { ChangeEvent } from 'react';
import { Field } from '@/renderer/components/utils/Form/types';
import CheckboxField from '@/renderer/components/utils/Form/fields/CheckboxField';
import RadioField from '@/renderer/components/utils/Form/fields/RadioField';
import TextField from '@/renderer/components/utils/Form/fields/TextField';

type Props = {
  field: Field;
  value?: string | boolean;
  error?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export default function ScraperConfigField({
  field,
  value = '',
  error,
  onChange,
}: Props) {
  return (
    <div className="mh-form__field">
      {field.label ? <label htmlFor={field.name}>{field.label}{field.required ? ' *' : ''}</label> : null}

      {field.type === 'radio' ? (
        <RadioField
          field={field}
          value={String(value ?? '')}
          onChange={onChange}
        />
      ) : field.type === 'checkbox' ? (
        <CheckboxField
          field={field}
          value={Boolean(value)}
          onChange={onChange}
        />
      ) : (
        <TextField
          field={field}
          value={String(value ?? '')}
          onChange={onChange}
        />
      )}

      {error ? <div className="mh-form__field-error">{error}</div> : null}
    </div>
  );
}
