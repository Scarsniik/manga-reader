import React from 'react'
import AppUpdateSettingsPanel from '@/renderer/components/AppUpdate/AppUpdateSettingsPanel'
import { FolderExternalLinkIcon } from '@/renderer/components/icons'
import useParams from '@/renderer/hooks/useParams'
import Form from '@/renderer/components/utils/Form/Form'
import type { FormItem } from '@/renderer/components/utils/Form/types'
import OcrRuntimeSettingsPanel from '@/renderer/components/OcrRuntime/OcrRuntimeSettingsPanel'
import ShortcutSettingsPanel from '@/renderer/components/ShortcutSettings/ShortcutSettingsPanel'

import '@/renderer/components/Modal/style.scss'
import '@/renderer/components/Modal/modales/settings-style.scss'

const DEFAULT_READER_PRELOAD_PAGE_COUNT = 2
const MAX_READER_PRELOAD_PAGE_COUNT = 10

declare global {
  interface Window {
    api: any
  }
}

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
  const [activeTab, setActiveTab] = React.useState<'options' | 'shortcuts' | 'version-installation'>('options')
  const [isOpeningUserDataDirectory, setIsOpeningUserDataDirectory] = React.useState(false)
  const [userDataDirectoryError, setUserDataDirectoryError] = React.useState<string | null>(null)

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
      showSavedScraperSearches,
      stackMangaInSeries,
      ...(persistMangaFilters ? {} : { mangaListFilters: null }),
    }
    await setParams(toSave)
  }

  const handleOpenUserDataDirectory = React.useCallback(async () => {
    if (!window.api || typeof window.api.openUserDataDirectory !== 'function') {
      setUserDataDirectoryError("L'ouverture du dossier de données utilisateur n'est pas disponible.")
      return
    }

    setIsOpeningUserDataDirectory(true)
    setUserDataDirectoryError(null)

    try {
      const result = await window.api.openUserDataDirectory()
      if (!result?.success) {
        throw new Error(String(result?.error || "Impossible d'ouvrir le dossier de données utilisateur."))
      }
    } catch (error) {
      setUserDataDirectoryError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsOpeningUserDataDirectory(false)
    }
  }, [])

  if (loading) return <div>Chargement...</div>

  return (
    <div className="settings-modal-content">
      <div className="settings-modal-tabs">
        <button
          type="button"
          className={`settings-modal-tab ${activeTab === 'options' ? 'active' : ''}`}
          onClick={() => setActiveTab('options')}
        >
          Options
        </button>
        <button
          type="button"
          className={`settings-modal-tab ${activeTab === 'shortcuts' ? 'active' : ''}`}
          onClick={() => setActiveTab('shortcuts')}
        >
          Raccourcis
        </button>
        <button
          type="button"
          className={`settings-modal-tab ${activeTab === 'version-installation' ? 'active' : ''}`}
          onClick={() => setActiveTab('version-installation')}
        >
          Version et installation
        </button>
      </div>

      <div className="settings-modal-panels">
        {activeTab === 'options' ? (
          <div className="settings-modal-panel">
            <Form
              fields={fields}
              onSubmit={onSubmit}
              initialValues={params || {}}
              submitLabel="Enregistrer"
              formId="settings-form"
            />
            <section className="settings-modal-shortcut">
              <div className="settings-modal-shortcut__content">
                <h3>Données utilisateur</h3>
                <p>Ouvre le dossier qui contient les paramètres, historiques et fichiers JSON de l'application.</p>
              </div>
              <div className="settings-modal-shortcut__actions">
                <button
                  type="button"
                  className="settings-modal-shortcut__button"
                  onClick={() => void handleOpenUserDataDirectory()}
                  disabled={isOpeningUserDataDirectory}
                >
                  <FolderExternalLinkIcon aria-hidden="true" />
                  <span>{isOpeningUserDataDirectory ? "Ouverture..." : "Ouvrir le dossier de données utilisateur"}</span>
                </button>
              </div>
              {userDataDirectoryError ? (
                <div className="settings-modal-shortcut__error">{userDataDirectoryError}</div>
              ) : null}
            </section>
          </div>
        ) : null}

        {activeTab === 'shortcuts' ? (
          <div className="settings-modal-panel">
            <ShortcutSettingsPanel />
          </div>
        ) : null}

        {activeTab === 'version-installation' ? (
          <div className="settings-modal-panel">
            <AppUpdateSettingsPanel />
            <OcrRuntimeSettingsPanel />
          </div>
        ) : null}
      </div>
    </div>
  )
}
