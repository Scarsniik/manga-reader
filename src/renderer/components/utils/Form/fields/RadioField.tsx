import React, { ChangeEvent } from 'react'
import { Field as FieldType } from '../types'

type Props = {
  field: FieldType
  value: any
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export default function RadioField({ field, value, onChange }: Props) {
  const layout = field.layout || 'stack'

  return (
    <div className={`mh-form__radio-group mh-form__radio-group--${layout}`}>
      {field.options?.map(o => (
        <label
          key={o.value}
          className={[
            'mh-form__radio-option',
            layout === 'cards' ? 'mh-form__radio-option--card' : '',
            value === o.value ? 'is-selected' : '',
          ].filter(Boolean).join(' ')}
        >
          <input
            type="radio"
            name={field.name}
            value={o.value}
            checked={value === o.value}
            onChange={onChange}
          />
          <span className="mh-form__radio-option-label">{o.label}</span>
          {o.description ? (
            <span className="mh-form__radio-option-description">{o.description}</span>
          ) : null}
        </label>
      ))}
    </div>
  )
}
