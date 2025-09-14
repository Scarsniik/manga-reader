import React, { ChangeEvent } from 'react'
import { Field as FieldType } from '../types'

type Props = {
  field: FieldType
  value: any
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void
}

export default function SelectField({ field, value, onChange }: Props) {
  return (
    <select id={field.name} name={field.name} value={value ?? ''} onChange={onChange}>
      <option value="">--</option>
      {field.options?.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
