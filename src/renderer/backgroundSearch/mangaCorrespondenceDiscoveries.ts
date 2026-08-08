import type { MangaCorrespondenceBackgroundInput } from "@/shared/backgroundSearch";
import type {
  MangaCorrespondenceBackgroundResult,
  MangaCorrespondenceDiscovery,
} from "@/renderer/backgroundSearch/types";

export const normalizeMangaCorrespondenceDiscoveryValue = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase()
);

export const buildMangaCorrespondenceDiscoveryKey = (
  kind: MangaCorrespondenceDiscovery["kind"],
  scraperId: string,
  value: string,
): string => `${kind}:${String(scraperId).trim()}:${normalizeMangaCorrespondenceDiscoveryValue(value)}`;

export const buildInitialMangaCorrespondenceDiscoveries = (
  input: MangaCorrespondenceBackgroundInput,
): MangaCorrespondenceDiscovery[] => {
  const scraper = input.scrapers.find((entry) => entry.id === input.reference.scraperId);
  const entries: Array<{ kind: MangaCorrespondenceDiscovery["kind"]; value: string }> = [
    { kind: "title", value: input.reference.title },
    ...input.reference.alternativeTitles.map((value) => ({ kind: "title" as const, value })),
    ...input.reference.authors.map((value) => ({ kind: "author" as const, value })),
  ];
  const byKey = new Map<string, MangaCorrespondenceDiscovery>();
  entries.forEach(({ kind, value }) => {
    const normalizedValue = normalizeMangaCorrespondenceDiscoveryValue(value);
    if (!normalizedValue) return;
    const key = buildMangaCorrespondenceDiscoveryKey(kind, input.reference.scraperId, value);
    if (byKey.has(key)) return;
    byKey.set(key, {
      key,
      kind,
      value: value.trim(),
      normalizedValue,
      scraperId: input.reference.scraperId,
      scraperName: scraper?.name ?? input.reference.scraperId,
      origin: "reference",
      sourceUrl: input.reference.sourceUrl,
      parentStepIds: [],
      evidenceCount: 1,
      status: "active",
      foundAt: new Date().toISOString(),
    });
  });
  return Array.from(byKey.values());
};

export const upsertMangaCorrespondenceDiscovery = (
  discoveries: Map<string, MangaCorrespondenceDiscovery>,
  discovery: Omit<MangaCorrespondenceDiscovery, "key" | "normalizedValue" | "evidenceCount" | "foundAt" | "status"> & {
    status?: MangaCorrespondenceDiscovery["status"];
    foundAt?: string;
  },
  decisions?: ReadonlyMap<string, MangaCorrespondenceDiscovery["status"]>,
): MangaCorrespondenceDiscovery | null => {
  const normalizedValue = normalizeMangaCorrespondenceDiscoveryValue(discovery.value);
  if (!normalizedValue || !discovery.scraperId.trim()) return null;
  const key = buildMangaCorrespondenceDiscoveryKey(discovery.kind, discovery.scraperId, discovery.value);
  const existing = discoveries.get(key);
  const next: MangaCorrespondenceDiscovery = {
    ...(existing ?? {
      key,
      normalizedValue,
      evidenceCount: 0,
      foundAt: discovery.foundAt ?? new Date().toISOString(),
      status: decisions?.get(key) ?? discovery.status ?? "active",
    }),
    ...discovery,
    key,
    normalizedValue,
    parentStepIds: Array.from(new Set([
      ...(existing?.parentStepIds ?? []),
      ...discovery.parentStepIds,
    ])),
    evidenceCount: (existing?.evidenceCount ?? 0) + 1,
    status: decisions?.get(key) ?? existing?.status ?? discovery.status ?? "active",
  };
  discoveries.set(key, next);
  return next;
};

export const updateMangaCorrespondenceDiscoveryStatus = (
  result: MangaCorrespondenceBackgroundResult,
  key: string,
  status: MangaCorrespondenceDiscovery["status"],
): MangaCorrespondenceBackgroundResult => ({
  ...result,
  discoveries: (result.discoveries ?? []).map((discovery) => (
    discovery.key === key ? { ...discovery, status } : discovery
  )),
});

export const hasActiveMangaCorrespondenceTitle = (
  result: MangaCorrespondenceBackgroundResult | undefined,
): boolean => (result?.discoveries ?? []).some((discovery) => (
  discovery.kind === "title" && discovery.status === "active"
));

export const buildMangaCorrespondenceReplayInput = (
  input: MangaCorrespondenceBackgroundInput,
  result: MangaCorrespondenceBackgroundResult,
): MangaCorrespondenceBackgroundInput => ({
  ...input,
  continuation: undefined,
  replay: {
    revision: Math.max(1, Math.floor((input.replay?.revision ?? 0) + 1)),
    discoveryDecisions: (result.discoveries?.length
      ? result.discoveries
      : buildInitialMangaCorrespondenceDiscoveries(input)
    ).map(({ key, status }) => ({ key, status })),
  },
});
