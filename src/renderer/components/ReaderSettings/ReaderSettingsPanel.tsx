import React from 'react'
import Form from '@/renderer/components/utils/Form/Form'
import type { FormItem } from '@/renderer/components/utils/Form/types'
import useParams from '@/renderer/hooks/useParams'
import {
  DEFAULT_READER_IMAGE_MAX_WIDTH,
  DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT,
  DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT,
  DEFAULT_READER_SCROLL_HOLD_SPEED,
  DEFAULT_READER_SCROLL_START_BOOST,
  DEFAULT_READER_SCROLL_STRENGTH,
  MAX_READER_IMAGE_MAX_WIDTH,
  MAX_READER_IMAGE_PRELOAD_PAGE_COUNT,
  MAX_READER_OCR_PRELOAD_PAGE_COUNT,
  MAX_READER_SCROLL_HOLD_SPEED,
  MAX_READER_SCROLL_START_BOOST,
  MAX_READER_SCROLL_STRENGTH,
  MIN_READER_IMAGE_MAX_WIDTH,
  MIN_READER_SCROLL_HOLD_SPEED,
  MIN_READER_SCROLL_START_BOOST,
  MIN_READER_SCROLL_STRENGTH,
  normalizeReaderImageMaxWidth,
  normalizeReaderImagePreloadPageCount,
  normalizeReaderOcrPreloadPageCount,
  normalizeReaderScrollHoldSpeed,
  normalizeReaderScrollStartBoost,
  normalizeReaderScrollStrength,
} from '@/shared/readerSettings'

type Props = {
  submitButtonId?: string
}

const readerSettingsFields: FormItem[] = [
  {
    type: 'section',
    id: 'reader-appearance',
    title: 'Apparence',
    fields: [
      {
        name: 'readerImageMaxWidth',
        label: 'Largeur de l\'image',
        type: 'number',
        min: MIN_READER_IMAGE_MAX_WIDTH,
        max: MAX_READER_IMAGE_MAX_WIDTH,
        step: 20,
        placeholder: String(DEFAULT_READER_IMAGE_MAX_WIDTH),
      },
      {
        name: 'readerShowProgressIndicator',
        label: 'Afficher l\'indicateur de progression',
        type: 'checkbox',
      },
    ],
  },
  {
    type: 'section',
    id: 'reader-behavior',
    title: 'Fonctionnement',
    fields: [
      {
        name: 'readerOcrPreloadPageCount',
        label: 'Précharger N pages autour de la page actuelle et pré-rendre l\'OCR vers l\'avant puis l\'arrière',
        type: 'number',
        min: 0,
        max: MAX_READER_OCR_PRELOAD_PAGE_COUNT,
        step: 1,
        placeholder: String(DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT),
      },
      {
        name: 'readerScrollStrength',
        label: 'Force du scroll',
        type: 'number',
        min: MIN_READER_SCROLL_STRENGTH,
        max: MAX_READER_SCROLL_STRENGTH,
        step: 10,
        placeholder: String(DEFAULT_READER_SCROLL_STRENGTH),
      },
      {
        name: 'readerScrollHoldSpeed',
        label: 'Vitesse du scroll maintenu (%)',
        type: 'number',
        min: MIN_READER_SCROLL_HOLD_SPEED,
        max: MAX_READER_SCROLL_HOLD_SPEED,
        step: 10,
        placeholder: String(DEFAULT_READER_SCROLL_HOLD_SPEED),
      },
      {
        name: 'readerScrollStartBoost',
        label: 'Impulsion au déclenchement (ms)',
        type: 'number',
        min: MIN_READER_SCROLL_START_BOOST,
        max: MAX_READER_SCROLL_START_BOOST,
        step: 10,
        placeholder: String(DEFAULT_READER_SCROLL_START_BOOST),
      },
      {
        name: 'readerImagePreloadPageCount',
        label: 'Nombre de pages préchargées',
        type: 'number',
        min: 0,
        max: MAX_READER_IMAGE_PRELOAD_PAGE_COUNT,
        step: 1,
        placeholder: String(DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT),
      },
      {
        name: 'readerOpenOcrPanelForJapaneseManga',
        label: 'Panneau OCR ouvert par défaut pour manga en japonais',
        type: 'checkbox',
      },
    ],
  },
]

export default function ReaderSettingsPanel({ submitButtonId }: Props) {
  const { params, loading, setParams } = useParams()

  const initialValues = React.useMemo(() => {
    const sourceParams = params || {}

    return {
      readerImageMaxWidth: DEFAULT_READER_IMAGE_MAX_WIDTH,
      readerShowProgressIndicator: true,
      readerImagePreloadPageCount: DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT,
      readerScrollStrength: DEFAULT_READER_SCROLL_STRENGTH,
      readerScrollHoldSpeed: DEFAULT_READER_SCROLL_HOLD_SPEED,
      readerScrollStartBoost: DEFAULT_READER_SCROLL_START_BOOST,
      readerOpenOcrPanelForJapaneseManga: false,
      ...sourceParams,
      readerOcrPreloadPageCount: sourceParams.readerOcrPreloadPageCount
        ?? sourceParams.readerPreloadPageCount
        ?? DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT,
    }
  }, [params])

  const onSubmit = async (values: Record<string, any>) => {
    await setParams({
      readerImageMaxWidth: normalizeReaderImageMaxWidth(values.readerImageMaxWidth),
      readerShowProgressIndicator: values.readerShowProgressIndicator !== false,
      readerOcrPreloadPageCount: normalizeReaderOcrPreloadPageCount(values.readerOcrPreloadPageCount),
      readerImagePreloadPageCount: normalizeReaderImagePreloadPageCount(values.readerImagePreloadPageCount),
      readerScrollStrength: normalizeReaderScrollStrength(values.readerScrollStrength),
      readerScrollHoldSpeed: normalizeReaderScrollHoldSpeed(values.readerScrollHoldSpeed),
      readerScrollStartBoost: normalizeReaderScrollStartBoost(values.readerScrollStartBoost),
      readerOpenOcrPanelForJapaneseManga: !!values.readerOpenOcrPanelForJapaneseManga,
    }, {
      remount: false,
    })
  }

  if (loading) {
    return <div>Chargement...</div>
  }

  return (
    <Form
      fields={readerSettingsFields}
      onSubmit={onSubmit}
      initialValues={initialValues}
      submitLabel="Enregistrer"
      formId="reader-settings-form"
      submitButtonId={submitButtonId}
    />
  )
}
