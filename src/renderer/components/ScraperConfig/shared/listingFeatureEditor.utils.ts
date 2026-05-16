import {
  ScraperCardListConfig,
  ScraperDetailsUrlStrategy,
  ScraperFeatureValidationCheckKey,
  ScraperFeatureValidationResult,
  ScraperFieldSelectorInput,
  ScraperLanguageDetectionConfig,
  ScraperSearchResultItem,
} from '@/shared/scraper';
import { ScraperRuntimeSearchPageResult } from '@/renderer/utils/scraperRuntime';
import { ScraperValidationPresentation } from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import { formatDisplayUrl } from '@/renderer/components/ScraperConfig/shared/validationDisplay';
import {
  getInvalidRegexFieldSelectorError,
  getLanguageDetectionFieldErrors,
  hasScraperFieldSelectorValue,
  normalizeRequiredFieldSelector,
  trimOptionalFieldSelector,
  trimOptionalSelector,
} from '@/renderer/components/ScraperConfig/shared/scraperFeatureEditor.utils';

export const LISTING_SCRAPING_FIELD_NAMES = [
  'resultListSelector',
  'resultItemSelector',
  'titleSelector',
  'detailUrlSelector',
  'authorUrlSelector',
  'thumbnailSelector',
  'summarySelector',
  'pageCountSelector',
  'nextPageSelector',
] as const;

export type ListingScrapingFieldName = typeof LISTING_SCRAPING_FIELD_NAMES[number];

export const LISTING_SCRAPING_FIELD_SELECTOR_NAMES = [
  'titleSelector',
  'detailUrlSelector',
  'authorUrlSelector',
  'thumbnailSelector',
  'summarySelector',
  'pageCountSelector',
  'nextPageSelector',
] as const;

export type ListingFeatureValidationConfig = ScraperCardListConfig & {
  urlStrategy: ScraperDetailsUrlStrategy;
  urlTemplate?: string;
  testUrl?: string;
  testValue?: string;
};

type ListingValidationCopy = Pick<ScraperCardListConfig, ListingScrapingFieldName>;

type ListingFieldErrorOptions = {
  listingLabel: string;
  fieldSelectorNames: readonly string[];
};

type ListingValidationPresentationOptions = {
  listingLabel: string;
  listingNameCheckKey: ScraperFeatureValidationCheckKey;
  listingNameDetailsLabel: string;
};

export const buildListingScrapingFields = (
  values: Partial<ScraperCardListConfig>,
): ListingValidationCopy => ({
  resultListSelector: trimOptionalSelector(values.resultListSelector),
  resultItemSelector: trimOptionalSelector(values.resultItemSelector) ?? '',
  titleSelector: normalizeRequiredFieldSelector(values.titleSelector),
  detailUrlSelector: trimOptionalFieldSelector(values.detailUrlSelector),
  authorUrlSelector: trimOptionalFieldSelector(values.authorUrlSelector),
  thumbnailSelector: trimOptionalFieldSelector(values.thumbnailSelector),
  summarySelector: trimOptionalFieldSelector(values.summarySelector),
  pageCountSelector: trimOptionalFieldSelector(values.pageCountSelector),
  nextPageSelector: trimOptionalFieldSelector(values.nextPageSelector),
});

export const getListingSaveFieldErrors = (
  config: ListingFeatureValidationConfig,
  options: ListingFieldErrorOptions,
): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (config.urlStrategy === 'template' && !config.urlTemplate) {
    errors.urlTemplate = `Le template d'URL ${options.listingLabel} est requis pour ce mode.`;
  }

  if (!config.resultItemSelector) {
    errors.resultItemSelector = 'Le bloc resultat est requis.';
  }

  if (!hasScraperFieldSelectorValue(config.titleSelector)) {
    errors.titleSelector = 'Le selecteur du titre est requis.';
  }

  const selectableConfig = config as unknown as Record<string, ScraperFieldSelectorInput>;
  options.fieldSelectorNames.forEach((fieldName) => {
    const error = getInvalidRegexFieldSelectorError(selectableConfig[fieldName]);
    if (error) {
      errors[fieldName] = error;
    }
  });

  Object.assign(errors, getLanguageDetectionFieldErrors(
    config.languageDetection as ScraperLanguageDetectionConfig,
  ));

  return errors;
};

