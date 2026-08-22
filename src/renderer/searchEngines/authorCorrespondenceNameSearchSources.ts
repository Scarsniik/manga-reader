import type {
  AuthorCorrespondenceMatch,
} from "@/renderer/backgroundSearch/types";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";

const normalizeAuthorName = (value: string | null | undefined): string => (
  normalizeFuzzyText(value ?? "")
);

const getIdentifiedAuthorNames = (source: MultiSearchSourceResult): string[] => [
  ...(source.result.authorNames ?? []),
  ...source.tentativeAuthorNames,
  ...source.advancedRomanizedTentativeAuthorNameVariants,
];

export const isAuthorCorrespondenceNameSearchSourceVerified = (
  source: MultiSearchSourceResult,
): boolean => {
  const searchedName = normalizeAuthorName(source.searchTerm);
  return Boolean(
    searchedName
    && getIdentifiedAuthorNames(source).some((authorName) => (
      normalizeAuthorName(authorName) === searchedName
    )),
  );
};

export const filterAuthorCorrespondenceNameSearchSources = (options: {
  sources: MultiSearchSourceResult[];
  requestedNames: Array<string | null | undefined>;
  matches: AuthorCorrespondenceMatch[];
  invalidatedMatchKeys: Set<string>;
}): MultiSearchSourceResult[] => {
  const acceptedNameKeys = new Set(options.requestedNames.map(normalizeAuthorName).filter(Boolean));
  options.matches.forEach((match) => {
    if (options.invalidatedMatchKeys.has(match.key)) return;
    acceptedNameKeys.add(normalizeAuthorName(match.authorName));
    acceptedNameKeys.add(normalizeAuthorName(match.matchedName));
  });

  return options.sources.filter((source) => (
    acceptedNameKeys.has(normalizeAuthorName(source.searchTerm))
    && isAuthorCorrespondenceNameSearchSourceVerified(source)
  ));
};
