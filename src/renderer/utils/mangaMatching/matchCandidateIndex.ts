import {
  getMangaSourceUrlMergeKey,
  getMangaTitleMergeExactKeys,
  getMangaTitleMergeFuzzyLengths,
  type MangaMergeOptions,
  type MatchableManga,
} from "@/renderer/utils/mangaMatching/titleProfiles";

export type MangaMatchCandidateIndex<T extends MatchableManga> = {
  candidates: T[];
  candidateIndexes: Map<T, number>;
  sourceUrlCandidates: Map<string, Set<T>>;
  exactTitleCandidates: Map<string, Set<T>>;
  fuzzyLengthCandidates: Map<number, Set<T>>;
  options: MangaMergeOptions;
};

const addCandidateToIndex = <Key, T extends MatchableManga>(
  index: Map<Key, Set<T>>,
  key: Key,
  candidate: T,
): void => {
  const candidates = index.get(key);
  if (candidates) {
    candidates.add(candidate);
    return;
  }

  index.set(key, new Set([candidate]));
};

export const createMangaMatchCandidateIndex = <T extends MatchableManga>(
  candidates: T[],
  options: MangaMergeOptions,
): MangaMatchCandidateIndex<T> => {
  const index: MangaMatchCandidateIndex<T> = {
    candidates,
    candidateIndexes: new Map(),
    sourceUrlCandidates: new Map(),
    exactTitleCandidates: new Map(),
    fuzzyLengthCandidates: new Map(),
    options,
  };

  candidates.forEach((candidate, candidateIndex) => {
    index.candidateIndexes.set(candidate, candidateIndex);

    const sourceUrlKey = getMangaSourceUrlMergeKey(candidate);
    if (sourceUrlKey) {
      addCandidateToIndex(index.sourceUrlCandidates, sourceUrlKey, candidate);
    }

    getMangaTitleMergeExactKeys(candidate, options).forEach((titleKey) => {
      addCandidateToIndex(index.exactTitleCandidates, titleKey, candidate);
    });
    getMangaTitleMergeFuzzyLengths(candidate, options).forEach((titleLength) => {
      addCandidateToIndex(index.fuzzyLengthCandidates, titleLength, candidate);
    });
  });

  return index;
};

const addCandidates = <T extends MatchableManga>(
  target: Set<T>,
  candidates: Set<T> | undefined,
): void => {
  candidates?.forEach((candidate) => target.add(candidate));
};

export const collectIndexedMangaMatchCandidates = <T extends MatchableManga>(
  index: MangaMatchCandidateIndex<T>,
  manga: MatchableManga,
): T[] => {
  const candidates = new Set<T>();
  const sourceUrlKey = getMangaSourceUrlMergeKey(manga);
  if (sourceUrlKey) {
    addCandidates(candidates, index.sourceUrlCandidates.get(sourceUrlKey));
  }

  getMangaTitleMergeExactKeys(manga, index.options).forEach((titleKey) => {
    addCandidates(candidates, index.exactTitleCandidates.get(titleKey));
  });
  getMangaTitleMergeFuzzyLengths(manga, index.options).forEach((titleLength) => {
    addCandidates(candidates, index.fuzzyLengthCandidates.get(titleLength - 1));
    addCandidates(candidates, index.fuzzyLengthCandidates.get(titleLength));
    addCandidates(candidates, index.fuzzyLengthCandidates.get(titleLength + 1));
  });

  return Array.from(candidates).sort((left, right) => (
    (index.candidateIndexes.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (index.candidateIndexes.get(right) ?? Number.MAX_SAFE_INTEGER)
  ));
};