export const getListingValidationFieldErrors = (
  config: ListingFeatureValidationConfig,
  options: ListingFieldErrorOptions,
): Record<string, string> => {
  const errors = getListingSaveFieldErrors(config, options);
  const requiresTemplateValue = typeof config.urlTemplate === 'string'
    && /{{\s*(?:rawValue|rawQuery|value|query)\s*}}/.test(config.urlTemplate);

  if (config.urlStrategy === 'result_url' && !config.testUrl) {
    errors.testUrl = 'Une URL ou un chemin de test est requis pour valider.';
  }

  if (config.urlStrategy === 'template' && requiresTemplateValue && !config.testValue) {
    errors.testValue = `Une valeur ${options.listingLabel} de test est requise pour valider.`;
  }

  return errors;
};

export const buildListingValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
  previewResults: ScraperSearchResultItem[],
  previewPage: ScraperRuntimeSearchPageResult | null,
  options: ListingValidationPresentationOptions,
): ScraperValidationPresentation => {
  const details: string[] = [];
  const warnings: string[] = [];
  const titleCheck = validationResult.checks.find((check) => check.key === 'title');
  const coverCheck = validationResult.checks.find((check) => check.key === 'cover');
  const summaryCheck = validationResult.checks.find((check) => check.key === 'description');
  const listingNameCheck = validationResult.checks.find((check) => check.key === options.listingNameCheckKey);
  const authorUrlCheck = validationResult.checks.find((check) => check.key === 'authorUrl');
  const pageCountCheck = validationResult.checks.find((check) => check.key === 'pageCount');
  const languageCheck = validationResult.checks.find((check) => check.key === 'language');

  if (validationResult.requestedUrl) {
    details.push(`URL demandee : ${formatDisplayUrl(validationResult.requestedUrl)}`);
  }

  if (validationResult.finalUrl && validationResult.finalUrl !== validationResult.requestedUrl) {
    details.push(`URL finale : ${formatDisplayUrl(validationResult.finalUrl)}`);
  }

  if (typeof validationResult.status === 'number') {
    details.push(`Code HTTP : ${validationResult.status}`);
  }

  if (validationResult.contentType) {
    details.push(`Content-Type : ${validationResult.contentType}`);
    if (!validationResult.contentType.toLowerCase().includes('html')) {
      warnings.push('Le type de contenu ne ressemble pas a une page HTML.');
    }
  }

  if (titleCheck?.matchedCount) {
    details.push(`Cards extraites : ${titleCheck.matchedCount}`);
  }

  if (previewResults[0]?.detailUrl) {
    details.push(`Premier lien fiche detecte : ${formatDisplayUrl(previewResults[0].detailUrl)}`);
  }

  if (listingNameCheck?.matchedCount) {
    details.push(`${options.listingNameDetailsLabel} : ${listingNameCheck.samples?.join(', ') || listingNameCheck.sample}`);
  }

  if (authorUrlCheck?.matchedCount) {
    details.push(`Liens auteur detectes : ${authorUrlCheck.matchedCount}`);
  }

  if (coverCheck?.matchedCount) {
    details.push(`Miniatures detectees : ${coverCheck.matchedCount}`);
  }

  if (summaryCheck?.matchedCount) {
    details.push(`Resumes detectes : ${summaryCheck.matchedCount}`);
  }

  if (pageCountCheck?.matchedCount) {
    details.push(`Nombre de pages detecte(s) : ${pageCountCheck.matchedCount}`);
  }

  if (languageCheck?.matchedCount) {
    details.push(`Langues detectees : ${languageCheck.samples?.join(', ') || languageCheck.sample}`);
  }

  if (previewPage?.nextPageUrl) {
    details.push(`Page suivante detectee : ${formatDisplayUrl(previewPage.nextPageUrl)}`);
  }

  return {
    summary: validationResult.ok
      ? `La page ${options.listingLabel} de test renvoie une liste de cards exploitable.`
      : validationResult.failureCode === 'http_error'
        ? typeof validationResult.status === 'number'
          ? `La page ${options.listingLabel} a repondu avec le code HTTP ${validationResult.status}.`
          : `La page ${options.listingLabel} a repondu avec une erreur HTTP.`
        : validationResult.failureCode === 'request_failed'
          ? `Impossible de recuperer la page ${options.listingLabel}.`
          : titleCheck?.issueCode === 'no_match'
            ? 'Aucune card exploitable n\'a ete trouvee avec la configuration actuelle.'
            : `La validation de la page ${options.listingLabel} a echoue.`,
    details,
    warning: warnings.length ? warnings.join(' ') : undefined,
  };
};
