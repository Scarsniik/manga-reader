export type Option = { label: string; value: string; description?: string }

export type Field = {
  name: string
  label?: string
  type: 'text' | 'number' | 'select' | 'selectMulti' | 'radio' | 'checkbox' | 'textarea' | 'file' | 'tagsPicker' | 'series' | 'author'
  options?: Option[]
  layout?: 'stack' | 'inline' | 'cards'
  placeholder?: string
  required?: boolean
  min?: number
  max?: number
  step?: number
  accept?: string // for file inputs
  multiple?: boolean // for file or multi select
}
