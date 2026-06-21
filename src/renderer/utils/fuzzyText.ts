export const normalizeFuzzyText = (value: string): string => (
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
);

export const getFuzzyTextTokens = (value: string): string[] => (
  normalizeFuzzyText(value)
    .split(" ")
    .filter(Boolean)
);

const getLevenshteinDistance = (leftValue: string, rightValue: string): number => {
  const left = Array.from(leftValue);
  const right = Array.from(rightValue);

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  left.forEach((leftChar, leftIndex) => {
    const currentRow = [leftIndex + 1];

    right.forEach((rightChar, rightIndex) => {
      const insertion = currentRow[rightIndex] + 1;
      const deletion = previousRow[rightIndex + 1] + 1;
      const substitution = previousRow[rightIndex] + (leftChar === rightChar ? 0 : 1);
      currentRow.push(Math.min(insertion, deletion, substitution));
    });

    previousRow = currentRow;
  });

  return previousRow[right.length];
};

type FuzzyTextMatchOptions = {
  ignoredTokens?: ReadonlySet<string>;
};

export const getFuzzyTextMatchScore = (
  sourceValue: string,
  candidateValue: string,
  options: FuzzyTextMatchOptions = {},
): number => {
  const source = normalizeFuzzyText(sourceValue);
  const candidate = normalizeFuzzyText(candidateValue);

  if (!source || !candidate) {
    return 0;
  }

  if (source === candidate) {
    return 1000;
  }

  const sourceTokenValues = getFuzzyTextTokens(source)
    .filter((token) => !options.ignoredTokens?.has(token));
  const candidateTokenValues = getFuzzyTextTokens(candidate)
    .filter((token) => !options.ignoredTokens?.has(token));
  const comparableSource = sourceTokenValues.join(" ");
  const comparableCandidate = candidateTokenValues.join(" ");
  if (!comparableSource || !comparableCandidate) {
    return 0;
  }

  const sourceTokens = new Set(sourceTokenValues);
  const candidateTokens = new Set(candidateTokenValues);
  const sharedTokenCount = Array.from(sourceTokens).filter((token) => candidateTokens.has(token)).length;
  const tokenScore = sharedTokenCount
    ? (sharedTokenCount / Math.max(sourceTokens.size, candidateTokens.size)) * 600
    : 0;
  const containsScore = comparableSource.includes(comparableCandidate)
    || comparableCandidate.includes(comparableSource)
    ? (
      Math.min(comparableSource.length, comparableCandidate.length)
      / Math.max(comparableSource.length, comparableCandidate.length)
    ) * 800
    : 0;
  const distance = getLevenshteinDistance(comparableSource, comparableCandidate);
  const distanceScore = (
    1 - (distance / Math.max(comparableSource.length, comparableCandidate.length))
  ) * 500;

  return Math.max(tokenScore, containsScore, distanceScore);
};
