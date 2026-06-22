type ScraperTagValueSource = {
  tags?: readonly string[] | null;
  tagUrls?: readonly string[] | null;
};

type ScraperTagValuePairs = {
  tags: string[];
  tagUrls: string[];
};

const normalizeValue = (value: unknown): string => String(value ?? "").trim();
const comparisonKey = (value: string): string => value.toLocaleLowerCase();

export const mergeScraperTagValuePairs = (
  ...sources: ScraperTagValueSource[]
): ScraperTagValuePairs => {
  const pairs: Array<{ tag: string; tagUrl: string }> = [];

  sources.forEach((source) => {
    const tags = Array.isArray(source.tags) ? source.tags : [];
    const tagUrls = Array.isArray(source.tagUrls) ? source.tagUrls : [];
    tags.forEach((rawTag, index) => {
      const tag = normalizeValue(rawTag);
      const tagUrl = normalizeValue(tagUrls[index]);
      if (!tag) return;

      const tagKey = comparisonKey(tag);
      const urlKey = comparisonKey(tagUrl);
      const exactMatch = pairs.some((pair) => (
        comparisonKey(pair.tag) === tagKey
        && comparisonKey(pair.tagUrl) === urlKey
      ));
      if (exactMatch) return;

      const sameTagWithoutUrl = pairs.find((pair) => (
        comparisonKey(pair.tag) === tagKey && !pair.tagUrl
      ));
      if (tagUrl && sameTagWithoutUrl) {
        sameTagWithoutUrl.tagUrl = tagUrl;
        return;
      }
      if (!tagUrl && pairs.some((pair) => comparisonKey(pair.tag) === tagKey)) return;
      pairs.push({ tag, tagUrl });
    });
  });

  const hasTagUrls = pairs.some((pair) => Boolean(pair.tagUrl));
  return {
    tags: pairs.map((pair) => pair.tag),
    tagUrls: hasTagUrls ? pairs.map((pair) => pair.tagUrl) : [],
  };
};
