import {
  fetchKanjiApiEntries,
  getJpdbKanjiDetails,
  getJpdbTokenRubyParts,
  getJpdbTokenSurface,
  getJpdbTokenVocabulary,
  JpdbJa2EnResult,
  JpdbParseResult,
  JpdbTranslationContext,
  KanjiApiEntry,
  parseTextWithJpdb,
  translateJaToEn,
} from '@/renderer/services/jpdb';

const MAX_ANALYSIS_CACHE_SIZE = 500;
const MAX_TOKEN_DETAILS_CACHE_SIZE = 500;
const PRELOAD_CONCURRENCY = 2;

type PreloadPriority = 'high' | 'normal';

type PreloadTask = {
  key: string;
  priority: PreloadPriority;
  run: () => Promise<void>;
};

export type JpdbTextAnalysisResult = {
  text: string;
  parseResult: JpdbParseResult | null;
  parseError: string | null;
  translation: JpdbJa2EnResult | null;
  translationError: string | null;
};

type LoadJpdbTextAnalysisOptions = {
  force?: boolean;
  translationSegments?: string[];
};

type PreloadJpdbTextAnalysisOptions = {
  includeTokenDetails?: boolean;
  priority?: PreloadPriority;
  translationSegments?: string[];
};

type PreloadJpdbOrderedTextAnalysisOptions = {
  includeTokenDetails?: boolean;
  priority?: PreloadPriority;
};

const analysisCache = new Map<string, Promise<JpdbTextAnalysisResult>>();
const tokenDetailsCache = new Map<string, Promise<Record<string, KanjiApiEntry | null>>>();
const queuedPreloadKeys = new Set<string>();
const preloadQueue: PreloadTask[] = [];
let activePreloadCount = 0;

const getErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

const normalizeTranslationSegments = (segments?: string[]): string[] => (
  Array.isArray(segments)
    ? segments
      .map((segment) => String(segment || '').trim())
      .filter((segment) => segment.length > 0)
    : []
);

const getAnalysisCacheKey = (text: string, translationSegments: string[]): string => (
  translationSegments.length > 1
    ? JSON.stringify(['ordered-translation', translationSegments])
    : text
);

const translateSegmentsWithJpdbContext = async (
  text: string,
  translationSegments: string[]
): Promise<JpdbJa2EnResult> => {
  if (translationSegments.length <= 1) {
    return translateJaToEn(text);
  }

  let previousContext: JpdbTranslationContext | undefined;
  let isTruncated = false;
  let latestTranslation: JpdbJa2EnResult | null = null;

  for (const segment of translationSegments) {
    const translation = await translateJaToEn(segment, previousContext);
    latestTranslation = translation;
    isTruncated = isTruncated || !!translation.is_truncated;
    previousContext = translation.text.trim().length > 0
      ? [segment, translation.text]
      : undefined;
  }

  return {
    text: latestTranslation?.text ?? '',
    is_truncated: isTruncated,
  };
};

const runJpdbTextAnalysis = async (
  normalizedText: string,
  translateText: () => Promise<JpdbJa2EnResult>
): Promise<JpdbTextAnalysisResult> => {
  const [parseResponse, translationResponse] = await Promise.allSettled([
    parseTextWithJpdb(normalizedText),
    translateText(),
  ]);

  return {
    text: normalizedText,
    parseResult: parseResponse.status === 'fulfilled' ? parseResponse.value : null,
    parseError: parseResponse.status === 'rejected' ? getErrorMessage(parseResponse.reason) : null,
    translation: translationResponse.status === 'fulfilled' ? translationResponse.value : null,
    translationError: translationResponse.status === 'rejected' ? getErrorMessage(translationResponse.reason) : null,
  };
};

const rememberCachePromise = <Value>(
  cache: Map<string, Promise<Value>>,
  key: string,
  value: Promise<Value>,
  maxSize: number
) => {
  if (cache.has(key)) {
    cache.delete(key);
  }

  cache.set(key, value);

  while (cache.size > maxSize) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
};

const getUniqueKanjiForText = (text: string, parseResult: JpdbParseResult): string[] => {
  const targetKanji = new Set<string>();

  parseResult.tokens.forEach((token) => {
    const vocabulary = getJpdbTokenVocabulary(parseResult, token);
    const rubyParts = getJpdbTokenRubyParts(text, token, vocabulary);
    const surface = getJpdbTokenSurface(text, token);
    getJpdbKanjiDetails(surface, rubyParts).forEach((detail) => {
      targetKanji.add(detail.kanji);
    });
  });

  return Array.from(targetKanji);
};

const runNextPreloadTasks = () => {
  while (activePreloadCount < PRELOAD_CONCURRENCY && preloadQueue.length > 0) {
    const task = preloadQueue.shift();
    if (!task) {
      return;
    }

    activePreloadCount += 1;
    queuedPreloadKeys.delete(task.key);

    task.run()
      .catch((error) => {
        console.debug('jpdbAnalysis preload failed:', error);
      })
      .finally(() => {
        activePreloadCount -= 1;
        runNextPreloadTasks();
      });
  }
};

const enqueuePreloadTask = (task: PreloadTask) => {
  if (queuedPreloadKeys.has(task.key)) {
    return;
  }

  queuedPreloadKeys.add(task.key);

  if (task.priority === 'high') {
    const firstNormalIndex = preloadQueue.findIndex((queuedTask) => queuedTask.priority === 'normal');
    if (firstNormalIndex >= 0) {
      preloadQueue.splice(firstNormalIndex, 0, task);
    } else {
      preloadQueue.push(task);
    }
  } else {
    preloadQueue.push(task);
  }

  runNextPreloadTasks();
};

