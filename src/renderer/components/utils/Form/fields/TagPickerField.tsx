import React from 'react'
import { Field } from '../types'
import useTags from '@/renderer/hooks/useTags'
import EntityPickerField, { EntityOption } from './EntityPickerField'

export type TagPickerFieldProps = {
  field: Field
  value: string[]
  onChange: (e: any) => void
  placeholder?: string
  keepOpenOnAdd?: boolean
  disableSearch?: boolean
}

/**
 * TagPickerField — thin wrapper around EntityPickerField for tags.
 * Uses useTags() and maps to the generic { id, name, hidden } shape.
 */
export default function TagPickerField({
  field,
  value,
  onChange,
  placeholder,
  keepOpenOnAdd,
  disableSearch,
}: TagPickerFieldProps) {
  const { tags } = useTags()

  const options: EntityOption[] = (tags || []).map(t => ({
    id: t.id,
    name: t.name,
    hidden: !!t.hidden,
  }))

  return (
    <EntityPickerField
      field={field}
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder || field.placeholder || 'Rechercher des tags...'}
      keepOpenOnAdd={keepOpenOnAdd}
      disableSearch={disableSearch}
    />
  )
}
