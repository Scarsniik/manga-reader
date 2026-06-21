export const normalizeFuzzyText = (value: string): string => (
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
);

const getMatchTokens = (value: string): string[] => (
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

export const getFuzzyTextMatchScore = (sourceValue: string, candidateValue: string): number => {
  const source = normalizeFuzzyText(sourceValue);
  const candidate = normalizeFuzzyText(candidateValue);

  if (!source || !candidate) {
    return 0;
  }

  if (source === candidate) {
    return 1000;
  }

  const sourceTokens = new Set(getMatchTokens(source));
  const candidateTokens = new Set(getMatchTokens(candidate));
  const sharedTokenCount = Array.from(sourceTokens).filter((token) => candidateTokens.has(token)).length;
  const tokenScore = sharedTokenCount
    ? (sharedTokenCount / Math.max(sourceTokens.size, candidateTokens.size)) * 600
    : 0;
  const containsScore = source.includes(candidate) || candidate.includes(source)
    ? (Math.min(source.length, candidate.length) / Math.max(source.length, candidate.length)) * 800
    : 0;
  const distance = getLevenshteinDistance(source, candidate);
  const distanceScore = (1 - (distance / Math.max(source.length, candidate.length))) * 500;

  return Math.max(tokenScore, containsScore, distanceScore);
};
