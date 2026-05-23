const MIN_PHONETIC_SOURCE_LENGTH = 12;
const MIN_PHONETIC_KEY_LENGTH = 8;

const isLooseRomajiCandidate = (value: string): boolean => (
  /^[a-z0-9 ]+$/u.test(value)
);

const normalizeLooseRomajiLetters = (value: string): string => (
  value
    .replace(/ch/g, "t")
    .replace(/ts/g, "t")
    .replace(/sh/g, "s")
    .replace(/ph/g, "f")
    .replace(/c(?=[aou])/g, "k")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/l/g, "r")
    .replace(/v/g, "b")
);

export const getLooseRomajiPhoneticKey = (normalizedTitle: string): string => {
  if (!isLooseRomajiCandidate(normalizedTitle)) {
    return "";
  }

  const compactValue = normalizedTitle.replace(/\s+/g, "");
  if (compactValue.length < MIN_PHONETIC_SOURCE_LENGTH) {
    return "";
  }

  const phoneticKey = normalizeLooseRomajiLetters(compactValue)
    .replace(/[aeiou]+/g, "")
    .replace(/(.)\1+/g, "$1");

  return phoneticKey.length >= MIN_PHONETIC_KEY_LENGTH ? `romaji ${phoneticKey}` : "";
};
