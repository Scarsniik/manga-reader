import type { AuthorCorrespondenceReferenceSource } from "@/shared/backgroundSearch";
import type { AuthorCorrespondenceMangaEnrichment } from "@/renderer/backgroundSearch/authorCorrespondenceSessionCache";
import type {
  AuthorCorrespondenceRejectedAuthorCandidate,
  AuthorCorrespondenceRejectedAuthorReason,
} from "@/renderer/backgroundSearch/types";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { buildUniqueAuthorSearchNames } from "@/renderer/utils/authorSearchNames";
import { dedupeAuthorCorrespondenceReferenceSources } from "@/renderer/utils/authorCorrespondenceIdentity";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";
import { resolveCompatibleMangaAuthorName } from "@/renderer/utils/mangaMatching/titleProfiles";

const REPEATED_AUTHOR_ALIAS_MIN_MANGA_COUNT = 2;
const REPEATED_AUTHOR_ALIAS_MIN_SCRAPER_COUNT = 2;
const GENERIC_AUTHOR_LABEL_KEYS = new Set([
  "anonymous",
  "anthology",
  "multiple artists",
  "unknown",
  "various",
  "various artist",
  "various artists",
]);

export type EvidenceBackedAdvancedAuthorAlias = {
  name: string;
  mangaCount: number;
  scraperCount: number;
  evidence: "compatibleName" | "repeatedManga";
};

export type AdvancedAuthorAliasAnalysis = {
  acceptedAliases: EvidenceBackedAdvancedAuthorAlias[];
  rejectedCandidates: AuthorCorrespondenceRejectedAuthorCandidate[];
};

type AuthorEvidence = {
  name: string;
  mangaKeys: Set<string>;
  soleAuthorMangaKeys: Set<string>;
  scraperIds: Set<string>;
  soleAuthorScraperIds: Set<string>;
  scraperNames: Map<string, string>;
  sampleTitles: Set<string>;
  referenceSources: AuthorCorrespondenceReferenceSource[];
};

