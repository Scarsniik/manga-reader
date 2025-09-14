import React, { ChangeEvent } from 'react'
import { Field as FieldType } from '../types'

type Props = {
  field: FieldType
  value: any
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export default function TextField({ field, value, onChange }: Props) {
  return (
    <input id={field.name} name={field.name} type="text" placeholder={field.placeholder} value={value ?? ''} onChange={onChange} />
  )
}
