import React from 'react'
import AppUpdateSettingsPanel from '@/renderer/components/AppUpdate/AppUpdateSettingsPanel'
import { FolderExternalLinkIcon } from '@/renderer/components/icons'
import useModal from '@/renderer/hooks/useModal'
import useParams from '@/renderer/hooks/useParams'
import Form from '@/renderer/components/utils/Form/Form'
import type { FormItem } from '@/renderer/components/utils/Form/types'
import OcrRuntimeSettingsPanel from '@/renderer/components/OcrRuntime/OcrRuntimeSettingsPanel'
import ReaderSettingsPanel from '@/renderer/components/ReaderSettings/ReaderSettingsPanel'
import ShortcutSettingsPanel from '@/renderer/components/ShortcutSettings/ShortcutSettingsPanel'
import StatisticsPanel from '@/renderer/components/Statistics/StatisticsPanel'
import MergedTitleLanguagePrioritySettings from '@/renderer/components/Modal/modales/MergedTitleLanguagePrioritySettings'
import { normalizeMultiSearchTitleLanguagePriority } from '@/renderer/components/MultiSearch/multiSearchTitleSelection'
import {
  DEFAULT_SCRAPER_VIEW_HISTORY_MAX_RECORDS,
  DEFAULT_SCRAPER_VIEW_HISTORY_READ_RETENTION_DAYS,
  DEFAULT_SCRAPER_VIEW_HISTORY_SEEN_RETENTION_DAYS,
  normalizeScraperViewHistorySettings,
} from '@/shared/scraper'
import { normalizeMangaCorrespondenceSafetyParams } from '@/shared/mangaCorrespondenceSafetySettings'

import '@/renderer/components/Modal/style.scss'
import '@/renderer/components/Modal/modales/settings-style.scss'

const OPTIONS_SUBMIT_BUTTON_ID = 'settings-options-submit'
const SCRAPING_SUBMIT_BUTTON_ID = 'settings-scraping-submit'
const READER_SUBMIT_BUTTON_ID = 'settings-reader-submit'
const DEVELOPER_SUBMIT_BUTTON_ID = 'settings-developer-submit'

declare global {
  interface Window {
    api: any
  }
}

