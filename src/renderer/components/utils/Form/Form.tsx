import React, { useState, ChangeEvent, FormEvent, useEffect, useCallback, useMemo } from 'react'
import { Field } from './types'
import TextField from './fields/TextField'
import NumberField from './fields/NumberField'
import TextareaField from './fields/TextareaField'
import SelectField from './fields/SelectField'
import MultiSelectField from './fields/MultiSelectField'
import TagPickerField from './fields/TagPickerField'
import RadioField from './fields/RadioField'
import CheckboxField from './fields/CheckboxField'
import FileField from './fields/FileField'
import './style.scss'

type Props = {
  fields: Field[]
  onSubmit: (values: Record<string, any>) => void | Promise<void>
  initialValues?: Record<string, any>
  submitLabel?: string
  formId?: string
  submitButtonId?: string
  globalError?: string
  fieldErrors?: Record<string, string>
  className?: string
}

export default function Form({ fields, onSubmit, initialValues = {}, submitLabel = 'Submit', globalError, fieldErrors = {}, className = '', formId, submitButtonId }: Props) {
    const buildInitialState = useCallback((srcInitial: Record<string, any>) => {
        const s: Record<string, any> = {}
        for (const f of fields) {
            if (srcInitial && srcInitial[f.name] !== undefined) {
                s[f.name] = srcInitial[f.name]
                continue
            }

            if (f.type === 'checkbox') {
                s[f.name] = Boolean(srcInitial?.[f.name]) || false
                continue
            }

            if (f.type === 'selectMulti' || f.type === 'tagsPicker') {
                s[f.name] = srcInitial?.[f.name] || []
                continue
            }

            s[f.name] = srcInitial?.[f.name] ?? ''
        }
        return s
    }, [fields])

    const initialState = useMemo(() => buildInitialState(initialValues), [buildInitialState, initialValues])
    const [values, setValues] = useState<Record<string, any>>(initialState)

    // Keep internal values in sync when initialValues or fields change
    const fieldsKey = useMemo(() => fields.map(f => f.name).join('|'), [fields])
    useEffect(() => {
        setValues(buildInitialState(initialValues))
    }, [buildInitialState, initialValues, fieldsKey])
    const [localFieldErrors, setLocalFieldErrors] = useState<Record<string, string>>({})
    const [submitting, setSubmitting] = useState(false)

    const mergedFieldError = useCallback((name: string) => localFieldErrors[name] || fieldErrors[name], [localFieldErrors, fieldErrors])

    const handleChange = useCallback((f: Field) => (e: ChangeEvent<any>) => {
        // File input
        if (f.type === 'file') {
            const target = e.target as HTMLInputElement
            setValues(prev => ({ ...prev, [f.name]: target.files }))
            return
        }

        // Checkbox
        if (f.type === 'checkbox') {
            const target = e.target as HTMLInputElement
            setValues(prev => ({ ...prev, [f.name]: target.checked }))
            return
        }

        // Multi-select / Tag picker
        if (f.type === 'selectMulti' || f.type === 'tagsPicker') {
            const target = e.target as any
            if (Array.isArray(target.value)) {
                setValues(prev => ({ ...prev, [f.name]: target.value }))
                return
            }
            const select = e.target as HTMLSelectElement
            const selected: string[] = Array.from(select.selectedOptions).map(o => o.value)
            setValues(prev => ({ ...prev, [f.name]: selected }))
            return
        }

        const val = (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
        setValues(prev => ({ ...prev, [f.name]: val }))
    }, [])


    const validate = useCallback((): boolean => {
        const errors: Record<string, string> = {}
        for (const f of fields) {
            if (!f.required) continue
            const v = values[f.name]
            const empty = v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0)
            if (empty) errors[f.name] = 'Ce champ est requis.'
        }
        setLocalFieldErrors(errors)
        return Object.keys(errors).length === 0
    }, [fields, values])

    const submitValues = useCallback(async () => {
        // Validate current state first
        if (!validate()) return

        // Take a fresh snapshot from DOM when possible to avoid stale React state
        let snapshot: Record<string, any> = values
        if (formId) {
            const fEl = document.getElementById(formId) as HTMLFormElement | null
            if (fEl) {
                try {
                    const fd = new FormData(fEl)
                    const s: Record<string, any> = {}
                    for (const f of fields) {
                        if (f.type === 'checkbox') {
                            const input = fEl.querySelector<HTMLInputElement>(`[name="${f.name}"]`)
                            s[f.name] = !!input?.checked
                            continue
                        }
                        if (f.type === 'file') {
                            const input = fEl.querySelector<HTMLInputElement>(`[name="${f.name}"]`)
                            s[f.name] = input?.files || null
                            continue
                        }
                        if (f.type === 'selectMulti') {
                            const sel = fEl.querySelector<HTMLSelectElement>(`[name="${f.name}"]`)
                            s[f.name] = sel ? Array.from(sel.selectedOptions).map(o => o.value) : []
                            continue
                        }

                        if (f.type === 'tagsPicker') {
                            const input = fEl.querySelector<HTMLInputElement>(`[name="${f.name}"]`)
                            if (input && input.value) {
                                try {
                                    const parsed = JSON.parse(input.value)
                                    s[f.name] = Array.isArray(parsed) ? parsed : values[f.name] || []
                                } catch (e) {
                                    s[f.name] = values[f.name] || []
                                }
                            } else {
                                s[f.name] = values[f.name] || []
                            }
                            continue
                        }

                        const v = fd.get(f.name)
                        s[f.name] = v === null ? '' : String(v)
                    }
                    snapshot = s
                } catch {
                    // fallback to state
                    // intentionally silent
                }
            }
        }

        // Validate snapshot
        const errors: Record<string, string> = {}
        for (const f of fields) {
            if (f.required) {
                const v = snapshot[f.name]
                const empty = v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0)
                if (empty) errors[f.name] = 'Ce champ est requis.'
            }
        }
        setLocalFieldErrors(errors)
        if (Object.keys(errors).length > 0) return

        try {
            setSubmitting(true)
            await onSubmit(snapshot)
        } finally {
            setSubmitting(false)
        }
    }, [fields, formId, onSubmit, validate, values])
    const handleSubmit = (e: FormEvent) => {
        e.preventDefault()
        void submitValues()
    }

    // If an external submit button id is provided, wire it to submitValues
    useEffect(() => {
        if (!submitButtonId) return

        let attached = false
        const onClick = (ev: Event) => {
            ev.preventDefault()
            void submitValues()
        }

        const attachIfFound = () => {
            const el = document.getElementById(submitButtonId)
            if (el && !attached) {
                el.addEventListener('click', onClick)
                attached = true
            }
            return el
        }

        // Try immediate attach
        attachIfFound()

        // Fallback: observe DOM mutations to catch late-mounted external button
        const observer = new MutationObserver(() => attachIfFound())
        observer.observe(document.body, { childList: true, subtree: true })

        return () => {
            observer.disconnect()
            const el = document.getElementById(submitButtonId)
            if (el && attached) el.removeEventListener('click', onClick)
        }
    }, [submitButtonId, submitValues])

    return (
    <form id={formId} className={`mh-form ${className}`} onSubmit={handleSubmit} noValidate>
        {globalError ? <div className="mh-form__global-error">{globalError}</div> : null}

        {fields.map(f => (
            <div key={f.name} className="mh-form__field">
            {f.label ? <label htmlFor={f.name}>{f.label}{f.required ? ' *' : ''}</label> : null}

            {f.type === 'text' ? <TextField field={f} value={values[f.name]} onChange={handleChange(f) as any} /> : null}
            {f.type === 'number' ? <NumberField field={f} value={values[f.name]} onChange={handleChange(f) as any} /> : null}
            {f.type === 'textarea' ? <TextareaField field={f} value={values[f.name]} onChange={handleChange(f) as any} /> : null}
            {f.type === 'select' ? <SelectField field={f} value={values[f.name]} onChange={handleChange(f) as any} /> : null}
            {f.type === 'selectMulti' ? <MultiSelectField field={f} value={values[f.name]} onChange={handleChange(f) as any} /> : null}
            {f.type === 'tagsPicker' ? <TagPickerField field={f} value={values[f.name]} onChange={handleChange(f) as any} /> : null}
            {f.type === 'radio' ? <RadioField field={f} value={values[f.name]} onChange={handleChange(f) as any} /> : null}
            {f.type === 'checkbox' ? <CheckboxField field={f} value={values[f.name]} onChange={handleChange(f) as any} /> : null}
            {f.type === 'file' ? <FileField field={f} onChange={handleChange(f) as any} /> : null}

            {mergedFieldError(f.name) ? <div className="mh-form__field-error">{mergedFieldError(f.name)}</div> : null}
            </div>
        ))}

        {(!submitButtonId) ? (
            <div className="mh-form__actions">
            <button type="submit" disabled={submitting}>
                {submitting ? '...' : submitLabel}
            </button>
            </div>
        ) : null}
        </form>
    )
}
