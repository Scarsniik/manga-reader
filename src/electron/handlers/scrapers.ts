import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { IpcMainInvokeEvent } from 'electron';
import {
  FetchScraperDocumentRequest,
  FetchScraperDocumentResult,
  ScraperAccessValidationRequest,
  ScraperAccessValidationResult,
  ScraperDetailsDerivedValueResult,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
  ScraperRecord,
  SaveScraperDraftRequest,
  SaveScraperFeatureRequest,
  createDefaultScraperFeatures,
  normalizeScraperBaseUrl,
  resolveScraperUrl,
} from '../scraper';
import { ensureDataDir, scrapersFilePath } from '../utils';

const DEFAULT_SCRAPER_VALIDATION_TIMEOUT_MS = 10000;

const sanitizeAccessValidation = (
  validation: Partial<ScraperAccessValidationResult> | null | undefined,
): ScraperAccessValidationResult | null => {
  if (!validation) {
    return null;
  }

  return {
    ok: Boolean(validation.ok),
    kind: validation.kind === 'api' ? 'api' : 'site',
    normalizedUrl: String(validation.normalizedUrl ?? ''),
    checkedAt: String(validation.checkedAt ?? ''),
    status: typeof validation.status === 'number' ? validation.status : undefined,
    finalUrl: typeof validation.finalUrl === 'string' ? validation.finalUrl : undefined,
    contentType: typeof validation.contentType === 'string' ? validation.contentType : undefined,
  };
};

const sanitizeFeatureValidationCheck = (
  check: Partial<ScraperFeatureValidationCheck>,
): ScraperFeatureValidationCheck | null => {
  const allowedKeys = ['title', 'cover', 'description', 'authors', 'tags', 'status', 'pages'];
  if (!allowedKeys.includes(String(check.key))) {
    return null;
  }

  return {
    key: check.key as ScraperFeatureValidationCheck['key'],
    selector: String(check.selector ?? ''),
    required: Boolean(check.required),
    matchedCount: typeof check.matchedCount === 'number' ? check.matchedCount : 0,
    sample: typeof check.sample === 'string' ? check.sample : undefined,
    samples: Array.isArray(check.samples)
      ? check.samples.filter((value): value is string => typeof value === 'string')
      : undefined,
    issueCode: check.issueCode === 'invalid_selector' || check.issueCode === 'no_match'
      ? check.issueCode
      : undefined,
  };
};

const sanitizeDerivedValueResult = (
  derivedValue: Partial<ScraperDetailsDerivedValueResult>,
): ScraperDetailsDerivedValueResult | null => {
  const allowedSourceTypes = ['requested_url', 'final_url', 'field', 'selector'];
  const allowedFieldKeys = ['title', 'cover', 'description', 'authors', 'tags', 'status'];
  const allowedIssueCodes = ['missing_source', 'invalid_selector', 'invalid_pattern', 'no_match'];

  const key = String(derivedValue.key ?? '').trim();
  if (!key) {
    return null;
  }

  return {
    key,
    sourceType: allowedSourceTypes.includes(String(derivedValue.sourceType))
      ? derivedValue.sourceType as ScraperDetailsDerivedValueResult['sourceType']
      : 'field',
    sourceField: allowedFieldKeys.includes(String(derivedValue.sourceField))
      ? derivedValue.sourceField as ScraperDetailsDerivedValueResult['sourceField']
      : undefined,
    selector: typeof derivedValue.selector === 'string' ? derivedValue.selector : undefined,
    pattern: typeof derivedValue.pattern === 'string' ? derivedValue.pattern : undefined,
    sourceSample: typeof derivedValue.sourceSample === 'string' ? derivedValue.sourceSample : undefined,
    value: typeof derivedValue.value === 'string' ? derivedValue.value : undefined,
    issueCode: allowedIssueCodes.includes(String(derivedValue.issueCode))
      ? derivedValue.issueCode as ScraperDetailsDerivedValueResult['issueCode']
      : undefined,
  };
};

const sanitizeFeatureValidation = (
  validation: Partial<ScraperFeatureValidationResult> | null | undefined,
): ScraperFeatureValidationResult | null => {
  if (!validation) {
    return null;
  }

  const checks = Array.isArray(validation.checks)
    ? validation.checks
      .map((check) => sanitizeFeatureValidationCheck(check))
      .filter((check): check is ScraperFeatureValidationCheck => Boolean(check))
    : [];
  const derivedValues = Array.isArray(validation.derivedValues)
    ? validation.derivedValues
      .map((derivedValue) => sanitizeDerivedValueResult(derivedValue))
      .filter((derivedValue): derivedValue is ScraperDetailsDerivedValueResult => Boolean(derivedValue))
    : [];

  return {
    ok: Boolean(validation.ok),
    checkedAt: String(validation.checkedAt ?? ''),
    requestedUrl: typeof validation.requestedUrl === 'string' ? validation.requestedUrl : undefined,
    finalUrl: typeof validation.finalUrl === 'string' ? validation.finalUrl : undefined,
    status: typeof validation.status === 'number' ? validation.status : undefined,
    contentType: typeof validation.contentType === 'string' ? validation.contentType : undefined,
    failureCode: validation.failureCode === 'http_error' || validation.failureCode === 'request_failed'
      ? validation.failureCode
      : undefined,
    checks,
    derivedValues,
  };
};