export default function SettingsModalContent() {
  const { params, loading, setParams } = useParams()
  const { setModalActions } = useModal()
  const [activeTab, setActiveTab] = React.useState<
    'options' | 'scraping' | 'reader' | 'shortcuts' | 'statistics' | 'developer' | 'version-installation'
  >('options')
  const [isOpeningUserDataDirectory, setIsOpeningUserDataDirectory] = React.useState(false)
  const [userDataDirectoryError, setUserDataDirectoryError] = React.useState<string | null>(null)
  const [mergedTitleLanguagePriority, setMergedTitleLanguagePriority] = React.useState<string[]>([])
  const activeSubmitButtonId = activeTab === 'options'
    ? OPTIONS_SUBMIT_BUTTON_ID
    : activeTab === 'scraping'
      ? SCRAPING_SUBMIT_BUTTON_ID
      : activeTab === 'reader'
        ? READER_SUBMIT_BUTTON_ID
        : activeTab === 'developer'
          ? DEVELOPER_SUBMIT_BUTTON_ID
          : null

  React.useEffect(() => {
    setMergedTitleLanguagePriority(normalizeMultiSearchTitleLanguagePriority(
      params?.multiSearchMergedTitleLanguagePriority,
    ))
  }, [params?.multiSearchMergedTitleLanguagePriority])

  React.useEffect(() => {
    setModalActions(activeSubmitButtonId ? [
      {
        label: 'Enregistrer',
        variant: 'primary',
        id: activeSubmitButtonId,
        closeOnClick: false,
      },
      {
        label: 'Fermer',
        variant: 'secondary',
      },
    ] : [
      {
        label: 'Fermer',
        variant: 'secondary',
      },
    ])

    return () => {
      setModalActions([
        {
          label: 'Fermer',
          variant: 'secondary',
        },
      ])
    }
  }, [activeSubmitButtonId, setModalActions])

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
          name: 'stackMangaInSeries',
          label: 'Empiler les mangas dans une série dans la bibliothèque',
          type: 'checkbox',
        },
      ],
    },
    {
      type: 'section',
      id: 'library-display',
      title: 'Affichage bibliothèque',
      fields: [
        {
          name: 'showPageNumbers',
          label: 'Afficher le nombre de pages sur les cartes',
          type: 'checkbox',
        },
        {
          name: 'titleLineCount',
          label: 'Nombre de lignes pour le titre des cartes',
          type: 'number',
        },
      ],
    },
    {
      type: 'section',
      id: 'workspace',
      title: 'Workspace',
      fields: [
        {
          name: 'readingListKeepSourceTabs',
          label: 'Conserver les onglets manga après la création d\'une liste de lecture',
          type: 'checkbox',
        },
      ],
    },
    {
      type: 'section',
      id: 'scraping',
      title: 'Scraping',
      fields: [
        {
          name: 'showSavedScraperSearches',
          label: 'Afficher les recherches enregistrées des scrappers',
          type: 'checkbox',
        },
        {
          name: 'scraperAuthorFavoriteCacheResults',
          label: 'Stocker les résultats des auteurs favoris',
          type: 'checkbox',
        },
        {
          name: 'scraperScrapeDetailsWithCards',
          label: 'Scraper la fiche pendant l\'extraction des cards scrapper et nouveautés (POC)',
          type: 'checkbox',
        },
        {
          name: 'scraperHideBlacklistedTagCards',
          label: 'Masquer les cards avec tags blacklistés',
          type: 'checkbox',
        },
        {
          name: 'scraperCardPotentialMatchesEnabled',
          label: 'Signaler les cards potentiellement déjà bookmarkées, lues ou présentes dans une liste',
          type: 'checkbox',
        },
        {
          name: 'scraperAuthorCombinedView',
          label: 'Afficher les pages auteur en vue combinée',
          type: 'checkbox',
        },
        {
          name: 'scraperTagCombinedView',
          label: 'Afficher les pages tag en vue fusionnée',
          type: 'checkbox',
        },
        {
          name: 'scraperTagFavoriteShowUnseenFirst',
          label: 'Afficher les cards non vues en premier dans les tags favoris',
          type: 'checkbox',
        },
        {
          name: 'scraperAuthorFavoritePageCount',
          label: 'Pages à charger à l\'ouverture d\'un auteur favori',
          type: 'number',
          min: 1,
          max: 20,
          step: 1,
          disabledWhen: {
            field: 'scraperAuthorFavoriteCacheResults',
            equals: true,
          },
        },
        {
          name: 'scraperLatestResultLimitMode',
          label: 'Calcul du quota de nouveautés',
          type: 'select',
          options: [
            { value: 'total', label: 'Total scrappers / par tag favori' },
            { value: 'perSource', label: 'Par source' },
          ],
        },
        {
          name: 'scraperLatestScraperResultLimit',
          label: 'Quota de nouveautés des scrappers',
          type: 'number',
          min: 1,
          step: 1,
        },
        {
          name: 'scraperLatestTagResultLimit',
          label: 'Quota de nouveautés par tag favori',
          type: 'number',
          min: 1,
          step: 1,
        },
        {
          name: 'scraperLatestAuthorsUseCache',
          label: 'Utiliser le cache pour les nouveautés auteurs',
          type: 'checkbox',
        },
        {
          name: 'scraperLatestAuthorCacheMaxAgeHours',
          label: 'Ancienneté maximale du cache des nouveautés auteurs (heures)',
          type: 'number',
          min: 1,
          max: 8760,
          step: 1,
          disabledWhen: {
            field: 'scraperLatestAuthorsUseCache',
            equals: false,
          },
        },
        {
          name: 'scraperLatestConcurrency',
          label: 'Scrapings simultanés (limite globale)',
          type: 'number',
          min: 1,
          step: 1,
        },
        {
          name: 'scraperLatestDeepPageLimit',
          label: 'Pages max par source du scan profond nouveautés',
          type: 'number',
          min: 1,
          step: 1,
        },
        {
          name: 'scraperLatestContinuousPageSafetyLimit',
          label: 'Pages max du scan sans quota nouveautés (garde-fou)',
          type: 'number',
          min: 1,
          step: 1,
        },
        {
          name: 'scraperLatestQuickConsecutiveSeenStopThreshold',
          label: 'Cards vues d\'affilée tolérées avant arrêt du scan rapide nouveautés',
          type: 'number',
          min: 0,
          step: 1,
        },
        {
          name: 'scraperLatestLanguageRejectLimit',
          label: 'Résultats refusés par langue avant arrêt du scraping (0 = désactivé)',
          type: 'number',
          min: 0,
          step: 1,
        },
        {
          name: 'scraperViewHistoryMaxRecords',
          label: 'Limite de l\'historique des cards vues (0 = infini)',
          type: 'number',
          min: 0,
          step: 1,
          placeholder: String(DEFAULT_SCRAPER_VIEW_HISTORY_MAX_RECORDS),
        },
        {
          name: 'scraperViewHistorySeenRetentionDays',
          label: 'Conservation des cards vues en jours (0 = infini)',
          type: 'number',
          min: 0,
          step: 1,
          placeholder: String(DEFAULT_SCRAPER_VIEW_HISTORY_SEEN_RETENTION_DAYS),
        },
        {
          name: 'scraperViewHistoryReadRetentionDays',
          label: 'Conservation des cards lues en jours (0 = infini)',
          type: 'number',
          min: 0,
          step: 1,
          placeholder: String(DEFAULT_SCRAPER_VIEW_HISTORY_READ_RETENTION_DAYS),
        },
      ],
    },
    {
      type: 'section',
      id: 'background-searches',
      title: 'Recherches en arrière-plan',
      description: 'Le cache mémoire est supprimé à la fermeture. Les fichiers temporaires survivent aux redémarrages jusqu’à expiration.',
      fields: [
        {
          name: 'backgroundSearchStorageMode',
          label: 'Stockage des résultats',
          type: 'select',
          options: [
            { value: 'memory', label: 'Cache mémoire' },
            { value: 'temporaryFile', label: 'Fichier temporaire' },
          ],
        },
        {
          name: 'backgroundSearchTemporaryRetentionHours',
          label: 'Conservation des fichiers temporaires (heures)',
          type: 'number',
          min: 1,
          max: 8760,
          step: 1,
          disabledWhen: {
            field: 'backgroundSearchStorageMode',
            notEquals: 'temporaryFile',
          },
        },
        {
          name: 'backgroundSearchMaxConcurrent',
          label: 'Recherches simultanées',
          type: 'number',
          min: 1,
          max: 8,
          step: 1,
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
      id: 'multi-search',
      title: 'Recherche multi-sources',
      fields: [
        {
          name: 'multiSearchEnableRomajiPhoneticMerge',
          label: 'Activer le merge phonétique romaji / katakana',
          type: 'checkbox',
        },
        {
          name: 'multiSearchScrapeDetailsWithCards',
          label: 'Scraper la fiche pendant la recherche multi-sources (POC lourd)',
          type: 'checkbox',
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

  const sourceSections = new Map(fields.flatMap((item) => (
    item.type === 'section' && item.id ? [[item.id, item] as const] : []
  )))
  const sourceScrapingFields = sourceSections.get('scraping')?.fields ?? []
  const selectScrapingFields = (names: string[]) => {
    const requestedNames = new Set(names)
    return sourceScrapingFields.filter((field) => requestedNames.has(field.name))
  }
  const scrapingFields: FormItem[] = [
    {
      type: 'section',
      id: 'scraping-runtime',
      title: 'Exécution et réseau',
      description: 'Ces limites sont communes aux recherches normales et en arrière-plan.',
      fields: selectScrapingFields([
        'scraperLatestConcurrency',
        'scraperScrapeDetailsWithCards',
      ]),
    },
    {
      type: 'section',
      id: 'scraping-navigation-cache',
      title: 'Navigation, affichage et caches',
      fields: selectScrapingFields([
        'showSavedScraperSearches',
        'scraperAuthorFavoriteCacheResults',
        'scraperHideBlacklistedTagCards',
        'scraperCardPotentialMatchesEnabled',
        'scraperAuthorCombinedView',
        'scraperTagCombinedView',
        'scraperTagFavoriteShowUnseenFirst',
        'scraperAuthorFavoritePageCount',
        'scraperLatestAuthorsUseCache',
        'scraperLatestAuthorCacheMaxAgeHours',
        'scraperViewHistoryMaxRecords',
        'scraperViewHistorySeenRetentionDays',
        'scraperViewHistoryReadRetentionDays',
      ]),
    },
    {
      type: 'section',
      id: 'scraping-latest',
      title: 'Nouveautés',
      fields: selectScrapingFields([
        'scraperLatestResultLimitMode',
        'scraperLatestScraperResultLimit',
        'scraperLatestTagResultLimit',
        'scraperLatestDeepPageLimit',
        'scraperLatestContinuousPageSafetyLimit',
        'scraperLatestQuickConsecutiveSeenStopThreshold',
        'scraperLatestLanguageRejectLimit',
      ]),
    },
    ...(sourceSections.get('background-searches') ? [sourceSections.get('background-searches')!] : []),
    ...(sourceSections.get('multi-search') ? [sourceSections.get('multi-search')!] : []),
    {
      type: 'section',
      id: 'correspondence-safety',
      title: 'Protections anti-emballement des correspondances',
      description: 'Les protections sont actives par défaut. L’interrupteur global permet de toutes les désactiver.',
      fields: [
        {
          name: 'mangaCorrespondenceSafetyEnabled',
          label: 'Activer les protections anti-emballement',
          type: 'checkbox',
        },
        {
          name: 'mangaCorrespondenceEmptyPageGuardEnabled',
          label: 'Arrêter une source qui enchaîne les pages sans piste plausible',
          type: 'checkbox',
        },
        {
          name: 'mangaCorrespondenceConsecutiveUnproductivePageLimit',
          label: 'Pages consécutives sans piste avant arrêt',
          type: 'number',
          min: 1,
          max: 20,
          step: 1,
          disabledWhen: { field: 'mangaCorrespondenceEmptyPageGuardEnabled', equals: false },
        },
        {
          name: 'mangaCorrespondenceUnboundedPageLimitEnabled',
          label: 'Limiter la profondeur du mode « maximum »',
          type: 'checkbox',
        },
        {
          name: 'mangaCorrespondenceUnboundedPageLimit',
          label: 'Pages maximum en profondeur « maximum »',
          type: 'number',
          min: 1,
          max: 250,
          step: 1,
          disabledWhen: { field: 'mangaCorrespondenceUnboundedPageLimitEnabled', equals: false },
        },
        {
          name: 'mangaCorrespondenceAuthorExpansionGuardEnabled',
          label: 'Suspendre l’expansion si trop d’auteurs différents apparaissent',
          type: 'checkbox',
        },
        {
          name: 'mangaCorrespondenceAbnormalAuthorLimit',
          label: 'Nombre d’auteurs différents considéré comme anormal',
          type: 'number',
          min: 2,
          max: 100,
          step: 1,
          disabledWhen: { field: 'mangaCorrespondenceAuthorExpansionGuardEnabled', equals: false },
        },
        {
          name: 'mangaCorrespondenceAutoInvalidateUnproductiveTitles',
          label: 'Invalider automatiquement un titre découvert qui ne produit que des rejets',
          type: 'checkbox',
        },
        {
          name: 'mangaCorrespondenceAutoInvalidateMinCandidateCount',
          label: 'Candidats inutiles minimum avant auto-invalidation',
          type: 'number',
          min: 1,
          max: 10000,
          step: 1,
          disabledWhen: { field: 'mangaCorrespondenceAutoInvalidateUnproductiveTitles', equals: false },
        },
        {
          name: 'mangaCorrespondenceTaskExpansionGuardEnabled',
          label: 'Limiter le nombre total de tâches de découverte',
          type: 'checkbox',
        },
        {
          name: 'mangaCorrespondenceMaxDiscoveryTaskCount',
          label: 'Tâches de découverte maximum',
          type: 'number',
          min: 5,
          max: 500,
          step: 1,
          disabledWhen: { field: 'mangaCorrespondenceTaskExpansionGuardEnabled', equals: false },
        },
        {
          name: 'mangaCorrespondenceRetainedPotentialGuardEnabled',
          label: 'Limiter les propositions conservées dans les checkpoints',
          type: 'checkbox',
        },
        {
          name: 'mangaCorrespondenceRetainedPotentialCount',
          label: 'Propositions les mieux classées à conserver',
          type: 'number',
          min: 10,
          max: 1000,
          step: 1,
          disabledWhen: { field: 'mangaCorrespondenceRetainedPotentialGuardEnabled', equals: false },
        },
        {
          name: 'backgroundSearchStallWarningEnabled',
          label: 'Alerter lorsqu’une recherche ne publie plus de progression',
          type: 'checkbox',
        },
        {
          name: 'backgroundSearchStallWarningMinutes',
          label: 'Minutes sans progression avant alerte',
          type: 'number',
          min: 1,
          max: 60,
          step: 1,
          disabledWhen: { field: 'backgroundSearchStallWarningEnabled', equals: false },
        },
      ],
    },
  ]
  const scrapingSectionIds = new Set(['scraping', 'background-searches', 'multi-search'])
  const optionFields = fields.filter((item) => (
    item.type !== 'section' || !item.id || !scrapingSectionIds.has(item.id)
  ))

  const developerFields: FormItem[] = [
    {
      type: 'section',
      id: 'search-performance-reports',
      title: 'Diagnostic des recherches scraper',
      description: 'Désactivé par défaut. Le réglage s’applique à tous les moteurs, au premier plan et en arrière-plan.',
      fields: [
        {
          name: 'scraperPerformanceReportsEnabled',
          label: 'Générer un rapport de performance pour toutes les recherches scraper',
          type: 'checkbox',
        },
      ],
    },
  ]

  const onOptionsSubmit = async (values: Record<string, any>) => {
    const persistMangaFilters = values.persistMangaFilters !== false
    const showSavedLibrarySearches = values.showSavedLibrarySearches !== false
    const stackMangaInSeries = values.stackMangaInSeries !== false
    const toSave: Record<string, any> = {
      libraryPath: values.libraryPath || '',
      showPageNumbers: !!values.showPageNumbers,
      showHiddens: !!values.showHiddens,
      titleLineCount: Number(values.titleLineCount) || 1,
      jpdbApiKey: values.jpdbApiKey || '',
      ocrPythonPath: values.ocrPythonPath || '',
      ocrRepoPath: values.ocrRepoPath || '',
      ocrForceCpu: !!values.ocrForceCpu,
      ocrAutoRunOnImport: !!values.ocrAutoRunOnImport,
      ocrAutoAssignJapaneseLanguage: values.ocrAutoAssignJapaneseLanguage !== false,
      persistMangaFilters,
      showSavedLibrarySearches,
      readingListKeepSourceTabs: !!values.readingListKeepSourceTabs,
      stackMangaInSeries,
      ...(persistMangaFilters ? {} : { mangaListFilters: null }),
    }
    await setParams(toSave, { remount: false })
  }

  const onScrapingSubmit = async (values: Record<string, any>) => {
    const showSavedScraperSearches = values.showSavedScraperSearches !== false
    const scraperLatestScraperResultLimit = Number(
      values.scraperLatestScraperResultLimit ?? values.scraperLatestResultLimit,
    )
    const scraperLatestTagResultLimit = Number(
      values.scraperLatestTagResultLimit ?? values.scraperLatestResultLimit,
    )
    const scraperLatestConcurrency = Number(values.scraperLatestConcurrency)
    const scraperLatestDeepPageLimit = Number(values.scraperLatestDeepPageLimit)
    const scraperLatestContinuousPageSafetyLimit = Number(values.scraperLatestContinuousPageSafetyLimit)
    const scraperLatestQuickConsecutiveSeenStopThreshold = Number(
      values.scraperLatestQuickConsecutiveSeenStopThreshold,
    )
    const scraperLatestLanguageRejectLimit = Number(values.scraperLatestLanguageRejectLimit)
    const scraperLatestAuthorCacheMaxAgeHours = Number(values.scraperLatestAuthorCacheMaxAgeHours)
    const scraperViewHistorySettings = normalizeScraperViewHistorySettings(values)
    const safetySettings = normalizeMangaCorrespondenceSafetyParams(values)

    const toSave: Record<string, any> = {
      showSavedScraperSearches,
      backgroundSearchStorageMode: values.backgroundSearchStorageMode === 'temporaryFile'
        ? 'temporaryFile'
        : 'memory',
      backgroundSearchTemporaryRetentionHours: Math.min(8760, Math.max(
        1,
        Math.floor(Number(values.backgroundSearchTemporaryRetentionHours) || 24),
      )),
      backgroundSearchMaxConcurrent: Math.min(8, Math.max(
        1,
        Math.floor(Number(values.backgroundSearchMaxConcurrent) || 3),
      )),
      multiSearchEnableRomajiPhoneticMerge: !!values.multiSearchEnableRomajiPhoneticMerge,
      multiSearchMergedTitleLanguagePriority: mergedTitleLanguagePriority,
      multiSearchScrapeDetailsWithCards: !!values.multiSearchScrapeDetailsWithCards,
      scraperAuthorCombinedView: !!values.scraperAuthorCombinedView,
      scraperTagCombinedView: !!values.scraperTagCombinedView,
      scraperAuthorFavoritePageCount: Number(values.scraperAuthorFavoritePageCount) || 1,
      scraperAuthorFavoriteCacheResults: !!values.scraperAuthorFavoriteCacheResults,
      scraperScrapeDetailsWithCards: !!values.scraperScrapeDetailsWithCards,
      scraperHideBlacklistedTagCards: !!values.scraperHideBlacklistedTagCards,
      scraperCardPotentialMatchesEnabled: values.scraperCardPotentialMatchesEnabled !== false,
      scraperTagFavoriteShowUnseenFirst: values.scraperTagFavoriteShowUnseenFirst !== false,
      scraperLatestResultLimit: Number.isFinite(scraperLatestScraperResultLimit)
        ? scraperLatestScraperResultLimit
        : 20,
      scraperLatestScraperResultLimit: Number.isFinite(scraperLatestScraperResultLimit)
        ? Math.max(1, Math.floor(scraperLatestScraperResultLimit))
        : 20,
      scraperLatestTagResultLimit: Number.isFinite(scraperLatestTagResultLimit)
        ? Math.max(1, Math.floor(scraperLatestTagResultLimit))
        : 20,
      scraperLatestResultLimitMode: values.scraperLatestResultLimitMode === 'perSource'
        ? 'perSource'
        : 'total',
      scraperLatestConcurrency: Number.isFinite(scraperLatestConcurrency)
        ? Math.max(1, Math.floor(scraperLatestConcurrency))
        : 2,
      scraperLatestDeepPageLimit: Number.isFinite(scraperLatestDeepPageLimit)
        ? Math.max(1, Math.floor(scraperLatestDeepPageLimit))
        : 50,
      scraperLatestContinuousPageSafetyLimit: Number.isFinite(scraperLatestContinuousPageSafetyLimit)
        ? Math.max(1, Math.floor(scraperLatestContinuousPageSafetyLimit))
        : 100,
      scraperLatestQuickConsecutiveSeenStopThreshold: Number.isFinite(scraperLatestQuickConsecutiveSeenStopThreshold)
        ? scraperLatestQuickConsecutiveSeenStopThreshold
        : 2,
      scraperLatestLanguageRejectLimit: Number.isFinite(scraperLatestLanguageRejectLimit)
        ? Math.max(0, Math.floor(scraperLatestLanguageRejectLimit))
        : 60,
      scraperLatestAuthorsUseCache: values.scraperLatestAuthorsUseCache !== false,
      scraperLatestAuthorCacheMaxAgeHours: Number.isFinite(scraperLatestAuthorCacheMaxAgeHours)
        ? Math.min(8760, Math.max(1, Math.floor(scraperLatestAuthorCacheMaxAgeHours)))
        : 24,
      ...scraperViewHistorySettings,
      ...safetySettings,
    }
    await setParams(toSave, { remount: false })
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

  const onDeveloperSubmit = React.useCallback(async (values: Record<string, any>) => {
    const performanceReportsEnabled = values.scraperPerformanceReportsEnabled === true
    await setParams({
      scraperPerformanceReportsEnabled: performanceReportsEnabled,
      scraperLatestPerformanceReportsEnabled: performanceReportsEnabled,
    }, { remount: false })
  }, [setParams])

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
          className={`settings-modal-tab ${activeTab === 'scraping' ? 'active' : ''}`}
          onClick={() => setActiveTab('scraping')}
        >
          Scraping
        </button>
        <button
          type="button"
          className={`settings-modal-tab ${activeTab === 'developer' ? 'active' : ''}`}
          onClick={() => setActiveTab('developer')}
        >
          Développeur
        </button>
        <button
          type="button"
          className={`settings-modal-tab ${activeTab === 'reader' ? 'active' : ''}`}
          onClick={() => setActiveTab('reader')}
        >
          Lecteur
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
          className={`settings-modal-tab ${activeTab === 'statistics' ? 'active' : ''}`}
          onClick={() => setActiveTab('statistics')}
        >
          Statistiques
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
              fields={optionFields}
              onSubmit={onOptionsSubmit}
              initialValues={params || {}}
              submitLabel="Enregistrer"
              formId="settings-form"
              submitButtonId={OPTIONS_SUBMIT_BUTTON_ID}
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

        {activeTab === 'scraping' ? (
          <div className="settings-modal-panel">
            <Form
              fields={scrapingFields}
              onSubmit={onScrapingSubmit}
              initialValues={params || {}}
              submitLabel="Enregistrer"
              formId="settings-scraping-form"
              submitButtonId={SCRAPING_SUBMIT_BUTTON_ID}
            />
            <MergedTitleLanguagePrioritySettings
              value={mergedTitleLanguagePriority}
              onChange={setMergedTitleLanguagePriority}
            />
          </div>
        ) : null}

        {activeTab === 'reader' ? (
          <div className="settings-modal-panel">
            <ReaderSettingsPanel submitButtonId={READER_SUBMIT_BUTTON_ID} />
          </div>
        ) : null}

        {activeTab === 'shortcuts' ? (
          <div className="settings-modal-panel">
            <ShortcutSettingsPanel />
          </div>
        ) : null}

        {activeTab === 'statistics' ? (
          <div className="settings-modal-panel">
            <StatisticsPanel />
          </div>
        ) : null}

        {activeTab === 'developer' ? (
          <div className="settings-modal-panel">
            <Form
              fields={developerFields}
              onSubmit={onDeveloperSubmit}
              initialValues={params || {}}
              submitLabel="Enregistrer"
              formId="settings-developer-form"
              submitButtonId={DEVELOPER_SUBMIT_BUTTON_ID}
            />
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
