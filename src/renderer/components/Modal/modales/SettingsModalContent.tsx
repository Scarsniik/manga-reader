import React from 'react'
import useParams from '@/renderer/hooks/useParams'
import Form from '@/renderer/components/utils/Form/Form'
import { Field } from '@/renderer/components/utils/Form/types'

import '@/renderer/components/Modal/style.scss'

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

    // convert types
    const toSave: Record<string, any> = {
      libraryPath: values.libraryPath || '',
      showPageNumbers: !!values.showPageNumbers,
      showHiddens: !!values.showHiddens,
      titleLineCount: Number(values.titleLineCount) || 1,
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