export const loadJpdbTextAnalysis = async (
  text: string,
  options?: LoadJpdbTextAnalysisOptions
): Promise<JpdbTextAnalysisResult> => {
  const normalizedText = String(text || '');
  const translationSegments = normalizeTranslationSegments(options?.translationSegments);
  const analysisCacheKey = getAnalysisCacheKey(normalizedText, translationSegments);
  if (normalizedText.trim().length === 0) {
    return {
      text: normalizedText,
      parseResult: null,
      parseError: null,
      translation: null,
      translationError: null,
    };
  }

  if (options?.force) {
    analysisCache.delete(analysisCacheKey);
    tokenDetailsCache.delete(normalizedText);
  }

  const cached = analysisCache.get(analysisCacheKey);
  if (cached) {
    return cached;
  }

  const request = (async (): Promise<JpdbTextAnalysisResult> => {
    const result = await runJpdbTextAnalysis(
      normalizedText,
      () => translateSegmentsWithJpdbContext(normalizedText, translationSegments)
    );

    if (!result.parseResult || !result.translation) {
      analysisCache.delete(analysisCacheKey);
    }

    return result;
  })();

  rememberCachePromise(analysisCache, analysisCacheKey, request, MAX_ANALYSIS_CACHE_SIZE);
  return request;
};

export const preloadJpdbOrderedTextAnalysis = (
  segments: string[],
  options?: PreloadJpdbOrderedTextAnalysisOptions
) => {
  const normalizedSegments = normalizeTranslationSegments(segments);
  if (normalizedSegments.length === 0) {
    return;
  }

  const includeTokenDetails = !!options?.includeTokenDetails;
  const key = `${includeTokenDetails ? 'ordered-details' : 'ordered-analysis'}:${JSON.stringify(normalizedSegments)}`;

  enqueuePreloadTask({
    key,
    priority: options?.priority ?? 'high',
    run: async () => {
      let previousContext: JpdbTranslationContext | undefined;

      for (let index = 0; index < normalizedSegments.length; index += 1) {
        const normalizedText = normalizedSegments[index];
        const translationSegments = normalizedSegments.slice(0, index + 1);
        const analysisCacheKey = getAnalysisCacheKey(normalizedText, translationSegments);
        let analysisPromise = analysisCache.get(analysisCacheKey);

        if (!analysisPromise) {
          const contextForSegment = previousContext;
          analysisPromise = (async (): Promise<JpdbTextAnalysisResult> => {
            const result = await runJpdbTextAnalysis(
              normalizedText,
              () => translateJaToEn(normalizedText, contextForSegment)
            );

            if (!result.parseResult || !result.translation) {
              analysisCache.delete(analysisCacheKey);
            }

            return result;
          })();

          rememberCachePromise(analysisCache, analysisCacheKey, analysisPromise, MAX_ANALYSIS_CACHE_SIZE);
        }

        const analysis = await analysisPromise;
        if (includeTokenDetails && analysis.parseResult) {
          await loadJpdbTextTokenDetails(normalizedText, analysis.parseResult);
        }

        previousContext = analysis.translation?.text.trim()
          ? [normalizedText, analysis.translation.text]
          : undefined;
      }
    },
  });
};

export const loadJpdbTextTokenDetails = async (
  text: string,
  parseResult?: JpdbParseResult | null,
  options?: LoadJpdbTextAnalysisOptions
): Promise<Record<string, KanjiApiEntry | null>> => {
  const normalizedText = String(text || '');
  if (normalizedText.trim().length === 0) {
    return {};
  }

  if (options?.force) {
    tokenDetailsCache.delete(normalizedText);
  }

  const cached = tokenDetailsCache.get(normalizedText);
  if (cached) {
    return cached;
  }

  const request = (async () => {
    const resolvedParseResult = parseResult ?? (await loadJpdbTextAnalysis(normalizedText)).parseResult;
    if (!resolvedParseResult || !Array.isArray(resolvedParseResult.tokens)) {
      tokenDetailsCache.delete(normalizedText);
      return {};
    }

    return fetchKanjiApiEntries(getUniqueKanjiForText(normalizedText, resolvedParseResult));
  })();

  rememberCachePromise(tokenDetailsCache, normalizedText, request, MAX_TOKEN_DETAILS_CACHE_SIZE);
  return request;
};

export const preloadJpdbTextAnalysis = (
  text: string,
  options?: PreloadJpdbTextAnalysisOptions
) => {
  const normalizedText = String(text || '');
  const translationSegments = normalizeTranslationSegments(options?.translationSegments);
  const analysisCacheKey = getAnalysisCacheKey(normalizedText, translationSegments);
  if (normalizedText.trim().length === 0) {
    return;
  }

  const includeTokenDetails = !!options?.includeTokenDetails;
  if (analysisCache.has(analysisCacheKey) && (!includeTokenDetails || tokenDetailsCache.has(normalizedText))) {
    return;
  }

  const key = `${includeTokenDetails ? 'details' : 'analysis'}:${analysisCacheKey}`;
  enqueuePreloadTask({
    key,
    priority: options?.priority ?? 'normal',
    run: async () => {
      const analysis = await loadJpdbTextAnalysis(normalizedText, {
        translationSegments,
      });
      if (includeTokenDetails && analysis.parseResult) {
        await loadJpdbTextTokenDetails(normalizedText, analysis.parseResult);
      }
    },
  });
};
