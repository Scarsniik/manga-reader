import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Field } from '../types'
import TagItem from '@/renderer/components/Tag/TagItem'
import './EntityPickerField.scss'

/**
 * Generic option shape for the picker. Works for tags, authors, series, etc.
 */
export type EntityOption = {
  id: string
  name: string
  hidden?: boolean
}

export type EntityPickerFieldProps = {
  /** Form field meta (name is used to sync the hidden input for form posts) */
  field: Field
  /** All available options to pick from */
  options: EntityOption[]
  /** Controlled list of selected ids */
  value: string[]
  /** onChange contract kept as (e: any) to stay compatible with your current Form impl. */
  onChange: (e: any) => void
  /** Placeholder for the search input (falls back to field.placeholder) */
  placeholder?: string
  /** Keep dropdown open after adding an item (default: false) */
  keepOpenOnAdd?: boolean
  /** Disable free text input (search). When true, input is readOnly but still opens the dropdown. */
  disableSearch?: boolean
}

/**
 * EntityPickerField — a generic searchable multi-select by id/name.
 *
 * Suggested usage: tags, authors, series (any entity { id, name }).
 */
export default function EntityPickerField({
  field,
  options,
  value,
  onChange,
  placeholder,
  keepOpenOnAdd = false,
  disableSearch = false,
}: EntityPickerFieldProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const selected = value || []
  const hiddenRef = useRef<HTMLInputElement | null>(null)

  // Keep hidden input in sync with the controlled `value` prop.
  // We only write JSON to the hidden input — the Form implementation expects
  // a DOM snapshot. The external API (`onChange({ target: { value } })`) is
  // preserved when committing changes.
  useEffect(() => {
    if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(selected)
  }, [selected])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? options.filter(t => (t.name || '').toLowerCase().includes(q))
      : options
    // exclude already selected ids
    return base.filter(t => !selected.includes(t.id))
  }, [options, query, selected])

  // close dropdown on outside click
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!containerRef.current || !target) return
      if (!containerRef.current.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])
  const commit = useCallback((next: string[]) => {
    if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(next)
    onChange({ target: { value: next } })
  }, [onChange])

  const add = useCallback((id: string) => {
    if (selected.includes(id)) return
    const next = [...selected, id]
    commit(next)
    if (!keepOpenOnAdd) setOpen(false)
    setQuery('')
  }, [selected, commit, keepOpenOnAdd])

  const remove = useCallback((id: string) => {
    const next = selected.filter(x => x !== id)
    commit(next)
  }, [selected, commit])

  const getById = useCallback((id: string) => options.find(x => x.id === id) || { id, name: id }, [options])

  return (
    <div className="mh-entity-picker" ref={containerRef}>
      {/* Hidden input mirrors selected ids so Form can read a DOM snapshot synchronously */}
      <input type="hidden" name={field.name} ref={hiddenRef} value={JSON.stringify(selected)} readOnly />

      <div className="mh-entity-picker__row">
        <input
          type="text"
          aria-label={field.label || field.name}
          placeholder={placeholder || field.placeholder || 'Rechercher...'}
          value={query}
          readOnly={disableSearch}
          onChange={e => { if (!disableSearch) { setQuery(e.target.value) } setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            // support Escape to close
            if (e.key === 'Escape') setOpen(false)
          }}
        />
      </div>

      {open && filtered.length > 0 ? (
        <div className="mh-entity-picker__results" role="listbox" tabIndex={-1}>
          {filtered.map(opt => (
            <button
              key={opt.id}
              type="button"
              className="mh-entity-picker__result"
              onMouseDown={e => e.preventDefault()}
              onClick={() => add(opt.id)}
              role="option"
              aria-selected={false}
            >
              <p>{opt.name}</p>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mh-entity-picker__selected">
        {selected.map(id => {
          const opt = getById(id)
          return (
            <TagItem
              key={id}
              defaultValue={{ id: opt.id, name: opt.name, hidden: !!opt.hidden }}
              editable={false}
              showHiddenCheckbox={false}
              onClose={() => remove(id)}
            />
          )
        })}
      </div>
    </div>
  )
}
