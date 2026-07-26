const normalizeTitleInputText = (value: string): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const uniqueTitles = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.map(normalizeTitleInputText).filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const escapeRegex = (value: string): string => (
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
);

export const buildMangaCorrespondenceTitleInput = (
  primaryTitle: string,
  alternativeTitles: string[],
): string => (
  uniqueTitles([primaryTitle, ...alternativeTitles]).join(", ")
);

export const parseMangaCorrespondenceTitleInput = (
  value: string,
  initialTitles: string[] = [],
): string[] => {
  const normalizedInitialTitles = uniqueTitles(initialTitles);
  const normalizedValue = normalizeTitleInputText(value);
  if (
    normalizedValue
    && normalizedValue === normalizedInitialTitles.join(", ")
  ) {
    return normalizedInitialTitles;
  }

  const protectedTitles = normalizedInitialTitles
    .filter((title) => /[,;\n]/u.test(title))
    .sort((left, right) => right.length - left.length);
  const placeholders = new Map<string, string>();
  let protectedValue = normalizedValue;
  protectedTitles.forEach((title, index) => {
    const placeholder = `\uE000${index}\uE001`;
    const pattern = new RegExp(escapeRegex(title), "giu");
    if (!pattern.test(protectedValue)) return;
    placeholders.set(placeholder, title);
    protectedValue = protectedValue.replace(pattern, placeholder);
  });

  return uniqueTitles(
    protectedValue
      .split(/[,;\n]+/gu)
      .map((entry) => {
        let restored = entry;
        placeholders.forEach((title, placeholder) => {
          restored = restored.split(placeholder).join(title);
        });
        return restored;
      }),
  );
};
