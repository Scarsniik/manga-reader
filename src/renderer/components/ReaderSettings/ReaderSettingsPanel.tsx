import React from 'react'
import Form from '@/renderer/components/utils/Form/Form'
import type { FormItem, Option } from '@/renderer/components/utils/Form/types'
import useParams from '@/renderer/hooks/useParams'
import {
  DEFAULT_READER_IMAGE_MAX_WIDTH,
  DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT,
  DEFAULT_READER_OCR_AUTO_ANALYZE_BUBBLES,
  DEFAULT_READER_OCR_AUTO_PLAY_VOICE,
  DEFAULT_READER_OCR_NAVIGATION_DEAD_ZONE,
  DEFAULT_READER_OCR_NAVIGATION_LOOSE_FALLBACK,
  DEFAULT_READER_OCR_NAVIGATION_OFFSET,
  DEFAULT_READER_OCR_NAVIGATION_STRICT_DIRECTION,
  DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT,
  DEFAULT_READER_OCR_PRELOAD_TOKEN_DETAILS,
  DEFAULT_READER_OCR_VOICEVOX_ENABLE_KATAKANA_ENGLISH,
  DEFAULT_READER_OCR_VOICEVOX_INTERROGATIVE_UPSPEAK,
  DEFAULT_READER_OCR_VOICEVOX_INTONATION_SCALE,
  DEFAULT_READER_OCR_VOICEVOX_OUTPUT_SAMPLING_RATE,
  DEFAULT_READER_OCR_VOICEVOX_OUTPUT_STEREO,
  DEFAULT_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE,
  DEFAULT_READER_OCR_VOICEVOX_PITCH_SCALE,
  DEFAULT_READER_OCR_VOICEVOX_POST_PHONEME_LENGTH,
  DEFAULT_READER_OCR_VOICEVOX_PRE_PHONEME_LENGTH,
  DEFAULT_READER_OCR_VOICEVOX_SPEAKER_UUID,
  DEFAULT_READER_OCR_VOICEVOX_SPEED_SCALE,
  DEFAULT_READER_OCR_VOICEVOX_SPEED_STEP,
  DEFAULT_READER_OCR_VOICEVOX_STYLE_ID,
  DEFAULT_READER_OCR_VOICEVOX_VOLUME_SCALE,
  MAX_READER_OCR_VOICEVOX_INTONATION_SCALE,
  MAX_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE,
  MAX_READER_OCR_VOICEVOX_PHONEME_LENGTH,
  MAX_READER_OCR_VOICEVOX_PITCH_SCALE,
  MAX_READER_OCR_VOICEVOX_SPEED_SCALE,
  MAX_READER_OCR_VOICEVOX_SPEED_STEP,
  MAX_READER_OCR_VOICEVOX_VOLUME_SCALE,
  DEFAULT_READER_SCROLL_HOLD_SPEED,
  DEFAULT_READER_SCROLL_START_BOOST,
  DEFAULT_READER_SCROLL_STRENGTH,
  MAX_READER_IMAGE_MAX_WIDTH,
  MAX_READER_IMAGE_PRELOAD_PAGE_COUNT,
  MAX_READER_OCR_NAVIGATION_DEAD_ZONE,
  MAX_READER_OCR_NAVIGATION_OFFSET,
  MAX_READER_OCR_PRELOAD_PAGE_COUNT,
  MAX_READER_SCROLL_HOLD_SPEED,
  MAX_READER_SCROLL_START_BOOST,
  MAX_READER_SCROLL_STRENGTH,
  MIN_READER_OCR_VOICEVOX_INTONATION_SCALE,
  MIN_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE,
  MIN_READER_OCR_VOICEVOX_PHONEME_LENGTH,
  MIN_READER_OCR_VOICEVOX_PITCH_SCALE,
  MIN_READER_OCR_VOICEVOX_SPEED_SCALE,
  MIN_READER_OCR_VOICEVOX_SPEED_STEP,
  MIN_READER_OCR_VOICEVOX_VOLUME_SCALE,
  MIN_READER_IMAGE_MAX_WIDTH,
  MIN_READER_OCR_NAVIGATION_DEAD_ZONE,
  MIN_READER_OCR_NAVIGATION_OFFSET,
  MIN_READER_SCROLL_HOLD_SPEED,
  MIN_READER_SCROLL_START_BOOST,
  MIN_READER_SCROLL_STRENGTH,
  normalizeReaderImageMaxWidth,
  normalizeReaderImagePreloadPageCount,
  normalizeReaderOcrAutoAnalyzeBubbles,
  normalizeReaderOcrAutoPlayVoice,
  normalizeReaderOcrNavigationDeadZone,
  normalizeReaderOcrNavigationLooseFallback,
  normalizeReaderOcrNavigationOffset,
  normalizeReaderOcrNavigationStrictDirection,
  normalizeReaderOcrPreloadPageCount,
  normalizeReaderOcrPreloadTokenDetails,
  normalizeReaderOcrVoicevoxEnableKatakanaEnglish,
  normalizeReaderOcrVoicevoxInterrogativeUpspeak,
  normalizeReaderOcrVoicevoxIntonationScale,
  normalizeReaderOcrVoicevoxOutputSamplingRate,
  normalizeReaderOcrVoicevoxOutputStereo,
  normalizeReaderOcrVoicevoxPauseLengthScale,
  normalizeReaderOcrVoicevoxPitchScale,
  normalizeReaderOcrVoicevoxPostPhonemeLength,
  normalizeReaderOcrVoicevoxPrePhonemeLength,
  normalizeReaderOcrVoicevoxSpeakerUuid,
  normalizeReaderOcrVoicevoxSpeedScale,
  normalizeReaderOcrVoicevoxSpeedStep,
  normalizeReaderOcrVoicevoxStyleId,
  normalizeReaderOcrVoicevoxVolumeScale,
  normalizeReaderScrollHoldSpeed,
  normalizeReaderScrollStartBoost,
  normalizeReaderScrollStrength,
  READER_OCR_VOICEVOX_OUTPUT_SAMPLING_RATE_OPTIONS,
} from '@/shared/readerSettings'

