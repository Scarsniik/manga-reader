import type {
  MangaCorrespondenceBackgroundResult,
  MangaCorrespondenceChapterOverride,
} from "@/renderer/backgroundSearch/types";

export type MangaCorrespondenceChapterOverrideUpdate = {
  matchKeys: string[];
  value: string | null;
  scope: MangaCorrespondenceChapterOverride["scope"];
  preserveMatchOverrides?: boolean;
  updatedAt?: string;
};

const buildChapterOverride = (
  update: MangaCorrespondenceChapterOverrideUpdate,
): MangaCorrespondenceChapterOverride => ({
  value: update.value?.trim() || null,
  scope: update.scope,
  updatedAt: update.updatedAt ?? new Date().toISOString(),
});

export const updateMangaCorrespondenceChapterOverrides = (
  result: MangaCorrespondenceBackgroundResult,
  update: MangaCorrespondenceChapterOverrideUpdate,
): MangaCorrespondenceBackgroundResult => {
  const targetKeys = new Set(update.matchKeys);
  const chapterOverride = buildChapterOverride(update);
  const applyOverride = <T extends {
    key: string;
    chapterOverride?: MangaCorrespondenceChapterOverride;
  }>(entry: T): T => {
    if (!targetKeys.has(entry.key)) return entry;
    if (
      update.scope === "group"
      && update.preserveMatchOverrides
      && entry.chapterOverride?.scope === "match"
    ) {
      return entry;
    }
    return { ...entry, chapterOverride };
  };

  return {
    ...result,
    matches: result.matches.map(applyOverride),
    rejectedCandidates: result.rejectedCandidates.map(applyOverride),
  };
};

export const resetMangaCorrespondenceChapterOverrides = (
  result: MangaCorrespondenceBackgroundResult,
  matchKeys: string[],
  scope: MangaCorrespondenceChapterOverride["scope"],
): MangaCorrespondenceBackgroundResult => {
  const targetKeys = new Set(matchKeys);
  const resetOverride = <T extends {
    key: string;
    chapterOverride?: MangaCorrespondenceChapterOverride;
  }>(entry: T): T => {
    if (!targetKeys.has(entry.key) || !entry.chapterOverride) return entry;
    if (scope === "group" && entry.chapterOverride.scope === "match") return entry;
    const { chapterOverride: _chapterOverride, ...remaining } = entry;
    return remaining as T;
  };

  return {
    ...result,
    matches: result.matches.map(resetOverride),
    rejectedCandidates: result.rejectedCandidates.map(resetOverride),
  };
};
