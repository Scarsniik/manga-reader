import React, { ChangeEvent } from 'react'
import type { Field } from '@/renderer/components/utils/Form/types'
import TextField from '@/renderer/components/utils/Form/fields/TextField'
import NumberField from '@/renderer/components/utils/Form/fields/NumberField'
import TextareaField from '@/renderer/components/utils/Form/fields/TextareaField'
import SelectField from '@/renderer/components/utils/Form/fields/SelectField'
import MultiSelectField from '@/renderer/components/utils/Form/fields/MultiSelectField'
import TagPickerField from '@/renderer/components/utils/Form/fields/TagPickerField'
import RadioField from '@/renderer/components/utils/Form/fields/RadioField'
import CheckboxField from '@/renderer/components/utils/Form/fields/CheckboxField'
import FileField from '@/renderer/components/utils/Form/fields/FileField'
import SeriesField from '@/renderer/components/utils/Form/fields/SeriesField'
import AuthorField from '@/renderer/components/utils/Form/fields/AuthorField'
import EntityPickerField from '@/renderer/components/utils/Form/fields/EntityPickerField'

type Props = {
    field: Field
    value: any
    error?: string
    onChange: (field: Field) => (event: ChangeEvent<any>) => void
    onOpenPath: (field: Field) => void
    onChoosePath: (field: Field) => void
    onAction: (field: Field) => void
}

const renderLabel = (field: Field) => (
    field.label ? <label htmlFor={field.name}>{field.label}{field.required ? ' *' : ''}</label> : null
)

const getFieldClassName = (field: Field, modifier?: string): string => (
    [
        'mh-form__field',
        modifier ? `mh-form__field--${modifier}` : null,
        field.disabled ? 'is-disabled' : null,
    ].filter(Boolean).join(' ')
)

export default function FormField({
    field,
    value,
    error,
    onChange,
    onOpenPath,
    onChoosePath,
    onAction,
}: Props) {
    if (field.type === "action") {
        return (
            <div className={getFieldClassName(field, 'action')}>
                {renderLabel(field)}

                <button
                    type="button"
                    className="mh-form__action-button"
                    disabled={field.disabled}
                    onClick={() => onAction(field)}
                >
                    {field.buttonLabel || field.label || 'Action'}
                </button>

                {error ? <div className="mh-form__field-error">{error}</div> : null}
            </div>
        )
    }

    if (field.type === "checkbox") {
        return (
            <div className={getFieldClassName(field, 'checkbox')}>
                <div className="mh-form__inline-row">
                    <CheckboxField field={field} value={value} onChange={onChange(field) as any} />
                    {renderLabel(field)}
                </div>

                {error ? <div className="mh-form__field-error">{error}</div> : null}
            </div>
        )
    }

    if (field.type === "number") {
        return (
            <div className={getFieldClassName(field, 'number')}>
                <div className="mh-form__inline-row">
                    <NumberField field={field} value={value} onChange={onChange(field) as any} />
                    {renderLabel(field)}
                </div>

                {error ? <div className="mh-form__field-error">{error}</div> : null}
            </div>
        )
    }

    if (field.type === "text" && field.pathPicker) {
        const hasPath = String(value || '').trim().length > 0

        return (
            <div className={getFieldClassName(field, 'path')}>
                {renderLabel(field)}

                <div className="mh-form__path-row">
                    <TextField field={field} value={value} onChange={onChange(field) as any} />
                    <button type="button" onClick={() => onOpenPath(field)} disabled={field.disabled || !hasPath}>
                        Ouvrir
                    </button>
                    <button type="button" onClick={() => onChoosePath(field)} disabled={field.disabled}>
                        Choisir
                    </button>
                </div>

                {error ? <div className="mh-form__field-error">{error}</div> : null}
            </div>
        )
    }

    return (
        <div className={getFieldClassName(field)}>
            {renderLabel(field)}

            {field.type === "text" ? <TextField field={field} value={value} onChange={onChange(field) as any} /> : null}
            {field.type === "textarea" ? <TextareaField field={field} value={value} onChange={onChange(field) as any} /> : null}
            {field.type === "select" ? <SelectField field={field} value={value} onChange={onChange(field) as any} /> : null}
            {field.type === "selectMulti" ? <MultiSelectField field={field} value={value} onChange={onChange(field) as any} /> : null}
            {field.type === "tagsPicker" ? <TagPickerField field={field} value={value} onChange={onChange(field) as any} /> : null}
            {field.type === "entityPicker" ? (
              <EntityPickerField
                field={field}
                options={(field.options || []).map((option) => ({
                  id: option.value,
                  name: option.label,
                }))}
                value={value || []}
                onChange={onChange(field) as any}
                placeholder={field.placeholder}
              />
            ) : null}
            {field.type === "radio" ? <RadioField field={field} value={value} onChange={onChange(field) as any} /> : null}
            {field.type === "file" ? <FileField field={field} onChange={onChange(field) as any} /> : null}
            {field.type === "series" ? <SeriesField field={field} value={value} onChange={onChange(field) as any} /> : null}
            {field.type === "author" ? <AuthorField field={field} value={value} onChange={onChange(field) as any} /> : null}

            {error ? <div className="mh-form__field-error">{error}</div> : null}
        </div>
    )
}
