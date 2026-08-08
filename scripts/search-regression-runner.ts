import type { BackgroundSearchJob, BackgroundSearchKind } from "@/shared/backgroundSearch";
import { executeBackgroundSearch } from "@/renderer/searchEngines/searchEngineRegistry";
import {
  fetchAuthorPageWithRetry,
  fetchHomepagePageWithRetry,
  fetchSearchPageWithRetry,
  fetchTagPageWithRetry,
  getAuthorConfig,
  getHomepageConfig,
  getPaceConfig,
  getSearchConfig,
  getTagConfig,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import type { ScraperRecord } from "@/shared/scraper";

type CorpusCase = {
  id: string;
  kind: BackgroundSearchKind;
  input: BackgroundSearchJob["input"];
};

type CorpusProbe = {
  id: string;
  kind: "homepage" | "search" | "author" | "tag";
  scraper: ScraperRecord;
  query?: string;
};

type CorpusPlan = {
  createdAt: string;
  sourceJobs: Record<string, string>;
  cases: CorpusCase[];
  probes: CorpusProbe[];
};

declare global {
  interface Window {
    api: {
      getSearchRegressionPlan: () => Promise<CorpusPlan>;
      completeSearchRegressionRun: (payload: unknown) => Promise<boolean>;
    } & Record<string, (...args: any[]) => Promise<any>>;
  }
}

const compactScraper = (scraper: unknown): unknown => {
  if (!scraper || typeof scraper !== "object") return scraper;
  const value = scraper as Record<string, unknown>;
  return {
    id: value.id,
    name: value.name,
    baseUrl: value.baseUrl,
  };
};

const sanitize = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));

  const source = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(source).map(([key, item]) => {
    if (key === "scraper") return [key, compactScraper(item)];
    return [key, sanitize(item, seen)];
  }));
};

const serializeError = (error: unknown): string => (
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)
);

const runCase = async (testCase: CorpusCase) => {
  const startedAt = performance.now();
  let snapshotCount = 0;
  let lastProgress: unknown = null;
  try {
    const result = await executeBackgroundSearch({
      metadata: {
        id: `search-corpus:${testCase.id}`,
        kind: testCase.kind,
      },
      input: testCase.input,
      result: null,
    } as BackgroundSearchJob, new AbortController().signal, async (_snapshot, progress) => {
      snapshotCount += 1;
      lastProgress = progress;
    });
    return {
      id: testCase.id,
      kind: testCase.kind,
      ok: true,
      elapsedMs: Math.round(performance.now() - startedAt),
      snapshotCount,
      lastProgress: sanitize(lastProgress),
      result: sanitize(result),
    };
  } catch (error) {
    return {
      id: testCase.id,
      kind: testCase.kind,
      ok: false,
      elapsedMs: Math.round(performance.now() - startedAt),
      snapshotCount,
      lastProgress: sanitize(lastProgress),
      error: serializeError(error),
    };
  }
};

const runProbe = async (probe: CorpusProbe) => {
  const startedAt = performance.now();
  const pace = getPaceConfig("fast");
  try {
    const page = probe.kind === "homepage"
      ? await fetchHomepagePageWithRetry(probe.scraper, getHomepageConfig(probe.scraper), 0, undefined, pace, {
        scrapeDetailsWithCards: true,
      })
      : probe.kind === "search"
        ? await fetchSearchPageWithRetry(probe.scraper, getSearchConfig(probe.scraper), probe.query ?? "", 0, undefined, pace, {
          scrapeDetailsWithCards: true,
        })
        : probe.kind === "author"
          ? await fetchAuthorPageWithRetry(probe.scraper, getAuthorConfig(probe.scraper), probe.query ?? "", 0, undefined, pace, {
            scrapeDetailsWithCards: true,
          })
          : await fetchTagPageWithRetry(probe.scraper, getTagConfig(probe.scraper), probe.query ?? "", 0, undefined, pace, {
            scrapeDetailsWithCards: true,
          });
    return {
      id: probe.id,
      kind: probe.kind,
      ok: true,
      elapsedMs: Math.round(performance.now() - startedAt),
      page: sanitize(page),
    };
  } catch (error) {
    return {
      id: probe.id,
      kind: probe.kind,
      ok: false,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: serializeError(error),
    };
  }
};

const main = async () => {
  const plan = await window.api.getSearchRegressionPlan();
  const cases = [];
  for (const testCase of plan.cases) cases.push(await runCase(testCase));
  const probes = [];
  for (const probe of plan.probes) probes.push(await runProbe(probe));
  await window.api.completeSearchRegressionRun({
    ok: cases.every((testCase) => testCase.ok) && probes.every((probe) => probe.ok),
    generatedAt: new Date().toISOString(),
    planCreatedAt: plan.createdAt,
    sourceJobs: plan.sourceJobs,
    cases,
    probes,
  });
};

void main().catch(async (error) => {
  await window.api.completeSearchRegressionRun({
    ok: false,
    generatedAt: new Date().toISOString(),
    error: serializeError(error),
  });
});