type Props = {
  submitButtonId?: string
}

const VOICEVOX_TEST_ACTION_ID = 'reader-voicevox-test'
const DEFAULT_READER_OCR_VOICEVOX_TEST_TEXT = 'こんにちは。VOICEVOXのテストです。'

type VoicevoxSpeakerStyle = {
  id: number
  name: string
  type?: string
}

type VoicevoxSpeaker = {
  name: string
  speakerUuid: string
  styles: VoicevoxSpeakerStyle[]
  version?: string
}

type VoicevoxVoicesResult = {
  success?: boolean
  configured?: boolean
  message?: string | null
  error?: string | null
  speakers?: VoicevoxSpeaker[]
  defaultSpeakerId?: number
  defaultSpeakerUuid?: string | null
}

type VoicevoxSynthesisResult = {
  success?: boolean
  audioBase64?: string
  mimeType?: string
  error?: string
}

type VoicevoxTestPlaybackState = 'idle' | 'loading' | 'playing'

type VoicevoxFormOptions = {
  configured: boolean | null
  voicesLoading: boolean
  testPlaybackState: VoicevoxTestPlaybackState
  speakerOptions: Option[]
  styleOptionsBySpeaker: Record<string, Option[]>
  fallbackStyleOptions: Option[]
}

const getTalkStyles = (speaker: VoicevoxSpeaker): VoicevoxSpeakerStyle[] => (
  speaker.styles.filter((style) => !style.type || style.type === 'talk')
)

const buildSpeakerOptions = (speakers: VoicevoxSpeaker[]): Option[] => (
  speakers
    .filter((speaker) => getTalkStyles(speaker).length > 0)
    .map((speaker) => ({
      label: speaker.name,
      value: speaker.speakerUuid,
      description: speaker.version ? `VOICEVOX ${speaker.version}` : undefined,
    }))
)

const buildStyleOptionsBySpeaker = (speakers: VoicevoxSpeaker[]): Record<string, Option[]> => (
  speakers.reduce<Record<string, Option[]>>((result, speaker) => {
    const styles = getTalkStyles(speaker)
    if (styles.length === 0) {
      return result
    }

    result[speaker.speakerUuid] = styles.map((style) => ({
      label: style.name,
      value: String(style.id),
      description: speaker.name,
    }))
    return result
  }, {})
)

const buildFallbackStyleOptions = (speakers: VoicevoxSpeaker[]): Option[] => (
  speakers.flatMap((speaker) => (
    getTalkStyles(speaker).map((style) => ({
      label: `${speaker.name} - ${style.name}`,
      value: String(style.id),
    }))
  ))
)

const findSpeakerByStyleId = (speakers: VoicevoxSpeaker[], styleId: number): VoicevoxSpeaker | null => (
  speakers.find((speaker) => getTalkStyles(speaker).some((style) => style.id === styleId)) ?? null
)

const getFirstStyleIdForSpeaker = (
  styleOptionsBySpeaker: Record<string, Option[]>,
  speakerUuid: string,
): number => {
  const firstStyle = styleOptionsBySpeaker[speakerUuid]?.[0]
  return firstStyle ? normalizeReaderOcrVoicevoxStyleId(firstStyle.value) : DEFAULT_READER_OCR_VOICEVOX_STYLE_ID
}

const resolveSelectedVoicevoxStyleId = (
  values: Record<string, any>,
  styleOptionsBySpeaker: Record<string, Option[]>,
): number => {
  const selectedSpeakerUuid = normalizeReaderOcrVoicevoxSpeakerUuid(values.readerOcrVoicevoxSpeakerUuid)
  const selectedSpeakerStyles = selectedSpeakerUuid
    ? styleOptionsBySpeaker[selectedSpeakerUuid] || []
    : []
  const requestedStyleId = normalizeReaderOcrVoicevoxStyleId(values.readerOcrVoicevoxStyleId)

  return selectedSpeakerStyles.length > 0
    && !selectedSpeakerStyles.some((option) => normalizeReaderOcrVoicevoxStyleId(option.value) === requestedStyleId)
      ? getFirstStyleIdForSpeaker(styleOptionsBySpeaker, selectedSpeakerUuid)
      : requestedStyleId
}

