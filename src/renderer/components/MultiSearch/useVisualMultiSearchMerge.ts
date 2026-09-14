import React from "react";
import {
  appendMultiSearchSourceToGroup,
  buildMultiSearchSourceIdentityKey,
  sortMultiSearchMergedResults,
} from "@/renderer/components/MultiSearch/multiSearchMerge";
import {
  haveClearlyConflictingMultiSearchAuthors,
  haveCompatibleMultiSearchAuthors,
} from "@/renderer/components/MultiSearch/multiSearchTitleMerge";
import type {
  MultiSearchMergeOptions,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import useVisualImageFingerprints from "@/renderer/hooks/useVisualImageFingerprints";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";
import {
  doMangaCorrespondenceChaptersOverlap,
} from "@/renderer/utils/mangaCorrespondenceChapter";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import {
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
} from "@/renderer/utils/scraperRuntime";
import {
  haveSharedVisualTitleStem,
} from "@/renderer/utils/visualTitleMatching";
import {
  areVisualImagesEquivalent,
  type VisualImageFingerprint,
  type VisualImageFingerprintInput,
} from "@/shared/visualImageFingerprint";
import type {
  BackendVisualMultiSearchResponse,
} from "@/renderer/components/MultiSearch/multiSearchMergeWorkerProtocol";

type VisualSourceTitleEvidence = {
  aliases: string[];
  chapter?: string;
  hasExplicitChapter: boolean;
};

type VisualMultiSearchMergeResult = {
  mergedResults: MultiSearchMergedResult[];
  fingerprintsBySourceKey: ReadonlyMap<string, VisualImageFingerprint>;
  loading: boolean;
};

const sourceEvidenceCache = new WeakMap<MultiSearchSourceResult, VisualSourceTitleEvidence>();

const getSourceTitleEvidence = (source: MultiSearchSourceResult): VisualSourceTitleEvidence => {
  const cached = sourceEvidenceCache.get(source);
  if (cached) return cached;

  const titleAnalysisFeature = Array.isArray(source.scraper.features)
    ? getScraperFeature(source.scraper, "titleAnalysis")
    : null;
  const config = getScraperTitleAnalysisFeatureConfig(titleAnalysisFeature);
  const analyses = [source.result.title, ...(source.advancedRomanizedTitleVariants ?? [])]
    .map((title) => analyzeMangaCorrespondenceTitle(title, config));
  const primaryAnalysis = analyses[0];
  const aliases = Array.from(new Set(analyses.flatMap((analysis) => (
    [analysis.title, ...analysis.alternativeTitles]
      .map(normalizeFuzzyText)
      .filter(Boolean)
  ))));
  const evidence = {
    aliases,
    chapter: primaryAnalysis.chapter,
    hasExplicitChapter: Boolean(
      primaryAnalysis.chapter
      && primaryAnalysis.chapterDetection?.source !== "namedChapter"
    ),
  };
  sourceEvidenceCache.set(source, evidence);
  return evidence;
};

const haveConflictingExplicitChapters = (
  left: VisualSourceTitleEvidence,
  right: VisualSourceTitleEvidence,
): boolean => Boolean(
  left.hasExplicitChapter
  && right.hasExplicitChapter
  && left.chapter
  && right.chapter
  && !doMangaCorrespondenceChaptersOverlap(left.chapter, right.chapter)
);

const haveCompatibleVisualChapters = (
  left: VisualSourceTitleEvidence,
  right: VisualSourceTitleEvidence,
): boolean => {
  if (!left.hasExplicitChapter && !right.hasExplicitChapter) return true;
  if (!left.hasExplicitChapter || !right.hasExplicitChapter) return false;
  return Boolean(
    left.chapter
    && right.chapter
    && doMangaCorrespondenceChaptersOverlap(left.chapter, right.chapter)
  );
};

const canPotentiallyMergeSourcesVisually = (
  left: MultiSearchSourceResult,
  right: MultiSearchSourceResult,
  options: MultiSearchMergeOptions,
): boolean => {
  const leftEvidence = getSourceTitleEvidence(left);
  const rightEvidence = getSourceTitleEvidence(right);
  if (
    haveConflictingExplicitChapters(leftEvidence, rightEvidence)
    || haveClearlyConflictingMultiSearchAuthors(left, right, options)
  ) {
    return false;
  }

  if (haveSharedVisualTitleStem(leftEvidence.aliases, rightEvidence.aliases)) {
    return true;
  }

  return haveCompatibleVisualChapters(leftEvidence, rightEvidence)
    && (
      options.assumeSameAuthor === true
      || haveCompatibleMultiSearchAuthors(left, right, options)
    );
};

const canVisuallyMergeSources = (
  left: MultiSearchSourceResult,
  right: MultiSearchSourceResult,
  options: MultiSearchMergeOptions,
  fingerprintsBySourceKey: ReadonlyMap<string, VisualImageFingerprint>,
): boolean => {
  if (!canPotentiallyMergeSourcesVisually(left, right, options)) return false;

  const leftFingerprint = fingerprintsBySourceKey.get(buildMultiSearchSourceIdentityKey(left));
  const rightFingerprint = fingerprintsBySourceKey.get(buildMultiSearchSourceIdentityKey(right));
  return Boolean(
    leftFingerprint
    && rightFingerprint
    && areVisualImagesEquivalent(leftFingerprint, rightFingerprint)
  );
};

const canVisuallyMergeResults = (
  left: MultiSearchMergedResult,
  right: MultiSearchMergedResult,
  options: MultiSearchMergeOptions,
  fingerprintsBySourceKey: ReadonlyMap<string, VisualImageFingerprint>,
): boolean => left.sources.some((leftSource) => right.sources.some((rightSource) => (
  canVisuallyMergeSources(leftSource, rightSource, options, fingerprintsBySourceKey)
)));

const cloneMergedResult = (result: MultiSearchMergedResult): MultiSearchMergedResult => ({
  ...result,
  sources: [...result.sources],
  sourceLanguageCodes: [...result.sourceLanguageCodes],
  tentativeAuthorNames: [...result.tentativeAuthorNames],
  contentTypes: [...result.contentTypes],
  preferredTitleLanguageCodes: [...(result.preferredTitleLanguageCodes ?? [])],
});

export const mergeMultiSearchResultsByVisualFingerprint = (
  results: MultiSearchMergedResult[],
  options: MultiSearchMergeOptions,
  fingerprintsBySourceKey: ReadonlyMap<string, VisualImageFingerprint>,
): MultiSearchMergedResult[] => {
  const clusters: Array<{
    result: MultiSearchMergedResult;
    members: MultiSearchMergedResult[];
  }> = [];

  results.forEach((result) => {
    const cluster = clusters.find((candidate) => candidate.members.every((member) => (
      canVisuallyMergeResults(member, result, options, fingerprintsBySourceKey)
    )));
    if (!cluster) {
      clusters.push({ result: cloneMergedResult(result), members: [result] });
      return;
    }

    result.sources.forEach((source) => {
      appendMultiSearchSourceToGroup(cluster.result, source, options);
    });
    cluster.members.push(result);
  });

  return sortMultiSearchMergedResults(clusters.map((cluster) => cluster.result));
};

export const buildCandidateFingerprintInputs = (
  results: MultiSearchMergedResult[],
  options: MultiSearchMergeOptions,
): VisualImageFingerprintInput[] => {
  const indexedSources = results.flatMap((result, resultIndex) => result.sources.map((source) => ({
    resultIndex,
    source,
  })));
  const candidateSources = new Set<MultiSearchSourceResult>();
  indexedSources.forEach((left, leftIndex) => {
    for (let rightIndex = leftIndex + 1; rightIndex < indexedSources.length; rightIndex += 1) {
      const right = indexedSources[rightIndex];
      if (
        left.resultIndex === right.resultIndex
        || !canPotentiallyMergeSourcesVisually(left.source, right.source, options)
      ) continue;
      candidateSources.add(left.source);
      candidateSources.add(right.source);
    }
  });

  return Array.from(candidateSources).flatMap((source) => {
    const url = source.result.thumbnailUrl?.trim();
    if (!url) return [];
    return [{
      key: buildMultiSearchSourceIdentityKey(source),
      url,
      refererUrl: source.result.detailUrl || source.scraper.baseUrl,
    }];
  });
};

type VisualCandidateBatch = {
  results: MultiSearchMergedResult[];
  options: MultiSearchMergeOptions;
  inputs: VisualImageFingerprintInput[];
};

const EMPTY_FINGERPRINT_INPUTS: VisualImageFingerprintInput[] = [];
let nextVisualMergeSessionId = 0;

export default function useVisualMultiSearchMerge(
  results: MultiSearchMergedResult[],
  options: MultiSearchMergeOptions,
  enabled: boolean,
): VisualMultiSearchMergeResult {
  const visualCandidateOptionsKey = [
    options.assumeSameAuthor ? "same-author" : "check-author",
    options.enableRomajiPhoneticMerge ? "phonetic" : "standard",
  ].join(":");
  const preferredTitleLanguageCodesKey = options.preferredTitleLanguageCodes.join("|");
  const sessionIdRef = React.useRef("");
  if (!sessionIdRef.current) {
    nextVisualMergeSessionId += 1;
    sessionIdRef.current = `multi-search-visual-${Date.now()}-${nextVisualMergeSessionId}`;
  }
  const candidateRequestIdRef = React.useRef(0);
  const mergeRequestIdRef = React.useRef(0);
  const [candidateBatch, setCandidateBatch] = React.useState<VisualCandidateBatch | null>(null);
  const [processedResults, setProcessedResults] = React.useState(results);
  const [candidateLoading, setCandidateLoading] = React.useState(false);
  const [mergeLoading, setMergeLoading] = React.useState(false);
  const fingerprintInputs = candidateBatch?.inputs ?? EMPTY_FINGERPRINT_INPUTS;
  const { fingerprintsByKey, loading } = useVisualImageFingerprints(fingerprintInputs, enabled);

  React.useEffect(() => () => {
    void window.api?.disposeMultiSearchMergeWorker?.(sessionIdRef.current);
  }, []);

  React.useEffect(() => {
    const requestId = candidateRequestIdRef.current + 1;
    candidateRequestIdRef.current = requestId;
    mergeRequestIdRef.current += 1;
    setProcessedResults(results);
    setCandidateBatch(null);
    setMergeLoading(false);
    if (!enabled || !results.length) {
      setCandidateBatch(null);
      setCandidateLoading(false);
      return;
    }
    setCandidateLoading(true);
    void window.api?.runMultiSearchVisualWorker?.(sessionIdRef.current, {
      type: "visualCandidates",
      requestId,
      results,
      options,
    }).then((response: BackendVisualMultiSearchResponse) => {
      if (
        candidateRequestIdRef.current !== requestId
        || response.type !== "visualCandidates"
      ) return;
      setCandidateBatch({ results, options, inputs: response.inputs });
      setCandidateLoading(false);
    }).catch((error: unknown) => {
      if (candidateRequestIdRef.current !== requestId) return;
      console.warn("Failed to select visual matching candidates in the backend worker", error);
      setCandidateBatch(null);
      setCandidateLoading(false);
    });
  }, [
    enabled,
    preferredTitleLanguageCodesKey,
    results,
    visualCandidateOptionsKey,
  ]);

  React.useEffect(() => {
    if (!enabled || !candidateBatch || loading) return;
    if (!candidateBatch.inputs.length || !fingerprintsByKey.size) {
      setProcessedResults(candidateBatch.results);
      setMergeLoading(false);
      return;
    }
    const requestId = mergeRequestIdRef.current + 1;
    mergeRequestIdRef.current = requestId;
    setMergeLoading(true);
    void window.api?.runMultiSearchVisualWorker?.(sessionIdRef.current, {
      type: "visualMerge",
      requestId,
      results: candidateBatch.results,
      options: candidateBatch.options,
      fingerprints: Array.from(fingerprintsByKey.entries()),
    }).then((response: BackendVisualMultiSearchResponse) => {
      if (mergeRequestIdRef.current !== requestId || response.type !== "visualMerge") return;
      setProcessedResults(response.mergedResults);
      setMergeLoading(false);
    }).catch((error: unknown) => {
      if (mergeRequestIdRef.current !== requestId) return;
      console.warn("Failed to merge visual matches in the backend worker", error);
      setProcessedResults(candidateBatch.results);
      setMergeLoading(false);
    });
  }, [candidateBatch, enabled, fingerprintsByKey, loading]);

  return {
    mergedResults: enabled ? processedResults : results,
    fingerprintsBySourceKey: fingerprintsByKey,
    loading: candidateLoading || loading || mergeLoading,
  };
}
