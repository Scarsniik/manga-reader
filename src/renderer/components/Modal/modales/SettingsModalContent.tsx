import React from 'react'
import useParams from '@/renderer/hooks/useParams'
import Form from '@/renderer/components/utils/Form/Form'
import type { FormItem } from '@/renderer/components/utils/Form/types'
import OcrRuntimeSettingsPanel from '@/renderer/components/OcrRuntime/OcrRuntimeSettingsPanel'

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

  const fields: FormItem[] = [
    {
      type: 'section',
      id: 'library',
      title: 'Bibliothèque',
      fields: [
        {
          name: 'libraryPath',
          label: 'Chemin de la bibliothèque',
          type: 'text',
          required: false,
          pathPicker: 'directory',
        },
        {
          name: 'showHiddens',
          label: 'Afficher éléments cachés',
          type: 'checkbox',
        },
        {
          name: 'persistMangaFilters',
          label: 'Conserver les filtres de la liste au redémarrage',
          type: 'checkbox',
        },
        {
          name: 'showSavedLibrarySearches',
          label: 'Afficher les recherches enregistrées de la bibliothèque',
          type: 'checkbox',
        },
        {
          name: 'showSavedScraperSearches',
          label: 'Afficher les recherches enregistrées des scrappers',
          type: 'checkbox',
        },
        {
          name: 'stackMangaInSeries',
          label: 'Empiler les mangas dans une série dans la bibliothèque',
          type: 'checkbox',
        },
      ],
    },
    {
      type: 'section',
      id: 'reader',
      title: 'Lecteur',
      fields: [
        {
          name: 'showPageNumbers',
          label: 'Afficher numéros de page',
          type: 'checkbox',
        },
        {
          name: 'titleLineCount',
          label: 'Nombre de lignes pour le titre',
          type: 'number',
        },
        {
          name: 'readerPreloadPageCount',
          label: 'Précharger N pages autour de la page actuelle et pré-rendre l\'OCR vers l\'avant puis l\'arrière',
          type: 'number',
          min: 0,
          max: MAX_READER_PRELOAD_PAGE_COUNT,
          step: 1,
          placeholder: String(DEFAULT_READER_PRELOAD_PAGE_COUNT),
        },
      ],
    },
    {
      type: 'section',
      id: 'external-services',
      title: 'Services externes',
      fields: [
        {
          name: 'jpdbApiKey',
          label: 'JPDB API Key (optionnel)',
          type: 'text',
          required: false,
        },
      ],
    },
    {
      type: 'section',
      id: 'ocr',
      title: 'OCR',
      fields: [
        {
          name: 'ocrPythonPath',
          label: 'Chemin Python OCR (optionnel)',
          type: 'text',
          required: false,
          pathPicker: 'file',
        },
        {
          name: 'ocrRepoPath',
          label: 'Chemin repo OCR (optionnel)',
          type: 'text',
          required: false,
          pathPicker: 'directory',
        },
        {
          name: 'ocrForceCpu',
          label: 'Forcer OCR sur CPU',
          type: 'checkbox',
        },
        {
          name: 'ocrAutoRunOnImport',
          label: 'Lancer l\'OCR complet à l\'importation des mangas',
          type: 'checkbox',
        },
        {
          name: 'ocrAutoAssignJapaneseLanguage',
          label: 'Appliquer automatiquement la langue japonaise si l\'OCR détecte un manga japonais',
          type: 'checkbox',
        },
      ],
    },
  ]

  const onSubmit = async (values: Record<string, any>) => {
    const persistMangaFilters = values.persistMangaFilters !== false
    const showSavedLibrarySearches = values.showSavedLibrarySearches !== false
    const showSavedScraperSearches = values.showSavedScraperSearches !== false
    const stackMangaInSeries = values.stackMangaInSeries !== false
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
      ocrPythonPath: values.ocrPythonPath || '',
      ocrRepoPath: values.ocrRepoPath || '',
      ocrForceCpu: !!values.ocrForceCpu,
      ocrAutoRunOnImport: !!values.ocrAutoRunOnImport,
      ocrAutoAssignJapaneseLanguage: values.ocrAutoAssignJapaneseLanguage !== false,
      persistMangaFilters,
      showSavedLibrarySearches,
      savedLibrarySearches: params?.savedLibrarySearches ?? [],
      showSavedScraperSearches,
      savedScraperSearches: params?.savedScraperSearches ?? [],
      stackMangaInSeries,
      mangaListFilters: persistMangaFilters ? (params?.mangaListFilters ?? null) : null,
    }
    await setParams(toSave)
  }

  return (
    <div className="settings-modal-content">
      <OcrRuntimeSettingsPanel />
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