const toPersistedScraperRecord = (scraper: ScraperRecord) => ({
  id: scraper.id,
  kind: scraper.kind,
  name: scraper.name,
  baseUrl: scraper.baseUrl,
  description: scraper.description ?? '',
  status: scraper.status,
  createdAt: scraper.createdAt,
  updatedAt: scraper.updatedAt,
  validation: sanitizeAccessValidation(scraper.validation),
  features: scraper.features.map((feature) => ({
    kind: feature.kind,
    status: feature.status,
    config: feature.config ?? null,
    validation: sanitizeFeatureValidation(feature.validation),
  })),
});

const hydrateScraperFeatures = (
  features: Partial<ScraperFeatureDefinition>[] | undefined,
): ScraperFeatureDefinition[] => {
  const defaults = createDefaultScraperFeatures();

  return defaults.map((feature) => {
    const existing = features?.find((candidate) => {
      const candidateKind = String(candidate.kind) === 'images' ? 'pages' : candidate.kind;
      return candidateKind === feature.kind;
    });

    return {
      ...feature,
      ...existing,
      kind: feature.kind,
      status: existing?.status ?? feature.status,
      config: existing?.config ?? null,
      validation: sanitizeFeatureValidation(existing?.validation) ?? null,
    };
  });
};

async function readScrapersFile(): Promise<ScraperRecord[]> {
  try {
    const data = await fs.readFile(scrapersFilePath, 'utf-8');
    const parsed = JSON.parse(data) as ScraperRecord[];
    const hydrated = parsed.map((scraper) => ({
      ...scraper,
      validation: sanitizeAccessValidation(scraper.validation),
      features: hydrateScraperFeatures(scraper.features),
    }));

    const normalizedRaw = JSON.stringify(parsed, null, 2);
    const normalizedSanitized = JSON.stringify(hydrated.map((scraper) => toPersistedScraperRecord(scraper)), null, 2);

    if (normalizedRaw !== normalizedSanitized) {
      await ensureDataDir();
      await fs.writeFile(scrapersFilePath, normalizedSanitized);
    }

    return hydrated;
  } catch (error: any) {
    if (error && error.code === 'ENOENT') {
      await ensureDataDir();
      await fs.writeFile(scrapersFilePath, JSON.stringify([], null, 2));
      return [];
    }
    console.error('Error reading scrapers file:', error);
    throw new Error('Failed to read scrapers');
  }
}

async function writeScrapersFile(scrapers: ScraperRecord[]): Promise<void> {
  await ensureDataDir();
  const persisted = scrapers.map((scraper) => toPersistedScraperRecord(scraper));
  await fs.writeFile(scrapersFilePath, JSON.stringify(persisted, null, 2));
}

const buildContentTypeWarning = (
  kind: ScraperAccessValidationRequest['kind'],
  contentType: string | undefined,
): string | undefined => {
  if (!contentType) return undefined;

  const normalized = contentType.toLowerCase();

  if (kind === 'site' && !normalized.includes('text/html')) {
    return 'La source repond, mais le type de contenu ne ressemble pas a une page HTML.';
  }

  if (kind === 'api' && !normalized.includes('json')) {
    return 'La source repond, mais le type de contenu ne ressemble pas a une reponse JSON.';
  }

  return undefined;
};

