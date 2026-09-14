import { useEffect, useRef, useState } from "react";
import type { MultiSearchMergedResult, MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import {
  buildAuthorSeriesChapterCoverage,
  type AuthorSeriesSourceChapterCoverage,
} from "@/renderer/components/ScraperAuthorFavorites/authorSeriesChapterCoverage";
import {
  createScraperCardDetailsCache,
  getScraperChaptersFeatureConfig,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  isScraperFeatureConfigured,
  resolveScraperCardDetails,
  resolveScraperChapters,
  type ScraperCardDetailsCache,
  type ScraperDocumentFetcher,
} from "@/renderer/utils/scraperRuntime";
import { buildScraperTemplateContextFromDetails } from "@/renderer/utils/scraperTemplateContext";
import { runTasksWithConcurrency } from "@/renderer/utils/runWithConcurrency";

const CHAPTER_COVERAGE_CONCURRENCY = 3;

type ChapterCoverageState = {
  coveragesBySourceKey: Map<string, AuthorSeriesSourceChapterCoverage>;
  loading: boolean;
};

const getUniqueSources = (results: MultiSearchMergedResult[]): MultiSearchSourceResult[] => {
  const sourcesByKey = new Map<string, MultiSearchSourceResult>();
  results.forEach((result) => result.sources.forEach((source) => {
    sourcesByKey.set(buildMultiSearchSourceIdentityKey(source), source);
  }));
  return Array.from(sourcesByKey.values());
};

const canResolveSourceChapterCoverage = (source: MultiSearchSourceResult): boolean => {
  const chaptersFeature = getScraperFeature(source.scraper, "chapters");
  return Boolean(
    source.result.detailUrl
    && isScraperFeatureConfigured(chaptersFeature)
    && getScraperChaptersFeatureConfig(chaptersFeature)
    && getScraperDetailsFeatureConfig(getScraperFeature(source.scraper, "details")),
  );
};

const resolveSourceChapterCoverage = async (
  source: MultiSearchSourceResult,
  fetchDocument: ScraperDocumentFetcher,
  detailsCache: ScraperCardDetailsCache,
): Promise<AuthorSeriesSourceChapterCoverage | null> => {
  const chaptersFeature = getScraperFeature(source.scraper, "chapters");
  if (!isScraperFeatureConfigured(chaptersFeature)) return null;

  const chaptersConfig = getScraperChaptersFeatureConfig(chaptersFeature);
  const detailsConfig = getScraperDetailsFeatureConfig(getScraperFeature(source.scraper, "details"));
  if (!chaptersConfig || !detailsConfig || !source.result.detailUrl) return null;

  const details = await resolveScraperCardDetails({
    scraper: source.scraper,
    detailsConfig,
    detailUrl: source.result.detailUrl,
    fetchDocument,
    detailsCache,
  });
  if (!details) return null;

  const resolution = await resolveScraperChapters(
    source.scraper.baseUrl,
    details.finalUrl || details.requestedUrl,
    chaptersConfig,
    buildScraperTemplateContextFromDetails(details),
    fetchDocument,
  );
  return resolution.sourceResult.ok
    ? buildAuthorSeriesChapterCoverage(resolution.chapters)
    : null;
};

export default function useAuthorSeriesChapterCoverages(
  results: MultiSearchMergedResult[],
  enabled: boolean,
): ChapterCoverageState {
  const [coveragesBySourceKey, setCoveragesBySourceKey] = useState<
    Map<string, AuthorSeriesSourceChapterCoverage>
  >(() => new Map());
  const [loading, setLoading] = useState(false);
  const coverageRequestsRef = useRef(
    new Map<string, Promise<AuthorSeriesSourceChapterCoverage | null>>(),
  );
  const detailsCacheRef = useRef(createScraperCardDetailsCache());

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const fetchDocument = (window as any).api?.fetchScraperDocument as
      | ScraperDocumentFetcher
      | undefined;
    if (typeof fetchDocument !== "function") {
      setLoading(false);
      return;
    }

    const sources = getUniqueSources(results).filter(canResolveSourceChapterCoverage);
    const sourceKeys = new Set(sources.map(buildMultiSearchSourceIdentityKey));
    let disposed = false;
    setCoveragesBySourceKey((currentCoverages) => new Map(
      Array.from(currentCoverages).filter(([sourceKey]) => sourceKeys.has(sourceKey)),
    ));
    setLoading(sources.length > 0);

    const resolvedCoverages = new Map<string, AuthorSeriesSourceChapterCoverage>();
    const tasks = sources.map((source) => async () => {
      const sourceKey = buildMultiSearchSourceIdentityKey(source);
      let request = coverageRequestsRef.current.get(sourceKey);
      if (!request) {
        request = resolveSourceChapterCoverage(source, fetchDocument, detailsCacheRef.current);
        coverageRequestsRef.current.set(sourceKey, request);
      }

      try {
        const coverage = await request;
        if (coverage) resolvedCoverages.set(sourceKey, coverage);
      } catch (error) {
        coverageRequestsRef.current.delete(sourceKey);
        console.warn("Author series chapter coverage extraction failed", error);
      }
    });

    void runTasksWithConcurrency(
      tasks,
      CHAPTER_COVERAGE_CONCURRENCY,
      () => !disposed,
    ).then(() => {
      if (disposed) return;
      setCoveragesBySourceKey(resolvedCoverages);
      setLoading(false);
    });

    return () => {
      disposed = true;
    };
  }, [enabled, results]);

  return { coveragesBySourceKey, loading };
}
