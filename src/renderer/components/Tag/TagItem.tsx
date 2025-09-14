import React, { useState } from 'react'
import { Tag } from '@/renderer/types'
import './style.scss'

type Props = {
  defaultValue?: Partial<Tag>
  onSubmit?: (t: { id?: string; name: string; hidden?: boolean }) => Promise<void> | void
  showHiddenCheckbox?: boolean
  editable?: boolean
  onClose?: () => void
  className?: string
}

export default function TagItem({ defaultValue = {}, onSubmit, showHiddenCheckbox = true, editable = false, onClose, className = '' }: Props) {
  const [name, setName] = useState<string>(defaultValue.name ?? '')
  const [hidden, setHidden] = useState<boolean>(Boolean(defaultValue.hidden))
  const [submitting, setSubmitting] = useState(false)

  const canSave = name.trim().length > 0

  const handleSave = async () => {
    if (!onSubmit) return
    if (!canSave) return
    setSubmitting(true)
    try {
      await onSubmit({ id: defaultValue.id, name: name.trim(), hidden })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={["tag-item", editable ? 'editing' : '', className].filter(Boolean).join(' ')}>
      <div className="tag-header">
        {editable ? (
          <>
            <input
              className="tag-title-input"
              autoFocus
              value={name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleSave();
                }
              }}
            />

            {showHiddenCheckbox ? (
              <input
                className="tag-hidden-checkbox"
                type="checkbox"
                checked={!!hidden}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setHidden(e.target.checked)}
              />
            ) : null}

            <div className="tag-actions">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void handleSave(); }}
                className="icon-btn icon-btn--confirm"
                title="Valider"
                disabled={!canSave || submitting}
              >
                ✓
              </button>

              {onClose ? (
                <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} className="icon-btn icon-btn--transparent" title="Fermer">✕</button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <strong className="tag-title">{name || <em>(nouveau tag)</em>}{hidden ? <span className="tag-ghost" title="Masqué"> 👻</span> : null}</strong>

            {onClose ? (
              <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} className="icon-btn icon-btn--transparent" title="Fermer">✕</button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
