import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Form from '@/renderer/components/utils/Form/Form';
import { Field } from '@/renderer/components/utils/Form/types';
import { languages } from '@/renderer/consts/languages';
import FreeStringListField from '@/renderer/components/ScraperConfig/shared/FreeStringListField';
import {
  ScraperBookmarkMetadataField,
  ScraperGlobalConfig,
  ScraperLatestModule,
  ScraperRecord,
} from '@/shared/scraper';
import { useScraperConfig } from '@/renderer/components/ScraperConfig/shared/ScraperConfigContext';

declare global {
  interface Window {
    api: any;
  }
}

type Props = {
  onBack: () => void;
};

const sanitizeTagIds = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value
        .map((entry) => String(entry ?? '').trim())
        .filter((entry) => entry.length > 0),
    ))
    : []
);

const sanitizeStringList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value
        .map((entry) => String(entry ?? '').trim().replace(/\s+/g, ' '))
        .filter((entry) => entry.length > 0),
    ))
    : []
);

const sanitizeNonNegativeInteger = (value: unknown): number => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.max(0, Math.floor(parsedValue)) : 0;
};

const BOOKMARK_FIELD_OPTIONS: Array<{
  label: string;
  value: ScraperBookmarkMetadataField;
}> = [
  { label: 'Couverture', value: 'cover' },
  { label: 'Resume', value: 'summary' },
  { label: 'Description', value: 'description' },
  { label: 'Auteurs', value: 'authors' },
  { label: 'Tags', value: 'tags' },
  { label: 'Statut', value: 'mangaStatus' },
  { label: 'Nombre de pages', value: 'pageCount' },
  { label: 'Langues', value: 'languageCodes' },
];

const BOOKMARK_FIELD_LABELS = new Map(
  BOOKMARK_FIELD_OPTIONS.map((option) => [option.value, option.label]),
);

const sanitizeBookmarkExcludedFields = (value: unknown): ScraperBookmarkMetadataField[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value.filter((entry): entry is ScraperBookmarkMetadataField => (
        BOOKMARK_FIELD_LABELS.has(String(entry ?? '').trim() as ScraperBookmarkMetadataField)
      )),
    ))
    : []
);

const sanitizeLatestModule = (
  value: unknown,
  latestModules: ScraperLatestModule[],
): ScraperLatestModule => {
  const requestedModule = String(value ?? '').trim();
  if (latestModules.includes(requestedModule as ScraperLatestModule)) {
    return requestedModule as ScraperLatestModule;
  }

  return latestModules[0] ?? 'homepage';
};

const buildGlobalConfig = (
  values: Record<string, unknown>,
  metadata: {
    sourceLanguages: string[];
    contentTypes: string[];
    latestModules: ScraperLatestModule[];
  },
): ScraperGlobalConfig => {
  const latestModule = sanitizeLatestModule(values.latestModule, metadata.latestModules);

  return {
    defaultTagIds: sanitizeTagIds(values.defaultTagIds),
    defaultLanguage: String(values.defaultLanguage ?? '').trim().toLowerCase() || undefined,
    sourceLanguages: sanitizeStringList(metadata.sourceLanguages).map((language) => language.toLowerCase()),
    contentTypes: sanitizeStringList(metadata.contentTypes),
    homeSearch: {
      enabled: Boolean(values.homeSearchEnabled),
      query: String(values.homeSearchQuery ?? '').trim(),
    },
    latest: {
      enabled: Boolean(values.latestEnabled) && metadata.latestModules.length > 0,
      module: latestModule,
    },
    bookmark: {
      excludedFields: sanitizeBookmarkExcludedFields(values.bookmarkExcludedFields),
    },
    chapterDownloads: {
      autoAssignSeries: Boolean(values.chapterDownloadsAutoAssignSeries),
    },
    requestLimits: {
      minDelayMs: sanitizeNonNegativeInteger(values.requestMinDelayMs),
      maxConcurrentRequests: sanitizeNonNegativeInteger(values.requestMaxConcurrentRequests),
    },
  };
};

