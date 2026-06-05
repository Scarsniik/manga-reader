const FUZZY_TITLE_MAX_EDIT_DISTANCE = 1;
const FUZZY_TITLE_MIN_CHARACTERS = 25;
const FUZZY_TITLE_MIN_TOKENS = 5;

export const isFuzzyTitleCandidate = (value: string): boolean => {
  const tokens = value.split(" ").filter(Boolean);

  return Array.from(value).length >= FUZZY_TITLE_MIN_CHARACTERS
    && tokens.length >= FUZZY_TITLE_MIN_TOKENS;
};

export const hasSingleEditDifference = (left: string, right: string): boolean => {
  if (left === right) {
    return false;
  }

  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  const lengthDifference = Math.abs(leftCharacters.length - rightCharacters.length);
  if (lengthDifference > FUZZY_TITLE_MAX_EDIT_DISTANCE) {
    return false;
  }

  if (leftCharacters.length === rightCharacters.length) {
    let differences = 0;

    for (let index = 0; index < leftCharacters.length; index += 1) {
      if (leftCharacters[index] !== rightCharacters[index]) {
        differences += 1;
      }

      if (differences > FUZZY_TITLE_MAX_EDIT_DISTANCE) {
        return false;
      }
    }

    return differences === FUZZY_TITLE_MAX_EDIT_DISTANCE;
  }

  const shorter = leftCharacters.length < rightCharacters.length ? leftCharacters : rightCharacters;
  const longer = leftCharacters.length < rightCharacters.length ? rightCharacters : leftCharacters;
  let shorterIndex = 0;
  let longerIndex = 0;
  let differences = 0;

  while (shorterIndex < shorter.length && longerIndex < longer.length) {
    if (shorter[shorterIndex] === longer[longerIndex]) {
      shorterIndex += 1;
      longerIndex += 1;
      continue;
    }

    differences += 1;
    if (differences > FUZZY_TITLE_MAX_EDIT_DISTANCE) {
      return false;
    }

    longerIndex += 1;
  }

  return true;
};
