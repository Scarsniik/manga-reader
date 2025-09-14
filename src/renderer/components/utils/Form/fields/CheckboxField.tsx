import React, { ChangeEvent } from 'react'
import { Field as FieldType } from '../types'

type Props = {
  field: FieldType
  value: any
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export default function CheckboxField({ field, value, onChange }: Props) {
  return <input id={field.name} name={field.name} type="checkbox" checked={!!value} onChange={onChange} />
}