export async function validateScraperAccess(
  _event: IpcMainInvokeEvent,
  request: ScraperAccessValidationRequest,
): Promise<ScraperAccessValidationResult> {
  const checkedAt = new Date().toISOString();

  let normalizedUrl = '';
  try {
    normalizedUrl = normalizeScraperBaseUrl(request.baseUrl);
  } catch (error) {
    return {
      ok: false,
      kind: request.kind,
      normalizedUrl: request.baseUrl.trim(),
      checkedAt,
      error: error instanceof Error ? error.message : 'URL invalide.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, DEFAULT_SCRAPER_VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Manga Helper Scraper Validation/1.0',
        Accept: request.kind === 'api'
          ? 'application/json, text/plain, */*'
          : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const contentType = response.headers.get('content-type') ?? undefined;
    const warning = buildContentTypeWarning(request.kind, contentType);

    try {
      await response.body?.cancel();
    } catch {
      // no-op: some response bodies cannot be cancelled once fully buffered
    }

    return {
      ok: response.ok,
      kind: request.kind,
      normalizedUrl,
      checkedAt,
      status: response.status,
      finalUrl: response.url || normalizedUrl,
      contentType,
      warning,
      error: response.ok ? undefined : `La source a repondu avec le code HTTP ${response.status}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Echec de la requete.';
    return {
      ok: false,
      kind: request.kind,
      normalizedUrl,
      checkedAt,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getScrapers(): Promise<ScraperRecord[]> {
  return readScrapersFile();
}

export async function deleteScraper(
  _event: IpcMainInvokeEvent,
  scraperId: string,
): Promise<ScraperRecord[]> {
  const scrapers = await readScrapersFile();
  const filtered = scrapers.filter((scraper) => String(scraper.id) !== String(scraperId));

  if (filtered.length === scrapers.length) {
    return scrapers;
  }

  await writeScrapersFile(filtered);
  return filtered;
}

export async function fetchScraperDocument(
  _event: IpcMainInvokeEvent,
  request: FetchScraperDocumentRequest,
): Promise<FetchScraperDocumentResult> {
  const checkedAt = new Date().toISOString();

  let requestedUrl = '';
  try {
    requestedUrl = resolveScraperUrl(request.baseUrl, request.targetUrl);
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      requestedUrl: request.targetUrl.trim(),
      error: error instanceof Error ? error.message : 'URL invalide.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, DEFAULT_SCRAPER_VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(requestedUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Manga Helper Scraper Validation/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const html = await response.text();

    return {
      ok: response.ok,
      checkedAt,
      requestedUrl,
      finalUrl: response.url || requestedUrl,
      status: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
      html: response.ok ? html : undefined,
      error: response.ok ? undefined : `La page a repondu avec le code HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      requestedUrl,
      error: error instanceof Error ? error.message : 'Echec de la requete.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function saveScraperDraft(
  _event: IpcMainInvokeEvent,
  request: SaveScraperDraftRequest,
): Promise<ScraperRecord> {
  if (!request.validation?.ok) {
    throw new Error('Le scraper doit etre valide avant enregistrement.');
  }

  const normalizedUrl = normalizeScraperBaseUrl(request.identity.baseUrl);
  const now = new Date().toISOString();
  const scrapers = await readScrapersFile();

  const existingIndex = request.id
    ? scrapers.findIndex((scraper) => String(scraper.id) === String(request.id))
    : -1;

  if (existingIndex >= 0) {
    const existing = scrapers[existingIndex];
    const updated: ScraperRecord = {
      ...existing,
      kind: request.identity.kind,
      name: request.identity.name.trim(),
      baseUrl: normalizedUrl,
      description: request.identity.description?.trim() || '',
      status: 'validated',
      updatedAt: now,
      validation: {
        ...request.validation,
        normalizedUrl,
      },
      features: existing.features?.length ? hydrateScraperFeatures(existing.features) : createDefaultScraperFeatures(),
    };

    scrapers[existingIndex] = updated;
    await writeScrapersFile(scrapers);
    return updated;
  }

  const created: ScraperRecord = {
    id: randomUUID(),
    kind: request.identity.kind,
    name: request.identity.name.trim(),
    baseUrl: normalizedUrl,
    description: request.identity.description?.trim() || '',
    status: 'validated',
    createdAt: now,
    updatedAt: now,
    validation: {
      ...request.validation,
      normalizedUrl,
    },
    features: createDefaultScraperFeatures(),
  };

  scrapers.push(created);
  await writeScrapersFile(scrapers);
  return created;
}

export async function saveScraperFeatureConfig(
  _event: IpcMainInvokeEvent,
  request: SaveScraperFeatureRequest,
): Promise<ScraperRecord> {
  const scrapers = await readScrapersFile();
  const scraperIndex = scrapers.findIndex((scraper) => String(scraper.id) === String(request.scraperId));

  if (scraperIndex < 0) {
    throw new Error('Scraper introuvable.');
  }

  const scraper = scrapers[scraperIndex];
  const features = hydrateScraperFeatures(scraper.features);
  const featureIndex = features.findIndex((feature) => feature.kind === request.featureKind);

  if (featureIndex < 0) {
    throw new Error('Composant introuvable.');
  }

  features[featureIndex] = {
    ...features[featureIndex],
    config: request.config,
    validation: request.validation ?? null,
    status: request.validation?.ok ? 'validated' : 'configured',
  };

  const updated: ScraperRecord = {
    ...scraper,
    updatedAt: new Date().toISOString(),
    features,
  };

  scrapers[scraperIndex] = updated;
  await writeScrapersFile(scrapers);
  return updated;
}
