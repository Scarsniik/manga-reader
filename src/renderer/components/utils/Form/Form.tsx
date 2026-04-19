import React, { useState, ChangeEvent, FormEvent, useEffect, useCallback, useMemo } from 'react'
import type { Field, FormItem } from '@/renderer/components/utils/Form/types'
import FormField from '@/renderer/components/utils/Form/FormField'
import '@/renderer/components/utils/Form/style.scss'

type Props = {
  fields: FormItem[]
  onSubmit: (values: Record<string, any>) => void | Promise<void>
  initialValues?: Record<string, any>
  submitLabel?: string
  formId?: string
  submitButtonId?: string
  globalError?: string
  fieldErrors?: Record<string, string>
  className?: string
}

const isFormSection = (item: FormItem): item is Extract<FormItem, { type: 'section' }> => (
    item.type === 'section'
)

const getFieldsFromItems = (items: FormItem[]): Field[] => (
    items.flatMap(item => (isFormSection(item) ? item.fields : [item]))
)

export default function Form({ fields, onSubmit, initialValues = {}, submitLabel = 'Submit', globalError, fieldErrors = {}, className = '', formId, submitButtonId }: Props) {
    const flatFields = useMemo(() => getFieldsFromItems(fields), [fields])

    const buildInitialState = useCallback((srcInitial: Record<string, any>) => {
        const s: Record<string, any> = {}
        for (const f of flatFields) {
            if (srcInitial && srcInitial[f.name] !== undefined) {
                s[f.name] = srcInitial[f.name]
                continue
            }

            if (f.type === 'checkbox') {
                s[f.name] = Boolean(srcInitial?.[f.name]) || false
                continue
            }

            if (f.type === 'selectMulti' || f.type === 'tagsPicker' || f.type === 'entityPicker') {
                s[f.name] = srcInitial?.[f.name] || []
                continue
            }

            s[f.name] = srcInitial?.[f.name] ?? ''
        }
        return s
    }, [flatFields])

    const initialState = useMemo(() => buildInitialState(initialValues), [buildInitialState, initialValues])
    const [values, setValues] = useState<Record<string, any>>(initialState)
    const isBatchDebugForm = useMemo(() => {
        if (!formId?.startsWith('batch-edit-form-')) return false
        return flatFields.some(f => ['authorId', 'seriesId', 'clearAuthor', 'clearSeries'].includes(f.name))
    }, [flatFields, formId])

    // Keep internal values in sync when initialValues or fields change
    const fieldsKey = useMemo(() => flatFields.map(f => f.name).join('|'), [flatFields])
    useEffect(() => {
        const nextValues = buildInitialState(initialValues)
        setValues(nextValues)

        if (isBatchDebugForm) {
            console.log('[BatchEditForm] initial values synced', {
                formId,
                initialValues,
                nextValues,
                fields: flatFields.map(f => ({ name: f.name, type: f.type })),
            })
        }
    }, [buildInitialState, flatFields, fieldsKey, formId, initialValues, isBatchDebugForm])
    const [localFieldErrors, setLocalFieldErrors] = useState<Record<string, string>>({})
    const [submitting, setSubmitting] = useState(false)

    const mergedFieldError = useCallback((name: string) => localFieldErrors[name] || fieldErrors[name], [localFieldErrors, fieldErrors])

    const handleChange = useCallback((f: Field) => (e: ChangeEvent<any>) => {
        // File input
        if (f.type === 'file') {
            const target = e.target as HTMLInputElement
            if (isBatchDebugForm) {
                console.log('[BatchEditForm] field change', {
                    formId,
                    name: f.name,
                    type: f.type,
                    nextValue: target.files,
                })
            }
            setValues(prev => ({ ...prev, [f.name]: target.files }))
            return
        }

        // Checkbox
        if (f.type === 'checkbox') {
            const target = e.target as HTMLInputElement
            if (isBatchDebugForm) {
                console.log('[BatchEditForm] field change', {
                    formId,
                    name: f.name,
                    type: f.type,
                    nextValue: target.checked,
                })
            }
            setValues(prev => ({ ...prev, [f.name]: target.checked }))
            return
        }

        // Multi-select / Tag picker
        if (f.type === 'selectMulti' || f.type === 'tagsPicker' || f.type === 'entityPicker') {
            const target = e.target as any
            if (Array.isArray(target.value)) {
                if (isBatchDebugForm) {
                    console.log('[BatchEditForm] field change', {
                        formId,
                        name: f.name,
                        type: f.type,
                        nextValue: target.value,
                    })
                }
                setValues(prev => ({ ...prev, [f.name]: target.value }))
                return
            }
            const select = e.target as HTMLSelectElement
            const selected: string[] = Array.from(select.selectedOptions).map(o => o.value)
            if (isBatchDebugForm) {
                console.log('[BatchEditForm] field change', {
                    formId,
                    name: f.name,
                    type: f.type,
                    nextValue: selected,
                })
            }
            setValues(prev => ({ ...prev, [f.name]: selected }))
            return
        }

        const val = (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
        if (isBatchDebugForm) {
            console.log('[BatchEditForm] field change', {
                formId,
                name: f.name,
                type: f.type,
                nextValue: val,
            })
        }
        setValues(prev => ({ ...prev, [f.name]: val }))
    }, [formId, isBatchDebugForm])


    const validate = useCallback((): boolean => {
        const errors: Record<string, string> = {}
        for (const f of flatFields) {
            if (!f.required) continue
            const v = values[f.name]
            const empty = v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0)
            if (empty) errors[f.name] = 'Ce champ est requis.'
        }
        setLocalFieldErrors(errors)
        return Object.keys(errors).length === 0
    }, [flatFields, values])

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
                    for (const f of flatFields) {
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

                        if (f.type === 'tagsPicker' || f.type === 'entityPicker') {
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

                        if (f.type === 'author' || f.type === 'series') {
                            const input = fEl.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${f.name}"]`)
                            s[f.name] = input ? input.value : (values[f.name] ?? '')
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

        if (isBatchDebugForm) {
            console.log('[BatchEditForm] submit snapshot ready', {
                formId,
                stateValues: values,
                snapshot,
            })
        }

        // Validate snapshot
        const errors: Record<string, string> = {}
        for (const f of flatFields) {
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
    }, [flatFields, formId, onSubmit, validate, values])
    const handleSubmit = (e: FormEvent) => {
        e.preventDefault()
        void submitValues()
    }

    const openPath = useCallback(async (field: Field) => {
        const targetPath = String(values[field.name] || '').trim()
        if (!targetPath) return

        const api = (window as any).api
        if (!api || typeof api.openPath !== 'function') return

        try {
            await api.openPath(targetPath)
        } catch (error) {
            console.error('Failed to open path', error)
        }
    }, [values])

    const choosePath = useCallback(async (field: Field) => {
        const api = (window as any).api
        if (!api) return

        const picker = field.pathPicker === 'file' ? api.openFile : api.openDirectory
        if (typeof picker !== 'function') return

        try {
            const pickedPath = await picker()
            if (!pickedPath) return

            setValues(prev => ({ ...prev, [field.name]: pickedPath }))
        } catch (error) {
            console.error('Failed to choose path', error)
        }
    }, [])

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

    const renderField = (f: Field) => (
        <FormField
            key={f.name}
            field={f}
            value={values[f.name]}
            error={mergedFieldError(f.name)}
            onChange={handleChange}
            onOpenPath={(field) => void openPath(field)}
            onChoosePath={(field) => void choosePath(field)}
        />
    )

    return (
    <form id={formId} className={`mh-form ${className}`} onSubmit={handleSubmit} noValidate>
        {globalError ? <div className="mh-form__global-error">{globalError}</div> : null}

        {fields.map((item, index) => isFormSection(item) ? (
            <section key={`section-${item.id || item.title}-${index}`} className="mh-form__section">
                <div className="mh-form__section-header">
                    <h3>{item.title}</h3>
                    {item.description ? <p>{item.description}</p> : null}
                </div>
                {item.fields.map(renderField)}
            </section>
        ) : (
            renderField(item)
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
