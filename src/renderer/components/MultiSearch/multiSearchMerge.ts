import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import {
  canMergeMultiSearchSourceTitles,
  getMultiSearchTitleMergeExactKeys,
  getMultiSearchTitleMergeFuzzyLengths,
} from "@/renderer/components/MultiSearch/multiSearchTitleMerge";
import { UNKNOWN_MULTI_SEARCH_VALUE } from "@/renderer/components/MultiSearch/multiSearchConstants";

export type MultiSearchMergeState = {
  groups: MultiSearchMergedResult[];
  detailUrlGroups: Map<string, MultiSearchMergedResult>;
  titleKeyGroups: Map<string, Set<MultiSearchMergedResult>>;
  fuzzyLengthGroups: Map<number, Set<MultiSearchMergedResult>>;
  groupIndexes: WeakMap<MultiSearchMergedResult, number>;
};

export const createMultiSearchMergeState = (
  groups: MultiSearchMergedResult[] = [],
): MultiSearchMergeState => {
  const state: MultiSearchMergeState = {
    groups,
    detailUrlGroups: new Map<string, MultiSearchMergedResult>(),
    titleKeyGroups: new Map<string, Set<MultiSearchMergedResult>>(),
    fuzzyLengthGroups: new Map<number, Set<MultiSearchMergedResult>>(),
    groupIndexes: new WeakMap<MultiSearchMergedResult, number>(),
  };

  groups.forEach((group, index) => {
    state.groupIndexes.set(group, index);
    group.sources.forEach((source) => indexGroupSource(state, group, source));
  });

  return state;
};

const shouldMergeSourceIntoGroup = (
  source: MultiSearchSourceResult,
  group: MultiSearchMergedResult,
): boolean => {
  const sourceDetailUrl = getSourceDetailUrlKey(source);

  return group.sources.some((groupSource) => {
    if (sourceDetailUrl && getSourceDetailUrlKey(groupSource) === sourceDetailUrl) {
      return true;
    }

    return canMergeMultiSearchSourceTitles(source, groupSource);
  });
};

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const getSourceLanguageValuesForMerge = (source: MultiSearchSourceResult): string[] => (
  source.sourceLanguageCodes.length ? source.sourceLanguageCodes : [UNKNOWN_MULTI_SEARCH_VALUE]
);

const normalizeTextKey = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase()
);

const getSourceDetailUrlKey = (source: MultiSearchSourceResult): string => (
  normalizeScraperViewHistorySourceUrl(source.result.detailUrl)
);

const getSourceIdentityKey = (source: MultiSearchSourceResult): string => {
  const detailUrl = getSourceDetailUrlKey(source);
  if (detailUrl) {
    return `${source.scraper.id}::${detailUrl}`;
  }

  return [
    source.scraper.id,
    normalizeTextKey(source.result.title),
    normalizeScraperViewHistorySourceUrl(source.result.thumbnailUrl),
  ].join("::");
};

const buildMergedResultId = (source: MultiSearchSourceResult): string => (
  `${source.scraper.id}::${getSourceDetailUrlKey(source) || source.result.title}`
);

const buildMergedResult = (source: MultiSearchSourceResult): MultiSearchMergedResult => ({
  id: buildMergedResultId(source),
  title: source.result.title,
  coverUrl: source.result.thumbnailUrl,
  summary: source.result.summary,
  pageCount: source.result.pageCount,
  sources: [source],
  sourceLanguageCodes: uniqueValues(getSourceLanguageValuesForMerge(source)),
  tentativeAuthorNames: uniqueValues(source.tentativeAuthorNames),
  contentTypes: uniqueValues(source.contentTypes),
});

const addGroupToIndex = <Key,>(
  index: Map<Key, Set<MultiSearchMergedResult>>,
  key: Key,
  group: MultiSearchMergedResult,
): void => {
  const groups = index.get(key);
  if (groups) {
    groups.add(group);
    return;
  }

  index.set(key, new Set<MultiSearchMergedResult>([group]));
};

const indexGroupSource = (
  state: MultiSearchMergeState,
  group: MultiSearchMergedResult,
  source: MultiSearchSourceResult,
): void => {
  const detailUrl = getSourceDetailUrlKey(source);
  if (detailUrl) {
    state.detailUrlGroups.set(detailUrl, group);
  }

  getMultiSearchTitleMergeExactKeys(source).forEach((titleKey) => {
    addGroupToIndex(state.titleKeyGroups, titleKey, group);
  });

  getMultiSearchTitleMergeFuzzyLengths(source).forEach((titleLength) => {
    addGroupToIndex(state.fuzzyLengthGroups, titleLength, group);
  });
};

