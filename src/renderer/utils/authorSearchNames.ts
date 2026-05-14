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

    const key = name.toLocaleLowerCase();
    if (seenNames.has(key)) {
      return;
    }

    seenNames.add(key);
    names.push(name);
  });

  return names;
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
