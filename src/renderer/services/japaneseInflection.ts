import type {
  JapaneseInflectionAnalysis,
  JapaneseInflectionRequest,
  JapaneseInflectionResult,
} from "@/shared/japaneseInflection";

type JapaneseInflectionApi = {
  analyzeJapaneseInflections?: (
    request: JapaneseInflectionRequest,
  ) => Promise<JapaneseInflectionResult>;
};

const MAX_CACHE_SIZE = 500;

const inflectionCache = new Map<string, Promise<JapaneseInflectionAnalysis | null>>();

const getCacheKey = (surface: string, baseForm: string | null): string => (
  JSON.stringify([surface, baseForm])
);

const rememberCachePromise = (
  key: string,
  value: Promise<JapaneseInflectionAnalysis | null>,
) => {
  if (inflectionCache.has(key)) {
    inflectionCache.delete(key);
  }

  inflectionCache.set(key, value);

  while (inflectionCache.size > MAX_CACHE_SIZE) {
    const oldestKey = inflectionCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    inflectionCache.delete(oldestKey);
  }
};

export const loadJapaneseInflection = async (
  surface: string,
  baseForm?: string | null,
): Promise<JapaneseInflectionAnalysis | null> => {
  const normalizedSurface = String(surface || "").trim();
  const normalizedBaseForm = String(baseForm || "").trim() || null;
  if (!normalizedSurface) {
    return null;
  }

  const key = getCacheKey(normalizedSurface, normalizedBaseForm);
  const cached = inflectionCache.get(key);
  if (cached) {
    return cached;
  }

  const request = (async (): Promise<JapaneseInflectionAnalysis | null> => {
    const api = (typeof window === "undefined" ? null : (window as any).api) as JapaneseInflectionApi | null;
    if (typeof api?.analyzeJapaneseInflections !== "function") {
      return null;
    }

    const result = await api.analyzeJapaneseInflections({
      items: [{
        surface: normalizedSurface,
        baseForm: normalizedBaseForm,
      }],
    });

    if (result.error) {
      throw new Error(result.error);
    }

    return result.items[0] ?? null;
  })();

  request.catch(() => {
    if (inflectionCache.get(key) === request) {
      inflectionCache.delete(key);
    }
  });

  rememberCachePromise(key, request);
  return request;
};