const addCandidateGroup = (
  candidates: MultiSearchMergedResult[],
  seenGroups: Set<MultiSearchMergedResult>,
  group: MultiSearchMergedResult | undefined,
): void => {
  if (!group || seenGroups.has(group)) {
    return;
  }

  seenGroups.add(group);
  candidates.push(group);
};

const addCandidateGroupSet = (
  candidates: MultiSearchMergedResult[],
  seenGroups: Set<MultiSearchMergedResult>,
  groups: Set<MultiSearchMergedResult> | undefined,
): void => {
  groups?.forEach((group) => addCandidateGroup(candidates, seenGroups, group));
};

const getGroupIndex = (
  state: MultiSearchMergeState,
  group: MultiSearchMergedResult,
): number => (
  state.groupIndexes.get(group) ?? Number.MAX_SAFE_INTEGER
);

const collectCandidateGroups = (
  state: MultiSearchMergeState,
  source: MultiSearchSourceResult,
): MultiSearchMergedResult[] => {
  const candidates: MultiSearchMergedResult[] = [];
  const seenGroups = new Set<MultiSearchMergedResult>();

  addCandidateGroup(candidates, seenGroups, state.detailUrlGroups.get(getSourceDetailUrlKey(source)));

  getMultiSearchTitleMergeExactKeys(source).forEach((titleKey) => {
    addCandidateGroupSet(candidates, seenGroups, state.titleKeyGroups.get(titleKey));
  });

  getMultiSearchTitleMergeFuzzyLengths(source).forEach((titleLength) => {
    addCandidateGroupSet(candidates, seenGroups, state.fuzzyLengthGroups.get(titleLength - 1));
    addCandidateGroupSet(candidates, seenGroups, state.fuzzyLengthGroups.get(titleLength));
    addCandidateGroupSet(candidates, seenGroups, state.fuzzyLengthGroups.get(titleLength + 1));
  });

  return candidates.sort((left, right) => getGroupIndex(state, left) - getGroupIndex(state, right));
};

const appendSourceToGroup = (
  group: MultiSearchMergedResult,
  source: MultiSearchSourceResult,
): boolean => {
  const sourceIdentityKey = getSourceIdentityKey(source);
  if (group.sources.some((groupSource) => getSourceIdentityKey(groupSource) === sourceIdentityKey)) {
    return false;
  }

  group.sources.push(source);
  group.sourceLanguageCodes = uniqueValues([
    ...group.sourceLanguageCodes,
    ...getSourceLanguageValuesForMerge(source),
  ]);
  group.tentativeAuthorNames = uniqueValues([
    ...group.tentativeAuthorNames,
    ...source.tentativeAuthorNames,
  ]);
  group.contentTypes = uniqueValues([
    ...group.contentTypes,
    ...source.contentTypes,
  ]);
  if (!group.coverUrl && source.result.thumbnailUrl) {
    group.coverUrl = source.result.thumbnailUrl;
  }
  if (!group.summary && source.result.summary) {
    group.summary = source.result.summary;
  }
  if (!group.pageCount && source.result.pageCount) {
    group.pageCount = source.result.pageCount;
  }

  return true;
};

export const mergeMultiSearchSourceIntoState = (
  state: MultiSearchMergeState,
  source: MultiSearchSourceResult,
): void => {
  const group = collectCandidateGroups(state, source)
    .find((candidate) => shouldMergeSourceIntoGroup(source, candidate));

  if (group) {
    if (appendSourceToGroup(group, source)) {
      indexGroupSource(state, group, source);
    }
    return;
  }

  const newGroup = buildMergedResult(source);
  state.groupIndexes.set(newGroup, state.groups.length);
  state.groups.push(newGroup);
  indexGroupSource(state, newGroup, source);
};

export const mergeMultiSearchSourceIntoGroups = (
  groups: MultiSearchMergedResult[],
  source: MultiSearchSourceResult,
): void => {
  const group = groups.find((candidate) => shouldMergeSourceIntoGroup(source, candidate));

  if (group) {
    appendSourceToGroup(group, source);
    return;
  }

  groups.push(buildMergedResult(source));
};

export const sortMultiSearchMergedResults = (
  groups: MultiSearchMergedResult[],
): MultiSearchMergedResult[] => (
  [...groups].sort((left, right) => {
    const sourceCountCompare = right.sources.length - left.sources.length;
    if (sourceCountCompare !== 0) {
      return sourceCountCompare;
    }

    return left.title.localeCompare(right.title);
  })
);

export const mergeMultiSearchResults = (
  sources: MultiSearchSourceResult[],
): MultiSearchMergedResult[] => {
  const state = createMultiSearchMergeState();

  sources.forEach((source) => mergeMultiSearchSourceIntoState(state, source));
  return sortMultiSearchMergedResults(state.groups);
};