const createAudioBlob = (audioBase64: string, mimeType: string): Blob => {
  const binary = atob(audioBase64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType || 'audio/wav' })
}

const buildReaderSettingsFields = (voicevoxOptions: VoicevoxFormOptions): FormItem[] => {
  const voiceControlsDisabled = voicevoxOptions.configured === false
    || voicevoxOptions.voicesLoading
    || voicevoxOptions.speakerOptions.length === 0

  return [
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
    id: 'reader-screen-reader',
    title: 'Lecteur d’écran',
    fields: [
      {
        name: 'readerOpenOcrPanelForJapaneseManga',
        label: 'Panneau lecteur d’écran ouvert par défaut pour manga en japonais',
        type: 'checkbox',
      },
      {
        name: 'readerOcrPreloadPageCount',
        label: 'Précharger N pages autour de la page actuelle et pré-rendre le lecteur d’écran vers l’avant puis l’arrière',
        type: 'number',
        min: 0,
        max: MAX_READER_OCR_PRELOAD_PAGE_COUNT,
        step: 1,
        placeholder: String(DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT),
      },
      {
        name: 'readerOcrAutoAnalyzeBubbles',
        label: 'Précharger traduction et parsing JPDB de chaque bulle',
        type: 'checkbox',
      },
      {
        name: 'readerOcrPreloadTokenDetails',
        label: 'Précharger aussi les détails de chaque token',
        type: 'checkbox',
      },
      {
        name: 'readerOcrNavigationOffset',
        label: 'Tolérance d’alignement clavier (%)',
        type: 'number',
        min: MIN_READER_OCR_NAVIGATION_OFFSET,
        max: MAX_READER_OCR_NAVIGATION_OFFSET,
        step: 1,
        placeholder: String(DEFAULT_READER_OCR_NAVIGATION_OFFSET),
      },
      {
        name: 'readerOcrNavigationDeadZone',
        label: 'Distance minimale dans la direction (%)',
        type: 'number',
        min: MIN_READER_OCR_NAVIGATION_DEAD_ZONE,
        max: MAX_READER_OCR_NAVIGATION_DEAD_ZONE,
        step: 1,
        placeholder: String(DEFAULT_READER_OCR_NAVIGATION_DEAD_ZONE),
      },
      {
        name: 'readerOcrNavigationStrictDirection',
        label: 'Ignorer les bulles dans la direction opposée',
        type: 'checkbox',
      },
      {
        name: 'readerOcrNavigationLooseFallback',
        label: 'Autoriser une deuxième passe diagonale si aucune bulle alignée n’est trouvée',
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
    ],
  },
  {
    type: 'section',
    id: 'reader-completion',
    title: 'Fin de lecture',
    fields: [
      {
        name: 'readerRecommendBookmarks',
        label: 'Inclure les bookmarks dans les recommandations et le manga aléatoire',
        type: 'checkbox',
      },
      {
        name: 'readerSurpriseNextOnCompletion',
        label: 'En fin de lecture, Suivant ouvre un manga surprise non commencé',
        type: 'checkbox',
      },
    ],
  },
  {
    type: 'section',
    id: 'reader-voicevox',
    title: 'Voix OCR (VOICEVOX)',
    description: voicevoxOptions.configured === false
      ? "La lecture audio n'est pas disponible pour le moment."
      : 'Réglages utilisés par le bouton Lire et par la lecture automatique des bulles OCR.',
    fields: [
      {
        name: 'readerOcrAutoPlayVoice',
        label: voicevoxOptions.configured === false
          ? 'Lire automatiquement la bulle OCR sélectionnée (VOICEVOX non configuré)'
          : 'Lire automatiquement la bulle OCR sélectionnée',
        type: 'checkbox',
        disabled: voicevoxOptions.configured === false,
      },
      {
        name: 'readerOcrVoicevoxSpeakerUuid',
        label: voicevoxOptions.voicesLoading ? 'Voix (chargement...)' : 'Voix',
        type: 'select',
        options: voicevoxOptions.speakerOptions,
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxStyleId',
        label: 'Variante de voix',
        type: 'select',
        options: voicevoxOptions.fallbackStyleOptions,
        dynamicOptions: {
          field: 'readerOcrVoicevoxSpeakerUuid',
          optionsByValue: voicevoxOptions.styleOptionsBySpeaker,
          fallbackOptions: voicevoxOptions.fallbackStyleOptions,
        },
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxSpeedScale',
        label: 'Vitesse',
        type: 'number',
        min: MIN_READER_OCR_VOICEVOX_SPEED_SCALE,
        max: MAX_READER_OCR_VOICEVOX_SPEED_SCALE,
        step: 0.05,
        placeholder: String(DEFAULT_READER_OCR_VOICEVOX_SPEED_SCALE),
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxSpeedStep',
        label: 'Pas plus lent / plus rapide',
        type: 'number',
        min: MIN_READER_OCR_VOICEVOX_SPEED_STEP,
        max: MAX_READER_OCR_VOICEVOX_SPEED_STEP,
        step: 0.05,
        placeholder: String(DEFAULT_READER_OCR_VOICEVOX_SPEED_STEP),
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxPitchScale',
        label: 'Hauteur de voix',
        type: 'number',
        min: MIN_READER_OCR_VOICEVOX_PITCH_SCALE,
        max: MAX_READER_OCR_VOICEVOX_PITCH_SCALE,
        step: 0.01,
        placeholder: String(DEFAULT_READER_OCR_VOICEVOX_PITCH_SCALE),
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxIntonationScale',
        label: 'Intonation',
        type: 'number',
        min: MIN_READER_OCR_VOICEVOX_INTONATION_SCALE,
        max: MAX_READER_OCR_VOICEVOX_INTONATION_SCALE,
        step: 0.05,
        placeholder: String(DEFAULT_READER_OCR_VOICEVOX_INTONATION_SCALE),
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxVolumeScale',
        label: 'Volume',
        type: 'number',
        min: MIN_READER_OCR_VOICEVOX_VOLUME_SCALE,
        max: MAX_READER_OCR_VOICEVOX_VOLUME_SCALE,
        step: 0.05,
        placeholder: String(DEFAULT_READER_OCR_VOICEVOX_VOLUME_SCALE),
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxPrePhonemeLength',
        label: 'Silence avant la voix (s)',
        type: 'number',
        min: MIN_READER_OCR_VOICEVOX_PHONEME_LENGTH,
        max: MAX_READER_OCR_VOICEVOX_PHONEME_LENGTH,
        step: 0.05,
        placeholder: String(DEFAULT_READER_OCR_VOICEVOX_PRE_PHONEME_LENGTH),
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxPostPhonemeLength',
        label: 'Silence après la voix (s)',
        type: 'number',
        min: MIN_READER_OCR_VOICEVOX_PHONEME_LENGTH,
        max: MAX_READER_OCR_VOICEVOX_PHONEME_LENGTH,
        step: 0.05,
        placeholder: String(DEFAULT_READER_OCR_VOICEVOX_POST_PHONEME_LENGTH),
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxPauseLengthScale',
        label: 'Durée des pauses de ponctuation',
        type: 'number',
        min: MIN_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE,
        max: MAX_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE,
        step: 0.05,
        placeholder: String(DEFAULT_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE),
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxOutputSamplingRate',
        label: 'Qualité audio',
        type: 'select',
        options: READER_OCR_VOICEVOX_OUTPUT_SAMPLING_RATE_OPTIONS.map((value) => ({
          label: `${value} Hz`,
          value: String(value),
        })),
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxOutputStereo',
        label: 'Sortie audio stéréo',
        type: 'checkbox',
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxInterrogativeUpspeak',
        label: 'Ajuster automatiquement les phrases interrogatives',
        type: 'checkbox',
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxEnableKatakanaEnglish',
        label: 'Lire les mots anglais inconnus en katakana',
        type: 'checkbox',
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxTestText',
        label: 'Texte de test',
        type: 'textarea',
        placeholder: DEFAULT_READER_OCR_VOICEVOX_TEST_TEXT,
        disabled: voiceControlsDisabled,
      },
      {
        name: 'readerOcrVoicevoxTestAction',
        label: 'Tester ces paramètres',
        type: 'action',
        actionId: VOICEVOX_TEST_ACTION_ID,
        buttonLabel: voicevoxOptions.testPlaybackState === 'loading'
          ? 'Préparation...'
          : voicevoxOptions.testPlaybackState === 'playing'
            ? 'Relire le test'
            : 'Lire le texte de test',
        disabled: voiceControlsDisabled || voicevoxOptions.testPlaybackState === 'loading',
      },
    ],
  },
  ]
}

