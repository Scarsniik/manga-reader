import React, { ChangeEvent } from 'react'
import { Field as FieldType } from '../types'

type Props = {
  field: FieldType
  value: any
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
}

export default function TextareaField({ field, value, onChange }: Props) {
  return <textarea id={field.name} name={field.name} placeholder={field.placeholder} value={value ?? ''} onChange={onChange} />
}
