import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildMultiSearchAuthorExtractionFromLoadedMetadata,
  buildMultiSearchAuthorsSourceFingerprint,
  extractMultiSearchAuthors,
  type MultiSearchAuthorExtractionProgress,
  type MultiSearchAuthorExtractionResult,
  type MultiSearchAuthorResult,
} from "@/renderer/components/MultiSearch/multiSearchAuthors";
import type {
  MultiSearchPaceMode,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";

const STORAGE_KEY = "manga-helper.multi-search.author-extraction-cache.v1";

type MultiSearchAuthorCache = {
  sourceFingerprint: string;
  result: MultiSearchAuthorExtractionResult;
};

const isAuthorResult = (value: unknown): value is MultiSearchAuthorResult => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const author = value as Partial<MultiSearchAuthorResult>;
  return (
    typeof author.key === "string"
    && typeof author.scraperId === "string"
    && typeof author.scraperName === "string"
    && typeof author.name === "string"
    && typeof author.url === "string"
    && typeof author.sourceTitle === "string"
    && (author.discoveryMethod === "card" || author.discoveryMethod === "details")
  );
};

const isExtractionResult = (value: unknown): value is MultiSearchAuthorExtractionResult => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const result = value as Partial<MultiSearchAuthorExtractionResult>;
  return (
    Array.isArray(result.authors)
    && result.authors.every(isAuthorResult)
    && Number.isFinite(result.detailsSourceCount)
    && Number.isFinite(result.failedDetailsSourceCount)
  );
};

const readCachedAuthors = (sourceFingerprint: string): MultiSearchAuthorCache | null => {
  if (typeof window === "undefined" || !sourceFingerprint) {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<MultiSearchAuthorCache>;
    if (
      parsedValue.sourceFingerprint !== sourceFingerprint
      || !isExtractionResult(parsedValue.result)
    ) {
      return null;
    }

    return {
      sourceFingerprint,
      result: parsedValue.result,
    };
  } catch {
    return null;
  }
};

const saveCachedAuthors = (cache: MultiSearchAuthorCache): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // The in-memory cache remains available when session storage is unavailable.
  }
};

const buildImmediateCache = (
  sources: MultiSearchSourceResult[],
  sourceFingerprint: string,
): MultiSearchAuthorCache | null => {
  const storedCache = readCachedAuthors(sourceFingerprint);
  if (storedCache) {
    return storedCache;
  }

  const loadedMetadataResult = buildMultiSearchAuthorExtractionFromLoadedMetadata(sources);
  if (!loadedMetadataResult) {
    return null;
  }

  return {
    sourceFingerprint,
    result: loadedMetadataResult,
  };
};

export default function useMultiSearchAuthors(
  sources: MultiSearchSourceResult[],
  paceMode: MultiSearchPaceMode,
) {
  const sourceFingerprint = useMemo(
    () => sources.length ? buildMultiSearchAuthorsSourceFingerprint(sources) : "",
    [sources],
  );
  const sourceFingerprintRef = useRef(sourceFingerprint);
  const sourcesRef = useRef(sources);
  const [cache, setCache] = useState<MultiSearchAuthorCache | null>(null);
  const [isExtractingAuthors, setIsExtractingAuthors] = useState(false);
  const [authorExtractionProgress, setAuthorExtractionProgress] = useState<MultiSearchAuthorExtractionProgress | null>(null);

  sourceFingerprintRef.current = sourceFingerprint;
  sourcesRef.current = sources;

  useEffect(() => {
    setAuthorExtractionProgress(null);

    if (!sourceFingerprint) {
      setCache(null);
      return;
    }

    setCache((currentCache) => {
      if (currentCache?.sourceFingerprint === sourceFingerprint) {
        return currentCache;
      }

      const immediateCache = buildImmediateCache(sourcesRef.current, sourceFingerprint);
      if (immediateCache) {
        saveCachedAuthors(immediateCache);
      }
      return immediateCache;
    });
  }, [sourceFingerprint]);

  const getAuthors = useCallback(async (): Promise<MultiSearchAuthorExtractionResult | null> => {
    if (!sources.length || !sourceFingerprint || isExtractingAuthors) {
      return null;
    }

    const immediateCache = cache?.sourceFingerprint === sourceFingerprint
      ? cache
      : buildImmediateCache(sources, sourceFingerprint);
    if (immediateCache) {
      setCache(immediateCache);
      saveCachedAuthors(immediateCache);
      return immediateCache.result;
    }

    const extractionFingerprint = sourceFingerprint;
    setIsExtractingAuthors(true);
    setAuthorExtractionProgress({
      processedSourceCount: 0,
      totalSourceCount: sources.length,
      detailsSourceCount: 0,
    });

    try {
      const result = await extractMultiSearchAuthors(
        sources,
        paceMode,
        setAuthorExtractionProgress,
      );

      if (sourceFingerprintRef.current !== extractionFingerprint) {
        throw new Error("Les resultats ont change pendant l'extraction. Relance l'ouverture des auteurs.");
      }

      const nextCache = {
        sourceFingerprint: extractionFingerprint,
        result,
      };
      setCache(nextCache);
      saveCachedAuthors(nextCache);
      return result;
    } finally {
      setIsExtractingAuthors(false);
    }
  }, [cache, isExtractingAuthors, paceMode, sourceFingerprint, sources]);

  const cachedAuthorCount = cache?.sourceFingerprint === sourceFingerprint
    ? cache.result.authors.length
    : null;

  return {
    authorExtractionProgress,
    cachedAuthorCount,
    getAuthors,
    isExtractingAuthors,
  };
}
