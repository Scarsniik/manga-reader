const buildStemKeys = (alias: string): string[] => {
  const tokens = alias.split(" ").filter(Boolean);
  const leadingTokens = tokens.slice(0, 2).join("");
  const compact = alias.replace(/\s+/g, "");
  return Array.from(new Set([
    leadingTokens.length >= 10 ? `tokens:${leadingTokens}` : "",
    compact.length >= 12 ? `compact:${compact.slice(0, 12)}` : "",
  ].filter(Boolean)));
};

export const getVisualTitleStemKeys = (aliases: string[]): string[] => (
  Array.from(new Set(aliases.flatMap(buildStemKeys)))
);

export const haveSharedVisualTitleStem = (
  leftAliases: string[],
  rightAliases: string[],
): boolean => {
  const leftKeys = new Set(getVisualTitleStemKeys(leftAliases));
  return getVisualTitleStemKeys(rightAliases).some((key) => leftKeys.has(key));
};
