import type {
  AuthorCorrespondenceBackgroundInput,
  MangaCorrespondenceBackgroundInput,
} from "@/shared/backgroundSearch";
import type { ScraperRecord } from "@/shared/scraper";
import type { MangaCorrespondenceDiscovery } from "@/renderer/backgroundSearch/types";
import {
  buildMangaCorrespondenceDiscoveryKey,
  normalizeMangaCorrespondenceDiscoveryValue,
} from "@/renderer/backgroundSearch/mangaCorrespondenceDiscoveries";
import { splitIncludeFilterValues } from "@/renderer/components/IncludeFilterBar/includeFilterValues";
import {
  fetchAuthorPageWithRetry,
  getAuthorConfig,
  getPaceConfig,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import { canOpenScraperDetails } from "@/renderer/components/MultiSearch/multiSearchUtils";
import {
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
  isScraperFeatureConfigured,
  resolveScraperCardDetails,
  type ScraperDocumentFetcher,
} from "@/renderer/utils/scraperRuntime";
import { analyzeMangaCorrespondenceSourceIdentity } from "@/renderer/backgroundSearch/mangaCorrespondenceSourceAnalysis";

export type MangaCorrespondenceManualDiscoveryKind = MangaCorrespondenceDiscovery["kind"];

type CorrespondenceManualDiscoveryInput = Pick<
  MangaCorrespondenceBackgroundInput,
  "paceMode" | "scraperFilterValues" | "scrapers"
>;

const MANUAL_SCRAPER_ID = "manual";
const MANUAL_SCRAPER_NAME = "Ajout manuel";

const parseHttpUrl = (value: string): URL | null => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
};

const selectEnabledScrapers = (input: CorrespondenceManualDiscoveryInput): ScraperRecord[] => {
  const filter = splitIncludeFilterValues(input.scraperFilterValues);
  return input.scrapers.filter((scraper) => (
    !filter.excludedValues.includes(scraper.id)
    && (!filter.includedValues.length || filter.includedValues.includes(scraper.id))
  ));
};

const canHandleUrlKind = (
  scraper: ScraperRecord,
  kind: MangaCorrespondenceManualDiscoveryKind,
): boolean => {
  if (kind === "title") return canOpenScraperDetails(scraper);
  const feature = getScraperFeature(scraper, "author");
  if (!isScraperFeatureConfigured(feature)) return false;
  try {
    return Boolean(getAuthorConfig(scraper));
  } catch {
    return false;
  }
};

const findUrlScraper = (
  input: CorrespondenceManualDiscoveryInput,
  kind: MangaCorrespondenceManualDiscoveryKind,
  targetUrl: URL,
): ScraperRecord => {
  const candidates = selectEnabledScrapers(input).flatMap((scraper) => {
    if (!canHandleUrlKind(scraper, kind)) return [];
    try {
      const baseUrl = new URL(scraper.baseUrl);
      if (
        baseUrl.hostname.toLocaleLowerCase() !== targetUrl.hostname.toLocaleLowerCase()
        || baseUrl.port !== targetUrl.port
      ) return [];
      return [{ scraper, pathLength: baseUrl.pathname.replace(/\/+$/, "").length }];
    } catch {
      return [];
    }
  }).sort((left, right) => right.pathLength - left.pathLength);

  if (!candidates.length) {
    throw new Error(kind === "title"
      ? "Aucun scraper actif ne sait ouvrir cette URL de fiche."
      : "Aucun scraper actif ne sait traiter cette URL de page auteur.");
  }
  const bestCandidates = candidates.filter((candidate) => (
    candidate.pathLength === candidates[0].pathLength
  ));
  if (bestCandidates.length > 1) {
    throw new Error(`Cette URL correspond à plusieurs scrapers actifs : ${bestCandidates
      .map(({ scraper }) => scraper.name)
      .join(", ")}.`);
  }
  return candidates[0].scraper;
};

