import React from 'react'
import useParams from '@/renderer/hooks/useParams'
import Form from '@/renderer/components/utils/Form/Form'
import { Field } from '@/renderer/components/utils/Form/types'

import '@/renderer/components/Modal/style.scss'

const DEFAULT_READER_PRELOAD_PAGE_COUNT = 2
const MAX_READER_PRELOAD_PAGE_COUNT = 10

const normalizeReaderPreloadPageCount = (value: unknown) => {
  const parsed = typeof value === 'number'
    ? value
    : (typeof value === 'string' && value.trim().length > 0 ? Number(value) : Number.NaN)

  if (!Number.isFinite(parsed)) {
    return DEFAULT_READER_PRELOAD_PAGE_COUNT
  }

  return Math.max(0, Math.min(MAX_READER_PRELOAD_PAGE_COUNT, Math.floor(parsed)))
}

export default function SettingsModalContent() {
  const { params, loading, setParams } = useParams()

  if (loading) return <div>Chargement...</div>

  const fields: Field[] = [
    {
      name: 'libraryPath',
      label: 'Chemin de la bibliothèque',
      type: 'text',
      required: false,
    },
    {
      name: 'showPageNumbers',
      label: 'Afficher numéros de page',
      type: 'checkbox',
    },
    {
      name: 'showHiddens',
      label: 'Afficher éléments cachés',
      type: 'checkbox',
    },
    {
      name: 'titleLineCount',
      label: 'Nombre de lignes pour le titre',
      type: 'number',
    },
    {
      name: 'readerPreloadPageCount',
      label: 'Précharger N pages avant et après la page actuelle',
      type: 'number',
      min: 0,
      max: MAX_READER_PRELOAD_PAGE_COUNT,
      step: 1,
      placeholder: String(DEFAULT_READER_PRELOAD_PAGE_COUNT),
    },
    {
      name: 'jpdbApiKey',
      label: 'JPDB API Key (optionnel)',
      type: 'text',
      required: false,
    },
    {
      name: 'persistMangaFilters',
      label: 'Conserver les filtres de la liste au redémarrage',
      type: 'checkbox',
    },
  ]

  const onSubmit = async (values: Record<string, any>) => {
    const persistMangaFilters = values.persistMangaFilters !== false
    const readerPreloadPageCount = normalizeReaderPreloadPageCount(values.readerPreloadPageCount)

    // convert types
    const toSave: Record<string, any> = {
      ...(params || {}),
      libraryPath: values.libraryPath || '',
      showPageNumbers: !!values.showPageNumbers,
      showHiddens: !!values.showHiddens,
      titleLineCount: Number(values.titleLineCount) || 1,
      readerPreloadPageCount,
      jpdbApiKey: values.jpdbApiKey || '',
      persistMangaFilters,
      mangaListFilters: persistMangaFilters ? (params?.mangaListFilters ?? null) : null,
    }
    await setParams(toSave)
  }

  return (
    <div className="settings-modal-content">
      <Form
        fields={fields}
        onSubmit={onSubmit}
        initialValues={params || {}}
        submitLabel="Enregistrer"
        submitButtonId="settings-save"
        formId="settings-form"
      />
    </div>
  )
}