export default function ReaderSettingsPanel({ submitButtonId }: Props) {
  const { params, loading, setParams } = useParams()
  const [voicevoxConfigured, setVoicevoxConfigured] = React.useState<boolean | null>(null)
  const [voicevoxVoicesLoading, setVoicevoxVoicesLoading] = React.useState<boolean>(true)
  const [voicevoxStatusMessage, setVoicevoxStatusMessage] = React.useState<string | null>(null)
  const [voicevoxSpeakers, setVoicevoxSpeakers] = React.useState<VoicevoxSpeaker[]>([])
  const [voicevoxDefaultSpeakerUuid, setVoicevoxDefaultSpeakerUuid] = React.useState<string | null>(null)
  const [voicevoxTestPlaybackState, setVoicevoxTestPlaybackState] = React.useState<VoicevoxTestPlaybackState>('idle')
  const [voicevoxTestPlaybackError, setVoicevoxTestPlaybackError] = React.useState<string | null>(null)
  const activeVoicevoxTestAudioRef = React.useRef<HTMLAudioElement | null>(null)
  const activeVoicevoxTestAudioUrlRef = React.useRef<string | null>(null)
  const voicevoxTestPlaybackRequestIdRef = React.useRef<number>(0)

  const releaseVoicevoxTestAudio = React.useCallback(() => {
    const activeAudio = activeVoicevoxTestAudioRef.current
    if (activeAudio) {
      activeAudio.onended = null
      activeAudio.onerror = null
      activeAudio.pause()
      activeVoicevoxTestAudioRef.current = null
    }

    if (activeVoicevoxTestAudioUrlRef.current) {
      URL.revokeObjectURL(activeVoicevoxTestAudioUrlRef.current)
      activeVoicevoxTestAudioUrlRef.current = null
    }
  }, [])

  React.useEffect(() => () => {
    releaseVoicevoxTestAudio()
  }, [releaseVoicevoxTestAudio])

  React.useEffect(() => {
    let cancelled = false

    const loadVoicevoxVoices = async () => {
      setVoicevoxVoicesLoading(true)

      if (!window.api || typeof window.api.voicevoxVoices !== 'function') {
        if (!cancelled) {
          setVoicevoxConfigured(false)
          setVoicevoxSpeakers([])
          setVoicevoxDefaultSpeakerUuid(null)
          setVoicevoxStatusMessage("La lecture audio n'est pas disponible dans cet environnement.")
          setVoicevoxVoicesLoading(false)
        }
        return
      }

      try {
        const result = await window.api.voicevoxVoices() as VoicevoxVoicesResult
        if (!cancelled) {
          const nextSpeakers = Array.isArray(result?.speakers) ? result.speakers : []
          setVoicevoxConfigured(!!result?.configured)
          setVoicevoxSpeakers(nextSpeakers)
          setVoicevoxDefaultSpeakerUuid(
            typeof result?.defaultSpeakerUuid === 'string' && result.defaultSpeakerUuid.trim()
              ? result.defaultSpeakerUuid
              : null,
          )
          setVoicevoxStatusMessage(
            typeof result?.message === 'string'
              ? result.message
              : typeof result?.error === 'string'
                ? result.error
                : null,
          )
        }
      } catch {
        if (!cancelled) {
          setVoicevoxConfigured(false)
          setVoicevoxSpeakers([])
          setVoicevoxDefaultSpeakerUuid(null)
          setVoicevoxStatusMessage("Impossible de vérifier la configuration VOICEVOX.")
        }
      } finally {
        if (!cancelled) {
          setVoicevoxVoicesLoading(false)
        }
      }
    }

    void loadVoicevoxVoices()

    return () => {
      cancelled = true
    }
  }, [])

  const voicevoxSpeakerOptions = React.useMemo(
    () => buildSpeakerOptions(voicevoxSpeakers),
    [voicevoxSpeakers],
  )
  const voicevoxStyleOptionsBySpeaker = React.useMemo(
    () => buildStyleOptionsBySpeaker(voicevoxSpeakers),
    [voicevoxSpeakers],
  )
  const voicevoxFallbackStyleOptions = React.useMemo(
    () => buildFallbackStyleOptions(voicevoxSpeakers),
    [voicevoxSpeakers],
  )
  const voicevoxFormOptions = React.useMemo<VoicevoxFormOptions>(() => ({
    configured: voicevoxConfigured,
    voicesLoading: voicevoxVoicesLoading,
    testPlaybackState: voicevoxTestPlaybackState,
    speakerOptions: voicevoxSpeakerOptions,
    styleOptionsBySpeaker: voicevoxStyleOptionsBySpeaker,
    fallbackStyleOptions: voicevoxFallbackStyleOptions,
  }), [
    voicevoxConfigured,
    voicevoxFallbackStyleOptions,
    voicevoxSpeakerOptions,
    voicevoxStyleOptionsBySpeaker,
    voicevoxTestPlaybackState,
    voicevoxVoicesLoading,
  ])

  const readerSettingsFields = React.useMemo(
    () => buildReaderSettingsFields(voicevoxFormOptions),
    [voicevoxFormOptions],
  )

  const initialValues = React.useMemo(() => {
    const sourceParams = params || {}
    const normalizedStyleId = normalizeReaderOcrVoicevoxStyleId(sourceParams.readerOcrVoicevoxStyleId)
    const normalizedSpeakerUuid = normalizeReaderOcrVoicevoxSpeakerUuid(sourceParams.readerOcrVoicevoxSpeakerUuid)
    const speakerForStyle = findSpeakerByStyleId(voicevoxSpeakers, normalizedStyleId)
    const selectedSpeakerUuid = normalizedSpeakerUuid && voicevoxStyleOptionsBySpeaker[normalizedSpeakerUuid]
      ? normalizedSpeakerUuid
      : speakerForStyle?.speakerUuid
        ?? voicevoxDefaultSpeakerUuid
        ?? voicevoxSpeakerOptions[0]?.value
        ?? DEFAULT_READER_OCR_VOICEVOX_SPEAKER_UUID
    const selectedSpeakerStyleOptions = selectedSpeakerUuid
      ? voicevoxStyleOptionsBySpeaker[selectedSpeakerUuid] || []
      : []
    const selectedStyleId = selectedSpeakerStyleOptions.some((option) => (
      normalizeReaderOcrVoicevoxStyleId(option.value) === normalizedStyleId
    ))
      ? normalizedStyleId
      : getFirstStyleIdForSpeaker(voicevoxStyleOptionsBySpeaker, selectedSpeakerUuid)

    return {
      readerImageMaxWidth: DEFAULT_READER_IMAGE_MAX_WIDTH,
      readerShowProgressIndicator: true,
      readerImagePreloadPageCount: DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT,
      readerScrollStrength: DEFAULT_READER_SCROLL_STRENGTH,
      readerScrollHoldSpeed: DEFAULT_READER_SCROLL_HOLD_SPEED,
      readerScrollStartBoost: DEFAULT_READER_SCROLL_START_BOOST,
      readerOpenOcrPanelForJapaneseManga: false,
      readerOcrAutoAnalyzeBubbles: DEFAULT_READER_OCR_AUTO_ANALYZE_BUBBLES,
      readerOcrPreloadTokenDetails: DEFAULT_READER_OCR_PRELOAD_TOKEN_DETAILS,
      readerOcrAutoPlayVoice: DEFAULT_READER_OCR_AUTO_PLAY_VOICE,
      readerOcrVoicevoxSpeedScale: DEFAULT_READER_OCR_VOICEVOX_SPEED_SCALE,
      readerOcrVoicevoxSpeedStep: DEFAULT_READER_OCR_VOICEVOX_SPEED_STEP,
      readerOcrVoicevoxPitchScale: DEFAULT_READER_OCR_VOICEVOX_PITCH_SCALE,
      readerOcrVoicevoxIntonationScale: DEFAULT_READER_OCR_VOICEVOX_INTONATION_SCALE,
      readerOcrVoicevoxVolumeScale: DEFAULT_READER_OCR_VOICEVOX_VOLUME_SCALE,
      readerOcrVoicevoxPrePhonemeLength: DEFAULT_READER_OCR_VOICEVOX_PRE_PHONEME_LENGTH,
      readerOcrVoicevoxPostPhonemeLength: DEFAULT_READER_OCR_VOICEVOX_POST_PHONEME_LENGTH,
      readerOcrVoicevoxPauseLengthScale: DEFAULT_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE,
      readerOcrVoicevoxOutputSamplingRate: DEFAULT_READER_OCR_VOICEVOX_OUTPUT_SAMPLING_RATE,
      readerOcrVoicevoxOutputStereo: DEFAULT_READER_OCR_VOICEVOX_OUTPUT_STEREO,
      readerOcrVoicevoxInterrogativeUpspeak: DEFAULT_READER_OCR_VOICEVOX_INTERROGATIVE_UPSPEAK,
      readerOcrVoicevoxEnableKatakanaEnglish: DEFAULT_READER_OCR_VOICEVOX_ENABLE_KATAKANA_ENGLISH,
      readerOcrVoicevoxTestText: DEFAULT_READER_OCR_VOICEVOX_TEST_TEXT,
      readerOcrNavigationOffset: DEFAULT_READER_OCR_NAVIGATION_OFFSET,
      readerOcrNavigationDeadZone: DEFAULT_READER_OCR_NAVIGATION_DEAD_ZONE,
      readerOcrNavigationStrictDirection: DEFAULT_READER_OCR_NAVIGATION_STRICT_DIRECTION,
      readerOcrNavigationLooseFallback: DEFAULT_READER_OCR_NAVIGATION_LOOSE_FALLBACK,
      readerRecommendBookmarks: false,
      readerSurpriseNextOnCompletion: false,
      ...sourceParams,
      readerOcrPreloadPageCount: sourceParams.readerOcrPreloadPageCount
        ?? sourceParams.readerPreloadPageCount
        ?? DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT,
      readerOcrVoicevoxSpeakerUuid: selectedSpeakerUuid,
      readerOcrVoicevoxStyleId: selectedStyleId,
    }
  }, [
    params,
    voicevoxDefaultSpeakerUuid,
    voicevoxSpeakerOptions,
    voicevoxSpeakers,
    voicevoxStyleOptionsBySpeaker,
  ])

  const handleReaderSettingsAction = React.useCallback(async (actionId: string, values: Record<string, any>) => {
    if (actionId !== VOICEVOX_TEST_ACTION_ID) {
      return
    }

    const text = String(values.readerOcrVoicevoxTestText || '').trim()
    if (!text) {
      setVoicevoxTestPlaybackError('Ajoute un texte de test avant de lancer la lecture.')
      return
    }

    if (voicevoxConfigured === false || !window.api || typeof window.api.voicevoxSynthesize !== 'function') {
      setVoicevoxTestPlaybackError(voicevoxStatusMessage || "La lecture audio n'est pas disponible pour le moment.")
      return
    }

    const playbackRequestId = voicevoxTestPlaybackRequestIdRef.current + 1
    voicevoxTestPlaybackRequestIdRef.current = playbackRequestId
    releaseVoicevoxTestAudio()
    setVoicevoxTestPlaybackState('loading')
    setVoicevoxTestPlaybackError(null)

    try {
      const result = await window.api.voicevoxSynthesize({
        text,
        speakerId: resolveSelectedVoicevoxStyleId(values, voicevoxStyleOptionsBySpeaker),
        speedScale: normalizeReaderOcrVoicevoxSpeedScale(values.readerOcrVoicevoxSpeedScale),
        pitchScale: normalizeReaderOcrVoicevoxPitchScale(values.readerOcrVoicevoxPitchScale),
        intonationScale: normalizeReaderOcrVoicevoxIntonationScale(values.readerOcrVoicevoxIntonationScale),
        volumeScale: normalizeReaderOcrVoicevoxVolumeScale(values.readerOcrVoicevoxVolumeScale),
        prePhonemeLength: normalizeReaderOcrVoicevoxPrePhonemeLength(values.readerOcrVoicevoxPrePhonemeLength),
        postPhonemeLength: normalizeReaderOcrVoicevoxPostPhonemeLength(values.readerOcrVoicevoxPostPhonemeLength),
        pauseLengthScale: normalizeReaderOcrVoicevoxPauseLengthScale(values.readerOcrVoicevoxPauseLengthScale),
        outputSamplingRate: normalizeReaderOcrVoicevoxOutputSamplingRate(values.readerOcrVoicevoxOutputSamplingRate),
        outputStereo: normalizeReaderOcrVoicevoxOutputStereo(values.readerOcrVoicevoxOutputStereo),
        interrogativeUpspeak: normalizeReaderOcrVoicevoxInterrogativeUpspeak(values.readerOcrVoicevoxInterrogativeUpspeak),
        enableKatakanaEnglish: normalizeReaderOcrVoicevoxEnableKatakanaEnglish(values.readerOcrVoicevoxEnableKatakanaEnglish),
      }) as VoicevoxSynthesisResult

      if (voicevoxTestPlaybackRequestIdRef.current !== playbackRequestId) {
        return
      }

      if (!result?.success || !result.audioBase64) {
        throw new Error(result?.error || "VOICEVOX n'a pas pu générer l'audio de test.")
      }

      const audioBlob = createAudioBlob(result.audioBase64, result.mimeType || 'audio/wav')
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)

      activeVoicevoxTestAudioRef.current = audio
      activeVoicevoxTestAudioUrlRef.current = audioUrl

      audio.onended = () => {
        if (voicevoxTestPlaybackRequestIdRef.current !== playbackRequestId) {
          return
        }

        releaseVoicevoxTestAudio()
        setVoicevoxTestPlaybackState('idle')
      }
      audio.onerror = () => {
        if (voicevoxTestPlaybackRequestIdRef.current !== playbackRequestId) {
          return
        }

        releaseVoicevoxTestAudio()
        setVoicevoxTestPlaybackState('idle')
        setVoicevoxTestPlaybackError("Impossible de lire l'audio de test généré.")
      }

      await audio.play()
      if (voicevoxTestPlaybackRequestIdRef.current === playbackRequestId) {
        setVoicevoxTestPlaybackState('playing')
      }
    } catch (error) {
      if (voicevoxTestPlaybackRequestIdRef.current !== playbackRequestId) {
        return
      }

      releaseVoicevoxTestAudio()
      setVoicevoxTestPlaybackState('idle')
      setVoicevoxTestPlaybackError(error instanceof Error && error.message.trim()
        ? error.message
        : "Impossible de lire le texte de test pour le moment.")
    }
  }, [
    releaseVoicevoxTestAudio,
    voicevoxConfigured,
    voicevoxStatusMessage,
    voicevoxStyleOptionsBySpeaker,
  ])

  const onSubmit = async (values: Record<string, any>) => {
    const selectedSpeakerUuid = normalizeReaderOcrVoicevoxSpeakerUuid(values.readerOcrVoicevoxSpeakerUuid)
    const selectedStyleId = resolveSelectedVoicevoxStyleId(values, voicevoxStyleOptionsBySpeaker)

    await setParams({
      readerImageMaxWidth: normalizeReaderImageMaxWidth(values.readerImageMaxWidth),
      readerShowProgressIndicator: values.readerShowProgressIndicator !== false,
      readerOcrPreloadPageCount: normalizeReaderOcrPreloadPageCount(values.readerOcrPreloadPageCount),
      readerOcrAutoAnalyzeBubbles: normalizeReaderOcrAutoAnalyzeBubbles(values.readerOcrAutoAnalyzeBubbles),
      readerOcrPreloadTokenDetails: normalizeReaderOcrPreloadTokenDetails(values.readerOcrPreloadTokenDetails),
      readerOcrAutoPlayVoice: voicevoxConfigured === false
        ? false
        : normalizeReaderOcrAutoPlayVoice(values.readerOcrAutoPlayVoice),
      readerOcrVoicevoxSpeakerUuid: selectedSpeakerUuid,
      readerOcrVoicevoxStyleId: selectedStyleId,
      readerOcrVoicevoxSpeedScale: normalizeReaderOcrVoicevoxSpeedScale(values.readerOcrVoicevoxSpeedScale),
      readerOcrVoicevoxSpeedStep: normalizeReaderOcrVoicevoxSpeedStep(values.readerOcrVoicevoxSpeedStep),
      readerOcrVoicevoxPitchScale: normalizeReaderOcrVoicevoxPitchScale(values.readerOcrVoicevoxPitchScale),
      readerOcrVoicevoxIntonationScale: normalizeReaderOcrVoicevoxIntonationScale(values.readerOcrVoicevoxIntonationScale),
      readerOcrVoicevoxVolumeScale: normalizeReaderOcrVoicevoxVolumeScale(values.readerOcrVoicevoxVolumeScale),
      readerOcrVoicevoxPrePhonemeLength: normalizeReaderOcrVoicevoxPrePhonemeLength(
        values.readerOcrVoicevoxPrePhonemeLength,
      ),
      readerOcrVoicevoxPostPhonemeLength: normalizeReaderOcrVoicevoxPostPhonemeLength(
        values.readerOcrVoicevoxPostPhonemeLength,
      ),
      readerOcrVoicevoxPauseLengthScale: normalizeReaderOcrVoicevoxPauseLengthScale(
        values.readerOcrVoicevoxPauseLengthScale,
      ),
      readerOcrVoicevoxOutputSamplingRate: normalizeReaderOcrVoicevoxOutputSamplingRate(
        values.readerOcrVoicevoxOutputSamplingRate,
      ),
      readerOcrVoicevoxOutputStereo: normalizeReaderOcrVoicevoxOutputStereo(values.readerOcrVoicevoxOutputStereo),
      readerOcrVoicevoxInterrogativeUpspeak: normalizeReaderOcrVoicevoxInterrogativeUpspeak(
        values.readerOcrVoicevoxInterrogativeUpspeak,
      ),
      readerOcrVoicevoxEnableKatakanaEnglish: normalizeReaderOcrVoicevoxEnableKatakanaEnglish(
        values.readerOcrVoicevoxEnableKatakanaEnglish,
      ),
      readerOcrNavigationOffset: normalizeReaderOcrNavigationOffset(values.readerOcrNavigationOffset),
      readerOcrNavigationDeadZone: normalizeReaderOcrNavigationDeadZone(values.readerOcrNavigationDeadZone),
      readerOcrNavigationStrictDirection: normalizeReaderOcrNavigationStrictDirection(values.readerOcrNavigationStrictDirection),
      readerOcrNavigationLooseFallback: normalizeReaderOcrNavigationLooseFallback(values.readerOcrNavigationLooseFallback),
      readerImagePreloadPageCount: normalizeReaderImagePreloadPageCount(values.readerImagePreloadPageCount),
      readerScrollStrength: normalizeReaderScrollStrength(values.readerScrollStrength),
      readerScrollHoldSpeed: normalizeReaderScrollHoldSpeed(values.readerScrollHoldSpeed),
      readerScrollStartBoost: normalizeReaderScrollStartBoost(values.readerScrollStartBoost),
      readerOpenOcrPanelForJapaneseManga: !!values.readerOpenOcrPanelForJapaneseManga,
      readerRecommendBookmarks: !!values.readerRecommendBookmarks,
      readerSurpriseNextOnCompletion: !!values.readerSurpriseNextOnCompletion,
    }, {
      remount: false,
    })
  }

  if (loading) {
    return <div>Chargement...</div>
  }

  return (
    <>
      {voicevoxStatusMessage ? (
        <div className="settings-modal-shortcut__error">{voicevoxStatusMessage}</div>
      ) : null}
      {voicevoxTestPlaybackError ? (
        <div className="settings-modal-shortcut__error">{voicevoxTestPlaybackError}</div>
      ) : null}
      <Form
        fields={readerSettingsFields}
        onSubmit={onSubmit}
        onAction={handleReaderSettingsAction}
        initialValues={initialValues}
        submitLabel="Enregistrer"
        formId="reader-settings-form"
        submitButtonId={submitButtonId}
      />
    </>
  )
}
