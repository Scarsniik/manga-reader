import React, { ChangeEvent } from 'react'
import { Field as FieldType } from '../types'

type Props = {
  field: FieldType
  value: any
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void
}

export default function MultiSelectField({ field, value, onChange }: Props) {
  return (
    <select id={field.name} name={field.name} multiple value={value ?? []} onChange={onChange}>
      {field.options?.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
