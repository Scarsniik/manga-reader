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
  /** When true, selecting a result replaces the current selection instead of appending to it. */
  singleSelect?: boolean
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
  singleSelect = false,
}: EntityPickerFieldProps) {
  const DEFAULT_VISIBLE_RESULTS = 100
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const selected = value || []
  const hiddenRef = useRef<HTMLInputElement | null>(null)
  const hiddenValue = useMemo(
    () => (singleSelect ? (selected[0] ?? '') : JSON.stringify(selected)),
    [selected, singleSelect],
  )

  // Keep hidden input in sync with the controlled `value` prop.
  // We only write JSON to the hidden input — the Form implementation expects
  // a DOM snapshot. The external API (`onChange({ target: { value } })`) is
  // preserved when committing changes.
  useEffect(() => {
    if (hiddenRef.current) hiddenRef.current.value = hiddenValue
  }, [hiddenValue])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? options.filter(t => (t.name || '').toLowerCase().includes(q))
      : options
    // exclude already selected ids
    return base.filter(t => !selected.includes(t.id))
  }, [options, query, selected])

  const visibleResults = useMemo(
    () => filtered.slice(0, DEFAULT_VISIBLE_RESULTS),
    [filtered],
  )

  const hasHiddenResults = filtered.length > DEFAULT_VISIBLE_RESULTS

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
    const nextValue = singleSelect ? (next[0] ?? '') : next
    if (hiddenRef.current) {
      hiddenRef.current.value = singleSelect ? String(nextValue) : JSON.stringify(next)
    }
    onChange({ target: { name: field.name, value: nextValue } })
  }, [field.name, onChange, singleSelect])

  const add = useCallback((id: string) => {
    if (selected.includes(id)) return
    const next = singleSelect ? [id] : [...selected, id]
    commit(next)
    if (singleSelect || !keepOpenOnAdd) setOpen(false)
    setQuery('')
  }, [selected, commit, keepOpenOnAdd, singleSelect])

  const remove = useCallback((id: string) => {
    const next = selected.filter(x => x !== id)
    commit(next)
  }, [selected, commit])

  const getById = useCallback((id: string) => options.find(x => x.id === id) || { id, name: id }, [options])

  return (
    <div className="mh-entity-picker" ref={containerRef}>
      {/* Hidden input mirrors selected ids so Form can read a DOM snapshot synchronously */}
      <input type="hidden" name={field.name} ref={hiddenRef} value={hiddenValue} readOnly />

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

      {open ? (
        <div className="mh-entity-picker__results" role="listbox" tabIndex={-1}>
          {visibleResults.length > 0 ? (
            visibleResults.map(opt => (
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
            ))
          ) : (
            <div className="mh-entity-picker__empty">Aucun resultat</div>
          )}
          {hasHiddenResults ? (
            <div className="mh-entity-picker__hint">
              {DEFAULT_VISIBLE_RESULTS} premiers resultats affiches sur {filtered.length}
            </div>
          ) : null}
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
