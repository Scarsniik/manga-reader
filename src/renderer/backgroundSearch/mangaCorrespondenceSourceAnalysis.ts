const DERIVATIVE_RELEASE_PATTERN = /(?:^|[^\p{L}\p{N}])(?:ai[\s_-]*generated|ai[\s_-]*generation|oav\s*0*\d+|ova\s*0*\d+|\d+\s+images?)(?:$|[^\p{L}\p{N}])/iu;

const escapeRegex = (value: string): string => (
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
);

const buildFlexibleAuthorPattern = (value: string): string => (
  escapeRegex(value.trim()).replace(/\s+/g, "\\s*")
);

export const isClearlyDerivativeMangaCorrespondenceTitle = (
  rawTitle: string,
): boolean => (
  DERIVATIVE_RELEASE_PATTERN.test(String(rawTitle ?? "").normalize("NFKC"))
);

export const stripMangaCorrespondenceTrailingKnownAuthor = (
  rawTitle: string,
  knownAuthors: string[],
): string => {
  const title = String(rawTitle ?? "").trim();

  for (const author of knownAuthors) {
    const authorPattern = buildFlexibleAuthorPattern(author);
    if (!authorPattern) continue;

    const match = title.match(new RegExp(
      `^(?<title>.*?\\S)\\s*(?<chapter>[0-9０-９]{1,4}(?:[.,][0-9０-９]+)?)\\s*(?:[-–—:]\\s*)?${authorPattern}\\s*$`,
      "iu",
    ));
    if (match?.groups?.title && match.groups.chapter) {
      return `${match.groups.title} ${match.groups.chapter}`;
    }

    const leadingMatch = title.match(new RegExp(
      `^\\s*(?:\\[|\\()?\\s*${authorPattern}\\s*(?:\\]|\\))?\\s*[-–—:]\\s*(?<title>.+\\S)\\s*$`,
      "iu",
    ));
    if (leadingMatch?.groups?.title) {
      return leadingMatch.groups.title.trim();
    }

    const trailingMatch = title.match(new RegExp(
      `^(?<title>.+\\S)\\s*[-–—:]\\s*${authorPattern}\\s*$`,
      "iu",
    ));
    if (trailingMatch?.groups?.title) {
      return trailingMatch.groups.title.trim();
    }
  }

  return title;
};
