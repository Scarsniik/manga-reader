import React, { ChangeEvent } from 'react'
import { Field as FieldType } from '../types'

type Props = {
  field: FieldType
  value: any
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export default function RadioField({ field, value, onChange }: Props) {
  return (
    <div>
      {field.options?.map(o => (
        <label key={o.value} style={{ marginRight: 8 }}>
          <input type="radio" name={field.name} value={o.value} checked={value === o.value} onChange={onChange} /> {o.label}
        </label>
      ))}
    </div>
  )
}
