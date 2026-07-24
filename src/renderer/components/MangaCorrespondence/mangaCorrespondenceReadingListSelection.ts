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
