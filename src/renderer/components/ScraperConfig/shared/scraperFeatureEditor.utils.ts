import {
  FetchScraperDocumentResult,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
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
