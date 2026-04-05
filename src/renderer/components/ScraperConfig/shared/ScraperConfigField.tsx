import React, { ChangeEvent } from 'react';
import { Field } from '@/renderer/components/utils/Form/types';
import RadioField from '@/renderer/components/utils/Form/fields/RadioField';
import TextField from '@/renderer/components/utils/Form/fields/TextField';

type Props = {
  field: Field;
  value?: string;
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
          value={value}
          onChange={onChange}
        />
      ) : (
        <TextField
          field={field}
          value={value}
          onChange={onChange}
        />
      )}

      {error ? <div className="mh-form__field-error">{error}</div> : null}
    </div>
  );
}