const buildManualDiscovery = (options: {
  kind: MangaCorrespondenceManualDiscoveryKind;
  value: string;
  scraperId?: string;
  scraperName?: string;
  sourceUrl?: string;
  authorPageUrl?: string;
}): MangaCorrespondenceDiscovery => {
  const value = options.value.trim().replace(/\s+/g, " ");
  const scraperId = options.scraperId ?? MANUAL_SCRAPER_ID;
  return {
    key: buildMangaCorrespondenceDiscoveryKey(options.kind, scraperId, value),
    kind: options.kind,
    value,
    normalizedValue: normalizeMangaCorrespondenceDiscoveryValue(value),
    scraperId,
    scraperName: options.scraperName ?? MANUAL_SCRAPER_NAME,
    origin: "manual",
    ...(options.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
    ...(options.authorPageUrl ? { authorPageUrl: options.authorPageUrl } : {}),
    parentStepIds: [],
    evidenceCount: 1,
    status: "active",
    propagationConfidence: "manual",
    foundAt: new Date().toISOString(),
  };
};

const resolveManualAuthorPageDiscovery = async (options: {
  input: CorrespondenceManualDiscoveryInput;
  parsedUrl: URL;
  fetchDocument?: ScraperDocumentFetcher;
}): Promise<MangaCorrespondenceDiscovery[]> => {
  if (!options.fetchDocument) {
    throw new Error("Le chargement des scrapers n’est pas disponible.");
  }
  const scraper = findUrlScraper(options.input, "author", options.parsedUrl);
  const normalizedUrl = options.parsedUrl.toString();
  const authorPage = await fetchAuthorPageWithRetry(
    scraper,
    getAuthorConfig(scraper),
    normalizedUrl,
    0,
    undefined,
    getPaceConfig(options.input.paceMode),
    undefined,
    { fetchDocument: options.fetchDocument },
  );
  const authorName = authorPage.authorNames?.find((name) => name.trim())?.trim();
  if (!authorName) {
    throw new Error(`Le scraper ${scraper.name} reconnaît cette URL, mais n’a pas pu en extraire le nom d’auteur.`);
  }
  return [buildManualDiscovery({
    kind: "author",
    value: authorName,
    scraperId: scraper.id,
    scraperName: scraper.name,
    sourceUrl: normalizedUrl,
    authorPageUrl: normalizedUrl,
  })];
};

export const resolveAuthorCorrespondenceManualDiscovery = async (options: {
  rawValue: string;
  input: AuthorCorrespondenceBackgroundInput;
  fetchDocument?: ScraperDocumentFetcher;
}): Promise<MangaCorrespondenceDiscovery[]> => {
  const rawValue = options.rawValue.trim();
  if (!rawValue) throw new Error("Saisis un nom d’auteur ou une URL.");
  const parsedUrl = parseHttpUrl(rawValue);
  const looksLikeUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(rawValue);
  if (!parsedUrl) {
    if (looksLikeUrl) throw new Error("L’URL saisie n’est pas une URL HTTP ou HTTPS valide.");
    return [buildManualDiscovery({ kind: "author", value: rawValue })];
  }
  return resolveManualAuthorPageDiscovery({
    input: options.input,
    parsedUrl,
    fetchDocument: options.fetchDocument,
  });
};

export const resolveMangaCorrespondenceManualDiscovery = async (options: {
  kind: MangaCorrespondenceManualDiscoveryKind;
  rawValue: string;
  input: MangaCorrespondenceBackgroundInput;
  fetchDocument?: ScraperDocumentFetcher;
}): Promise<MangaCorrespondenceDiscovery[]> => {
  const rawValue = options.rawValue.trim();
  if (!rawValue) throw new Error("Saisis un titre, un auteur ou une URL.");
  const parsedUrl = parseHttpUrl(rawValue);
  const looksLikeUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(rawValue);
  if (!parsedUrl) {
    if (looksLikeUrl) throw new Error("L’URL saisie n’est pas une URL HTTP ou HTTPS valide.");
    return [buildManualDiscovery({ kind: options.kind, value: rawValue })];
  }
  if (!options.fetchDocument) {
    throw new Error("Le chargement des scrapers n’est pas disponible.");
  }

  if (options.kind === "title") {
    const scraper = findUrlScraper(options.input, options.kind, parsedUrl);
    const normalizedUrl = parsedUrl.toString();
    const detailsFeature = getScraperFeature(scraper, "details");
    const details = await resolveScraperCardDetails({
      scraper,
      detailsConfig: getScraperDetailsFeatureConfig(detailsFeature),
      detailUrl: normalizedUrl,
      fetchDocument: options.fetchDocument,
    });
    if (!details?.title?.trim()) {
      if (!isScraperFeatureConfigured(detailsFeature)) {
        throw new Error(`${scraper.name} ne possède pas de fiche exploitable.`);
      }
      throw new Error(`Le scraper ${scraper.name} n’a pas réussi à extraire le titre de cette fiche.`);
    }
    const sourceUrl = details.finalUrl || normalizedUrl;
    const identity = analyzeMangaCorrespondenceSourceIdentity({
      rawTitle: details.title,
      titleAnalysisConfig: getScraperTitleAnalysisFeatureConfig(
        getScraperFeature(scraper, "titleAnalysis"),
      ),
      knownAuthors: [...options.input.reference.authors, ...details.authors],
      supplementalAuthors: details.authors,
    });
    const discoveries = [
      ...identity.titles.map((title, index) => buildManualDiscovery({
        kind: "title",
        value: title,
        scraperId: scraper.id,
        scraperName: scraper.name,
        ...(index === 0 ? { sourceUrl } : {}),
      })),
      ...identity.authors.map((author) => {
        const authorIndex = details.authors.findIndex((value) => (
          normalizeMangaCorrespondenceDiscoveryValue(value)
          === normalizeMangaCorrespondenceDiscoveryValue(author)
        ));
        const authorPageUrl = authorIndex >= 0
          ? details.authorUrls[authorIndex]
            ?? (details.authorUrls.length === 1 ? details.authorUrls[0] : undefined)
          : undefined;
        return buildManualDiscovery({
          kind: "author",
          value: author,
          scraperId: scraper.id,
          scraperName: scraper.name,
          sourceUrl,
          ...(authorPageUrl ? { authorPageUrl } : {}),
        });
      }),
    ];
    return Array.from(new Map(discoveries.map((discovery) => [
      discovery.key,
      discovery,
    ])).values());
  }

  return resolveManualAuthorPageDiscovery({
    input: options.input,
    parsedUrl,
    fetchDocument: options.fetchDocument,
  });
};