const isPlausibleAuthorAlias = (authorName: string): boolean => {
  const normalizedName = normalizeFuzzyText(authorName);
  const characterCount = Array.from(authorName).length;
  return Boolean(
    normalizedName
    && characterCount >= 2
    && characterCount <= 60
    && !GENERIC_AUTHOR_LABEL_KEYS.has(normalizedName)
    && !/(?:https?:\/\/|\[(?:chinese|english|french|japanese|raw)\b)/iu.test(authorName)
  );
};

const buildRejectedAuthorCandidateKey = (authorName: string): string => (
  `rejected-author::${normalizeFuzzyText(authorName)}`
);

const collectSourceReferenceSources = (
  source: MultiSearchSourceResult,
  authorNames: string[],
): AuthorCorrespondenceReferenceSource[] => {
  const authorUrls = (source.result.authorUrls?.length
    ? source.result.authorUrls
    : source.result.authorUrl
      ? [source.result.authorUrl]
      : [])
    .map((authorUrl) => authorUrl.trim())
    .filter(Boolean);
  if (!authorUrls.length) return [];

  return authorUrls.flatMap((authorUrl, index) => {
    const name = authorNames[index]
      ?? (authorUrls.length === 1 && authorNames.length === 1 ? authorNames[0] : undefined);
    return name ? [{
      scraperId: source.scraper.id,
      authorUrl,
      name,
    }] : [];
  });
};

const resolveRejectedReason = (options: {
  plausible: boolean;
  soleAuthorMangaCount: number;
  soleAuthorScraperCount: number;
}): AuthorCorrespondenceRejectedAuthorReason => {
  if (!options.plausible) return "implausibleName";
  if (!options.soleAuthorMangaCount) return "multipleAuthorsOnly";
  if (options.soleAuthorMangaCount < REPEATED_AUTHOR_ALIAS_MIN_MANGA_COUNT) {
    return "insufficientMangaEvidence";
  }
  return "insufficientScraperEvidence";
};

export const analyzeAdvancedAuthorAliases = (options: {
  enrichments: AuthorCorrespondenceMangaEnrichment[];
  authorSources: MultiSearchSourceResult[];
  referenceNames: string[];
}): AdvancedAuthorAliasAnalysis => {
  const referenceNames = buildUniqueAuthorSearchNames(options.referenceNames);
  const referenceNameKeys = new Set(referenceNames.map(normalizeFuzzyText));
  const sourcesByKey = new Map<string, MultiSearchSourceResult>();
  [...options.authorSources, ...options.enrichments.flatMap((enrichment) => enrichment.sources)]
    .forEach((source) => {
      sourcesByKey.set(buildMultiSearchSourceIdentityKey(source), source);
    });
  const evidenceByName = new Map<string, AuthorEvidence>();

  options.enrichments.forEach((enrichment) => {
    const sources = new Map<string, MultiSearchSourceResult>();
    enrichment.anchorSourceKeys.forEach((sourceKey) => {
      const source = sourcesByKey.get(sourceKey);
      if (source) sources.set(sourceKey, source);
    });
    enrichment.sources.forEach((source) => {
      sources.set(buildMultiSearchSourceIdentityKey(source), source);
    });

    sources.forEach((source) => {
      const authorNames = buildUniqueAuthorSearchNames([
        ...(source.result.authorNames ?? []),
        ...source.tentativeAuthorNames,
      ]);
      if (!authorNames.length) return;
      const sourceReferenceSources = collectSourceReferenceSources(source, authorNames);

      authorNames.forEach((authorName) => {
        const key = normalizeFuzzyText(authorName);
        if (!key) return;
        const evidence = evidenceByName.get(key) ?? {
          name: authorName,
          mangaKeys: new Set<string>(),
          soleAuthorMangaKeys: new Set<string>(),
          scraperIds: new Set<string>(),
          soleAuthorScraperIds: new Set<string>(),
          scraperNames: new Map<string, string>(),
          sampleTitles: new Set<string>(),
          referenceSources: [],
        };
        evidence.mangaKeys.add(enrichment.seedKey);
        evidence.scraperIds.add(source.scraper.id);
        evidence.scraperNames.set(source.scraper.id, source.scraper.name);
        if (authorNames.length === 1) {
          evidence.soleAuthorMangaKeys.add(enrichment.seedKey);
          evidence.soleAuthorScraperIds.add(source.scraper.id);
        }
        if (source.result.title.trim() && evidence.sampleTitles.size < 3) {
          evidence.sampleTitles.add(source.result.title.trim());
        }
        evidence.referenceSources.push(...sourceReferenceSources.filter((candidate) => (
          normalizeFuzzyText(candidate.name) === key
        )));
        evidenceByName.set(key, evidence);
      });
    });
  });

  const acceptedAliases: EvidenceBackedAdvancedAuthorAlias[] = [];
  const rejectedCandidates: AuthorCorrespondenceRejectedAuthorCandidate[] = [];
  evidenceByName.forEach((evidence) => {
    const normalizedName = normalizeFuzzyText(evidence.name);
    if (referenceNameKeys.has(normalizedName)) return;
    const plausible = isPlausibleAuthorAlias(evidence.name);
    const hasCompatibleName = plausible && Boolean(
      resolveCompatibleMangaAuthorName(evidence.name, referenceNames),
    );
    const hasRepeatedMangaEvidence = (
      plausible
      && evidence.soleAuthorMangaKeys.size >= REPEATED_AUTHOR_ALIAS_MIN_MANGA_COUNT
      && evidence.soleAuthorScraperIds.size >= REPEATED_AUTHOR_ALIAS_MIN_SCRAPER_COUNT
    );
    if (hasCompatibleName || hasRepeatedMangaEvidence) {
      acceptedAliases.push({
        name: evidence.name,
        mangaCount: evidence.mangaKeys.size,
        scraperCount: evidence.scraperIds.size,
        evidence: hasCompatibleName ? "compatibleName" : "repeatedManga",
      });
      return;
    }

    rejectedCandidates.push({
      key: buildRejectedAuthorCandidateKey(evidence.name),
      name: evidence.name,
      reason: resolveRejectedReason({
        plausible,
        soleAuthorMangaCount: evidence.soleAuthorMangaKeys.size,
        soleAuthorScraperCount: evidence.soleAuthorScraperIds.size,
      }),
      decision: "pending",
      mangaCount: evidence.mangaKeys.size,
      soleAuthorMangaCount: evidence.soleAuthorMangaKeys.size,
      scraperCount: evidence.scraperIds.size,
      evidenceMangaKeys: Array.from(evidence.mangaKeys),
      scraperIds: Array.from(evidence.scraperIds),
      scraperNames: Array.from(evidence.scraperNames.values()),
      sampleTitles: Array.from(evidence.sampleTitles),
      referenceSources: dedupeAuthorCorrespondenceReferenceSources(evidence.referenceSources),
    });
  });

  return {
    acceptedAliases: acceptedAliases.sort((left, right) => left.name.localeCompare(right.name)),
    rejectedCandidates: rejectedCandidates.sort((left, right) => (
      right.mangaCount - left.mangaCount || left.name.localeCompare(right.name)
    )),
  };
};

export const collectEvidenceBackedAdvancedAuthorAliases = (options: {
  enrichments: AuthorCorrespondenceMangaEnrichment[];
  authorSources: MultiSearchSourceResult[];
  referenceNames: string[];
}): EvidenceBackedAdvancedAuthorAlias[] => (
  analyzeAdvancedAuthorAliases(options).acceptedAliases
);

export const mergeAuthorCorrespondenceRejectedAuthorCandidates = (
  candidates: AuthorCorrespondenceRejectedAuthorCandidate[],
): AuthorCorrespondenceRejectedAuthorCandidate[] => {
  const candidatesByKey = new Map<string, AuthorCorrespondenceRejectedAuthorCandidate>();
  candidates.forEach((candidate) => {
    const key = buildRejectedAuthorCandidateKey(candidate.name);
    const current = candidatesByKey.get(key);
    if (!current) {
      candidatesByKey.set(key, { ...candidate, key });
      return;
    }
    const evidenceMangaKeys = Array.from(new Set([
      ...current.evidenceMangaKeys,
      ...candidate.evidenceMangaKeys,
    ]));
    const scraperIds = Array.from(new Set([...current.scraperIds, ...candidate.scraperIds]));
    candidatesByKey.set(key, {
      ...current,
      ...candidate,
      key,
      decision: current.decision === "accepted" || candidate.decision === "accepted"
        ? "accepted"
        : "pending",
      mangaCount: evidenceMangaKeys.length,
      soleAuthorMangaCount: Math.max(
        current.soleAuthorMangaCount,
        candidate.soleAuthorMangaCount,
      ),
      scraperCount: scraperIds.length,
      evidenceMangaKeys,
      scraperIds,
      scraperNames: Array.from(new Set([
        ...current.scraperNames,
        ...candidate.scraperNames,
      ])),
      sampleTitles: Array.from(new Set([
        ...current.sampleTitles,
        ...candidate.sampleTitles,
      ])).slice(0, 3),
      referenceSources: dedupeAuthorCorrespondenceReferenceSources([
        ...current.referenceSources,
        ...candidate.referenceSources,
      ]),
    });
  });
  return Array.from(candidatesByKey.values()).sort((left, right) => (
    right.mangaCount - left.mangaCount || left.name.localeCompare(right.name)
  ));
};
