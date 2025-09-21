export type Option = { label: string; value: string }

export type Field = {
  name: string
  label?: string
  type: 'text' | 'number' | 'select' | 'selectMulti' | 'radio' | 'checkbox' | 'textarea' | 'file' | 'tagsPicker' | 'series'
  options?: Option[]
  placeholder?: string
  required?: boolean
  accept?: string // for file inputs
  multiple?: boolean // for file or multi select
}