export default function ScraperGlobalSettingsEditor({
  onBack,
}: Props) {
  const { scraper, updateScraper } = useScraperConfig();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sourceLanguages, setSourceLanguages] = useState<string[]>(() => scraper.globalConfig.sourceLanguages ?? []);
  const [contentTypes, setContentTypes] = useState<string[]>(() => scraper.globalConfig.contentTypes ?? []);
  const hasSearch = useMemo(
    () => scraper.features.some((feature) => feature.kind === 'search' && feature.status !== 'not_configured'),
    [scraper.features],
  );
  const hasHomepage = useMemo(
    () => scraper.features.some((feature) => feature.kind === 'homepage' && feature.status !== 'not_configured'),
    [scraper.features],
  );
  const latestModuleOptions = useMemo(() => {
    const options: Array<{ label: string; value: ScraperLatestModule }> = [];

    if (hasHomepage) {
      options.push({ label: 'Homepage', value: 'homepage' });
    }

    if (hasSearch) {
      options.push({ label: 'Recherche', value: 'search' });
    }

    return options;
  }, [hasHomepage, hasSearch]);
  const languageOptions = useMemo(() => (
    languages.map((language) => ({
      label: language.frenchName,
      value: language.code,
    }))
  ), []);
  const fields = useMemo<Field[]>(() => ([
    {
      name: 'defaultTagIds',
      label: 'Tags par defaut',
      type: 'tagsPicker',
      placeholder: 'Ajouter des tags automatiquement a chaque telechargement',
    },
    {
      name: 'defaultLanguage',
      label: 'Langue par defaut',
      type: 'select',
      options: languages.map((language) => ({
        label: language.frenchName,
        value: language.code,
      })),
    },
    {
      name: 'bookmarkExcludedFields',
      label: 'Informations a ne pas enregistrer dans les bookmarks',
      type: 'entityPicker',
      options: BOOKMARK_FIELD_OPTIONS,
      placeholder: 'Selectionner les metadonnees a exclure des bookmarks',
    },
    {
      name: 'chapterDownloadsAutoAssignSeries',
      label: 'Associer automatiquement les telechargements de chapitre a une serie',
      type: 'checkbox',
    },
    {
      name: 'requestMinDelayMs',
      label: 'Delai minimum entre les requetes (ms)',
      type: 'number',
      min: 0,
      step: 100,
    },
    {
      name: 'requestMaxConcurrentRequests',
      label: 'Nombre maximum de requetes simultanees',
      type: 'number',
      min: 0,
      step: 1,
    },
    {
      name: 'homeSearchEnabled',
      label: 'Jouer une recherche automatique a l\'ouverture',
      type: 'checkbox',
    },
    {
      name: 'homeSearchQuery',
      label: 'Recherche d\'accueil',
      type: 'text',
      placeholder: 'Optionnel. Laisse vide pour lancer une recherche globale.',
    },
    {
      name: 'latestEnabled',
      label: 'Utiliser ce scrapper dans les nouveautes',
      type: 'checkbox',
      disabled: latestModuleOptions.length === 0,
    },
    {
      name: 'latestModule',
      label: 'Module des nouveautes',
      type: 'select',
      options: latestModuleOptions,
      disabled: latestModuleOptions.length === 0,
      disabledWhen: {
        field: 'latestEnabled',
        equals: false,
      },
    },
  ]), [latestModuleOptions]);

  const initialValues = useMemo(() => ({
    defaultTagIds: scraper.globalConfig.defaultTagIds,
    defaultLanguage: scraper.globalConfig.defaultLanguage ?? '',
    bookmarkExcludedFields: scraper.globalConfig.bookmark.excludedFields,
    chapterDownloadsAutoAssignSeries: scraper.globalConfig.chapterDownloads.autoAssignSeries,
    requestMinDelayMs: scraper.globalConfig.requestLimits.minDelayMs,
    requestMaxConcurrentRequests: scraper.globalConfig.requestLimits.maxConcurrentRequests,
    homeSearchEnabled: scraper.globalConfig.homeSearch.enabled,
    homeSearchQuery: scraper.globalConfig.homeSearch.query,
    latestEnabled: scraper.globalConfig.latest?.enabled ?? false,
    latestModule: sanitizeLatestModule(
      scraper.globalConfig.latest?.module,
      latestModuleOptions.map((option) => option.value),
    ),
  }), [latestModuleOptions, scraper.globalConfig]);

  useEffect(() => {
    setSourceLanguages(scraper.globalConfig.sourceLanguages ?? []);
    setContentTypes(scraper.globalConfig.contentTypes ?? []);
  }, [scraper.id, scraper.globalConfig.contentTypes, scraper.globalConfig.sourceLanguages]);

  const languageLabel = useMemo(() => {
    const code = scraper.globalConfig.defaultLanguage;
    if (!code) {
      return 'Aucune langue appliquee automatiquement';
    }

    return languages.find((language) => language.code === code)?.frenchName || code;
  }, [scraper.globalConfig.defaultLanguage]);

  const sourceLanguagesLabel = useMemo(() => {
    const configuredLanguages = scraper.globalConfig.sourceLanguages ?? [];
    if (!configuredLanguages.length) {
      return 'Aucune langue de source renseignee';
    }

    return configuredLanguages
      .map((code) => languages.find((language) => language.code === code)?.frenchName || code)
      .join(', ');
  }, [scraper.globalConfig.sourceLanguages]);

  const contentTypesLabel = useMemo(() => {
    const configuredTypes = scraper.globalConfig.contentTypes ?? [];
    return configuredTypes.length
      ? configuredTypes.join(', ')
      : 'Aucun type de contenu renseigne';
  }, [scraper.globalConfig.contentTypes]);

  const homeSearchLabel = useMemo(() => {
    if (!scraper.globalConfig.homeSearch.enabled) {
      return 'Aucune recherche d\'accueil automatique';
    }

    return scraper.globalConfig.homeSearch.query
      ? `Recherche lancee avec "${scraper.globalConfig.homeSearch.query}"`
      : 'Recherche globale lancee sans terme pre-rempli';
  }, [scraper.globalConfig.homeSearch.enabled, scraper.globalConfig.homeSearch.query]);

  const latestLabel = useMemo(() => {
    if (!scraper.globalConfig.latest?.enabled) {
      return 'Ce scrapper n\'est pas utilise dans les nouveautes';
    }

    if (scraper.globalConfig.latest.module === 'search') {
      return scraper.globalConfig.homeSearch.query
        ? `Recherche lancee avec "${scraper.globalConfig.homeSearch.query}"`
        : 'Recherche lancee sans terme pre-rempli';
    }

    return 'Homepage utilisee pour les nouveautes';
  }, [
    scraper.globalConfig.homeSearch.query,
    scraper.globalConfig.latest?.enabled,
    scraper.globalConfig.latest?.module,
  ]);

  const bookmarkLabel = useMemo(() => {
    const excludedFields = scraper.globalConfig.bookmark.excludedFields;
    if (!excludedFields.length) {
      return 'Toutes les metadonnees de bookmark sont conservees';
    }

    const labels = excludedFields
      .map((field) => BOOKMARK_FIELD_LABELS.get(field) || field);

    if (labels.length <= 3) {
      return labels.join(', ');
    }

    return `${labels.length} informations exclues (${labels.slice(0, 3).join(', ')}, ...)`;
  }, [scraper.globalConfig.bookmark.excludedFields]);

  const chapterDownloadsLabel = useMemo(() => (
    scraper.globalConfig.chapterDownloads.autoAssignSeries
      ? 'Les telechargements lances depuis un chapitre creeront ou reutiliseront une serie avec le titre de la fiche'
      : 'Les telechargements de chapitre restent des mangas independants'
  ), [scraper.globalConfig.chapterDownloads.autoAssignSeries]);

  const requestLimitsLabel = useMemo(() => {
    const { minDelayMs, maxConcurrentRequests } = scraper.globalConfig.requestLimits;
    if (minDelayMs === 0 && maxConcurrentRequests === 0) {
      return 'Aucune limite supplementaire';
    }

    const delayLabel = minDelayMs > 0
      ? `${minDelayMs} ms minimum entre les requetes`
      : 'aucun delai minimum';
    const concurrencyLabel = maxConcurrentRequests > 0
      ? `${maxConcurrentRequests} requete(s) simultanee(s) maximum`
      : 'nombre de requetes simultanees non limite';

    return `${delayLabel}, ${concurrencyLabel}`;
  }, [scraper.globalConfig.requestLimits]);

  const handleSubmit = useCallback(async (values: Record<string, unknown>) => {
    if (!window.api || typeof window.api.saveScraperGlobalConfig !== 'function') {
      setSaveError('Les reglages globaux du scrapper ne sont pas disponibles dans cette version.');
      return;
    }

    setSaveError(null);

    try {
      const updatedScraper = await window.api.saveScraperGlobalConfig({
        scraperId: scraper.id,
        globalConfig: buildGlobalConfig(values, {
          sourceLanguages,
          contentTypes,
          latestModules: latestModuleOptions.map((option) => option.value),
        }),
      });

      updateScraper(updatedScraper as ScraperRecord);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Impossible d\'enregistrer les reglages globaux.');
    }
  }, [contentTypes, latestModuleOptions, scraper.id, sourceLanguages, updateScraper]);

  return (
    <section className="scraper-config-step">
      <div className="scraper-feature-editor__topbar">
        <button type="button" className="secondary" onClick={onBack}>
          Retour aux composants
        </button>
      </div>

      <div className="scraper-config-step__intro">
        <h3>Reglages globaux du scrapper</h3>
        <p>
          Ces options s&apos;appliquent a tout le scrapper: metadonnees par defaut sur les mangas
          telecharges et recherche d&apos;accueil a l&apos;ouverture quand rien n&apos;est a restaurer.
        </p>
      </div>

      <div className="scraper-config-note">
        <strong>Telechargement</strong>
        <span>
          Les tags et la langue definis ici seront ajoutes automatiquement aux nouveaux mangas
          importes depuis ce scrapper.
        </span>
      </div>

      <div className="scraper-config-note">
        <strong>Recherche multi-sources</strong>
        <span>
          Les langues de source servent a filtrer les scrappers dans la recherche multi-sources.
          Quand une seule langue est configuree, elle sert aussi de langue par defaut pour les
          bookmarks de ce scrapper. Les types de contenu restent dedies a la recherche multi-sources.
        </span>
      </div>

      <div className="scraper-config-note">
        <strong>Series et chapitres</strong>
        <span>
          Active cette option pour que les telechargements lances depuis un chapitre soient
          automatiquement rattaches a une serie creee avec le titre de la fiche, puis ranges avec
          leur numero de chapitre.
        </span>
      </div>

      <div className="scraper-config-note">
        <strong>Bookmark</strong>
        <span>
          Choisis ici les metadonnees qui ne doivent pas etre conservees dans les bookmarks de ce
          scrapper. Si tu exclus par exemple le resume ou les tags, ces informations ne seront plus
          enregistrees dans la carte bookmark.
        </span>
      </div>

      <div className="scraper-config-section">
        <div className="scraper-config-section__header">
          <h4>Metadonnees de recherche multi-sources</h4>
          <p>
            Renseigne ici les informations qui permettent de selectionner ce scrapper depuis la
            recherche multi-sources.
          </p>
        </div>

        <FreeStringListField
          id="scraper-source-languages"
          label="Langues du scrapper"
          value={sourceLanguages}
          options={languageOptions}
          placeholder="Ajouter une langue"
          onChange={setSourceLanguages}
        />

        <FreeStringListField
          id="scraper-content-types"
          label="Types de contenu"
          value={contentTypes}
          placeholder="manga, comics, doujinshi..."
          onChange={setContentTypes}
        />
      </div>

      <div className="scraper-config-note">
        <strong>Vitesse de scraping</strong>
        <span>
          Le delai espace le depart des requetes et la limite simultanee borne leur parallelisme pour
          ce scrapper. Une valeur de 0 desactive la limite correspondante.
        </span>
      </div>

      <div className="scraper-config-note">
        <strong>Recherche d&apos;accueil</strong>
        <span>
          Ce reglage lance le module `Recherche` a l&apos;arrivee sur le scrapper. Si le module
          `Homepage` est configure, il sert d&apos;accueil prioritaire.
        </span>
      </div>

      {!hasSearch ? (
        <div className="scraper-validation-result__message is-warning">
          Le composant `Recherche` n&apos;est pas encore configure. La recherche d&apos;accueil sera
          enregistree maintenant, puis jouee automatiquement une fois la recherche disponible.
        </div>
      ) : null}

      <div className="scraper-config-note">
        <strong>Nouveautes</strong>
        <span>
          Active ce scrapper pour le mode nouveautes, puis choisis si les resultats viennent du
          module `Homepage` ou du module `Recherche`. En mode recherche, la recherche d&apos;accueil
          ci-dessus sert de requete par defaut.
        </span>
      </div>

      {latestModuleOptions.length === 0 ? (
        <div className="scraper-validation-result__message is-warning">
          Configure d&apos;abord le composant `Homepage` ou `Recherche` pour utiliser ce scrapper dans
          les nouveautes.
        </div>
      ) : null}

      <Form
        fields={fields}
        initialValues={initialValues}
        onSubmit={handleSubmit}
        submitLabel="Enregistrer les reglages globaux"
        globalError={saveError ?? undefined}
      />

      <div className="scraper-config-summary">
        <div className="scraper-config-summary__row">
          <span>Tags par defaut</span>
          <strong>
            {scraper.globalConfig.defaultTagIds.length
              ? `${scraper.globalConfig.defaultTagIds.length} tag(s) configure(s)`
              : 'Aucun tag automatique'}
          </strong>
        </div>
        <div className="scraper-config-summary__row">
          <span>Langue par defaut</span>
          <strong>{languageLabel}</strong>
        </div>
        <div className="scraper-config-summary__row scraper-config-summary__row--block">
          <span>Langues du scrapper</span>
          <strong>{sourceLanguagesLabel}</strong>
        </div>
        <div className="scraper-config-summary__row scraper-config-summary__row--block">
          <span>Types de contenu</span>
          <strong>{contentTypesLabel}</strong>
        </div>
        <div className="scraper-config-summary__row scraper-config-summary__row--block">
          <span>Bookmark</span>
          <strong>{bookmarkLabel}</strong>
        </div>
        <div className="scraper-config-summary__row scraper-config-summary__row--block">
          <span>Series et chapitres</span>
          <strong>{chapterDownloadsLabel}</strong>
        </div>
        <div className="scraper-config-summary__row scraper-config-summary__row--block">
          <span>Vitesse de scraping</span>
          <strong>{requestLimitsLabel}</strong>
        </div>
        <div className="scraper-config-summary__row scraper-config-summary__row--block">
          <span>Recherche d&apos;accueil</span>
          <strong>{homeSearchLabel}</strong>
        </div>
        <div className="scraper-config-summary__row scraper-config-summary__row--block">
          <span>Nouveautes</span>
          <strong>{latestLabel}</strong>
        </div>
      </div>
    </section>
  );
}
