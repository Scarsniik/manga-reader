import {
  FetchScraperDocumentResult,
  buildScraperRegexFromInput,
  formatScraperFieldSelectorForDisplay,
  hasScraperFieldSelectorValue,
  normalizeScraperFieldSelector,
  ScraperFieldSelector,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
  ScraperLanguageDetectionConfig,
  ScraperLanguageValueMapping,
} from '@/shared/scraper';
import {
  extractSelectorValues,
  normalizeSelectorInput,
  parseSelectorExpression,
} from '@/renderer/utils/scraperRuntime';

export {
  extractSelectorValues,
  normalizeSelectorInput,
  parseSelectorExpression,
};

export const FEATURE_STATUS_META = {
  not_configured: { label: 'Non configure', className: 'is-not-configured' },
  configured: { label: 'Configure non valide', className: 'is-configured' },
  validated: { label: 'Valide', className: 'is-validated' },
} as const;

export const CHECK_LABELS: Record<ScraperFeatureValidationCheck['key'], string> = {
  title: 'Titre',
  cover: 'Couverture',
  description: 'Description',
  authors: 'Auteurs',
  authorUrl: 'Lien auteur',
  tags: 'Tags',
  status: 'Statut',
  pageCount: 'Nombre de pages',
  language: 'Langue',
  thumbnails: 'Vignettes',
  thumbnailsNextPage: 'Page suivante des vignettes',
  chapters: 'Chapitres',
  pages: 'Pages',
};

export const trimOptional = (value: unknown): string | undefined => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

export const trimOptionalSelector = (value: unknown): string | undefined => {
  const normalized = normalizeSelectorInput(String(value ?? ''));
  return normalized ? normalized : undefined;
};

export const normalizeRequiredFieldSelector = (value: unknown): ScraperFieldSelector => (
  normalizeScraperFieldSelector(value) ?? { kind: 'css', value: '' }
);

export const trimOptionalFieldSelector = (value: unknown): ScraperFieldSelector | undefined => (
  normalizeScraperFieldSelector(value)
);

export const normalizeLanguageValueMappings = (value: unknown): ScraperLanguageValueMapping[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const raw = item as Partial<ScraperLanguageValueMapping>;
      const mapping: ScraperLanguageValueMapping = {
        value: trimOptional(raw.value) ?? '',
        languageCode: trimOptional(raw.languageCode)?.toLowerCase() ?? '',
      };

      return mapping.value || mapping.languageCode ? mapping : null;
    })
    .filter((item): item is ScraperLanguageValueMapping => Boolean(item));
};

export const buildLanguageDetectionConfig = (
  value: Partial<ScraperLanguageDetectionConfig> | null | undefined,
): ScraperLanguageDetectionConfig => ({
  detectFromTitle: Boolean(value?.detectFromTitle),
  languageSelector: trimOptionalFieldSelector(value?.languageSelector),
  processedLanguageSelector: trimOptionalFieldSelector(value?.processedLanguageSelector),
  valueMappings: normalizeLanguageValueMappings(value?.valueMappings),
});

export const getLanguageDetectionFieldErrors = (
  config: ScraperLanguageDetectionConfig | undefined,
  prefix = 'languageDetection',
): Record<string, string> => {
  const errors: Record<string, string> = {};
  const languageSelectorError = getInvalidRegexFieldSelectorError(config?.languageSelector);
  const processedLanguageSelectorError = getInvalidRegexFieldSelectorError(config?.processedLanguageSelector);

  if (languageSelectorError) {
    errors[`${prefix}.languageSelector`] = languageSelectorError;
  }

  if (processedLanguageSelectorError) {
    errors[`${prefix}.processedLanguageSelector`] = processedLanguageSelectorError;
  }

  (config?.valueMappings ?? []).forEach((mapping, index) => {
    if (!mapping.value && mapping.languageCode) {
      errors[`${prefix}.valueMappings.${index}.value`] = 'La valeur detectee est requise.';
    }

    if (mapping.value && !mapping.languageCode) {
      errors[`${prefix}.valueMappings.${index}.languageCode`] = 'La langue est requise.';
    }
  });

  return errors;
};

export const getFieldSelectorDisplayValue = (value: unknown): string => (
  formatScraperFieldSelectorForDisplay(value as ScraperFieldSelector | string | null | undefined)
);

export const getInvalidRegexFieldSelectorError = (value: unknown): string | undefined => {
  const selector = normalizeScraperFieldSelector(value);
  if (!selector || selector.kind !== 'regex') {
    return undefined;
  }

  try {
    buildScraperRegexFromInput(selector.value);
  } catch {
    return 'Regex invalide.';
  }

  return undefined;
};

export {
  hasScraperFieldSelectorValue,
};

export const getConfigSignature = <TConfig,>(config: TConfig): string => JSON.stringify(config);

export const buildDocumentFailure = (
  result: FetchScraperDocumentResult,
): ScraperFeatureValidationResult => ({
  ok: false,
  checkedAt: result.checkedAt,
  requestedUrl: result.requestedUrl,
  finalUrl: result.finalUrl,
  status: result.status,
  contentType: result.contentType,
  failureCode: typeof result.status === 'number' ? 'http_error' : 'request_failed',
  checks: [],
  derivedValues: [],
});
