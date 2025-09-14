import React, { ChangeEvent } from 'react'
import { Field as FieldType } from '../types'

type Props = {
  field: FieldType
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export default function FileField({ field, onChange }: Props) {
  return <input id={field.name} name={field.name} type="file" accept={field.accept} multiple={!!field.multiple} onChange={onChange} />
}
