import { normalizeReaderAssetSrc } from "@/renderer/components/Reader/utils";
import { buildRemoteThumbnailUrl } from "@/renderer/utils/remoteThumbnails";

type ReadingListCoverItem = {
  metadata: {
    cover?: string | null;
    coverCandidates?: string[];
  };
  sourceTarget: {
    kind: string;
    sourceUrl?: string;
    locationState?: unknown;
  };
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const uniqueTextValues = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();

  return values.flatMap((value) => {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      return [];
    }

    seen.add(normalized);
    return [normalized];
  });
};

export const getReadingListCoverReferer = (item: ReadingListCoverItem): string | null => {
  if (item.sourceTarget.kind === "scraper.details") {
    return item.sourceTarget.sourceUrl?.trim() || null;
  }

  const locationState = item.sourceTarget.locationState;
  if (!isObjectRecord(locationState) || !isObjectRecord(locationState.scraperReader)) {
    return null;
  }

  const sourceUrl = locationState.scraperReader.sourceUrl;
  return typeof sourceUrl === "string" ? sourceUrl.trim() || null : null;
};

export const buildReadingListCoverSources = (item: ReadingListCoverItem): string[] => {
  const refererUrl = getReadingListCoverReferer(item);
  const rawCandidates = uniqueTextValues([
    item.metadata.cover,
    ...(item.metadata.coverCandidates ?? []),
  ]);

  return uniqueTextValues(rawCandidates.flatMap((candidate) => {
    const normalizedCandidate = normalizeReaderAssetSrc(candidate);
    if (!normalizedCandidate) {
      return [];
    }

    return [
      buildRemoteThumbnailUrl(normalizedCandidate, refererUrl),
      normalizedCandidate,
    ];
  }));
};

export const buildReadingListCoverCandidates = (
  cover?: string | null,
  candidates: string[] = [],
): string[] => uniqueTextValues([cover, ...candidates]);
