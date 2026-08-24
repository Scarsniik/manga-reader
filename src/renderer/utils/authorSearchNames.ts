import type { ScraperAuthorFeatureConfig } from "@/shared/scraper";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";

const normalizeAuthorSearchName = (value: string | null | undefined): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const isNavigationTarget = (value: string): boolean => (
  /^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(value)
  || value.startsWith("/")
  || value.startsWith("./")
  || value.startsWith("../")
  || value.startsWith("?")
  || value.startsWith("#")
);

export const buildUniqueAuthorSearchNames = (
  values: Array<string | null | undefined>,
): string[] => {
  const seenNames = new Set<string>();
  const names: string[] = [];

  values.forEach((value) => {
    const name = normalizeAuthorSearchName(value);
    if (!name || isNavigationTarget(name)) {
      return;
    }

    const key = normalizeFuzzyText(name);
    if (seenNames.has(key)) {
      return;
    }

    seenNames.add(key);
    names.push(name);
  });

  return names;
};

const buildAuthorSlug = (value: string, separator: "-" | "_" | ""): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, separator)
  .replace(new RegExp(`^${separator || "\\s"}+|${separator || "\\s"}+$`, "g"), "");

export const buildAuthorModuleSearchValues = (
  config: Pick<ScraperAuthorFeatureConfig, "testValue" | "urlTemplate">,
  authorName: string,
): string[] => {
  const hyphenSlug = buildAuthorSlug(authorName, "-");
  const underscoreSlug = buildAuthorSlug(authorName, "_");
  const compactSlug = buildAuthorSlug(authorName, "");
  const testPrefix = config.testValue?.match(/^([\p{L}\p{N}_-]+):/u)?.[1];

  return buildUniqueAuthorSearchNames(testPrefix
    ? [`${testPrefix}:${underscoreSlug}`, `${testPrefix}:${hyphenSlug}`, authorName, underscoreSlug, hyphenSlug, compactSlug]
    : /\/artists?\//i.test(config.urlTemplate ?? "")
      ? [hyphenSlug, underscoreSlug, authorName, compactSlug]
      : [authorName, hyphenSlug, underscoreSlug, compactSlug]);
};

export const formatAuthorMultiSearchQuery = (
  values: Array<string | null | undefined>,
): string => buildUniqueAuthorSearchNames(values).join(", ");

export const formatAuthorDisplayName = (value: string | null | undefined): string => {
  const name = buildUniqueAuthorSearchNames([value])[0] ?? "";

  return name.replace(
    /(^|[^\p{L}\p{N}])(\p{L})/gu,
    (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase()}`,
  );
};
