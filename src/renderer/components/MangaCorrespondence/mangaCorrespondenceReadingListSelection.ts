export type MangaCorrespondenceChapterSelectionEntry = {
  chapter: string;
};

export const filterIncludedMangaCorrespondenceChapters = <
  T extends MangaCorrespondenceChapterSelectionEntry,
>(
  chapters: T[],
  excludedChapterLabels: ReadonlySet<string>,
): T[] => (
  chapters.filter((chapter) => !excludedChapterLabels.has(chapter.chapter))
);

export const toggleMangaCorrespondenceChapterExclusion = (
  excludedChapterLabels: ReadonlySet<string>,
  chapter: string,
): Set<string> => {
  const next = new Set(excludedChapterLabels);
  if (next.has(chapter)) {
    next.delete(chapter);
  } else {
    next.add(chapter);
  }
  return next;
};

export const toggleMangaCorrespondenceSourceExclusion = (
  excludedSourceKeys: ReadonlySet<string>,
  sourceKey: string,
): Set<string> => {
  const next = new Set(excludedSourceKeys);
  if (next.has(sourceKey)) {
    next.delete(sourceKey);
  } else {
    next.add(sourceKey);
  }
  return next;
};
