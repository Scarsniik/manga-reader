const KANA_PATTERN = /[\u3040-\u309f\u30a0-\u30ff\uff66-\uff9f]/u;
const KANJI_PATTERN = /\p{Script=Han}/u;
const SMALL_TSU = "っ";
const PROLONGED_SOUND_MARK = "ー";

const DIGRAPH_ROMAJI: Record<string, string> = {
  きゃ: "kya",
  きゅ: "kyu",
  きょ: "kyo",
  ぎゃ: "gya",
  ぎゅ: "gyu",
  ぎょ: "gyo",
  しゃ: "sha",
  しゅ: "shu",
  しょ: "sho",
  じゃ: "ja",
  じゅ: "ju",
  じょ: "jo",
  ちゃ: "cha",
  ちゅ: "chu",
  ちょ: "cho",
  ぢゃ: "ja",
  ぢゅ: "ju",
  ぢょ: "jo",
  にゃ: "nya",
  にゅ: "nyu",
  にょ: "nyo",
  ひゃ: "hya",
  ひゅ: "hyu",
  ひょ: "hyo",
  びゃ: "bya",
  びゅ: "byu",
  びょ: "byo",
  ぴゃ: "pya",
  ぴゅ: "pyu",
  ぴょ: "pyo",
  みゃ: "mya",
  みゅ: "myu",
  みょ: "myo",
  りゃ: "rya",
  りゅ: "ryu",
  りょ: "ryo",
  いぇ: "ye",
  うぃ: "wi",
  うぇ: "we",
  うぉ: "wo",
  ゔぁ: "va",
  ゔぃ: "vi",
  ゔぇ: "ve",
  ゔぉ: "vo",
  ゔゅ: "vyu",
  しぇ: "she",
  じぇ: "je",
  ちぇ: "che",
  つぁ: "tsa",
  つぃ: "tsi",
  つぇ: "tse",
  つぉ: "tso",
  てぃ: "ti",
  てゅ: "tyu",
  でぃ: "di",
  でゅ: "dyu",
  とぅ: "tu",
  どぅ: "du",
  ふぁ: "fa",
  ふぃ: "fi",
  ふぇ: "fe",
  ふぉ: "fo",
  ふゅ: "fyu",
  くぁ: "kwa",
  くぃ: "kwi",
  くぇ: "kwe",
  くぉ: "kwo",
  ぐぁ: "gwa",
  ぐぃ: "gwi",
  ぐぇ: "gwe",
  ぐぉ: "gwo",
  すぃ: "si",
  ずぃ: "zi",
};

const MORA_ROMAJI: Record<string, string> = {
  あ: "a",
  い: "i",
  う: "u",
  え: "e",
  お: "o",
  か: "ka",
  き: "ki",
  く: "ku",
  け: "ke",
  こ: "ko",
  さ: "sa",
  し: "shi",
  す: "su",
  せ: "se",
  そ: "so",
  た: "ta",
  ち: "chi",
  つ: "tsu",
  て: "te",
  と: "to",
  な: "na",
  に: "ni",
  ぬ: "nu",
  ね: "ne",
  の: "no",
  は: "ha",
  ひ: "hi",
  ふ: "fu",
  へ: "he",
  ほ: "ho",
  ま: "ma",
  み: "mi",
  む: "mu",
  め: "me",
  も: "mo",
  や: "ya",
  ゆ: "yu",
  よ: "yo",
  ら: "ra",
  り: "ri",
  る: "ru",
  れ: "re",
  ろ: "ro",
  わ: "wa",
  ゐ: "wi",
  ゑ: "we",
  を: "wo",
  ん: "n",
  が: "ga",
  ぎ: "gi",
  ぐ: "gu",
  げ: "ge",
  ご: "go",
  ざ: "za",
  じ: "ji",
  ず: "zu",
  ぜ: "ze",
  ぞ: "zo",
  だ: "da",
  ぢ: "ji",
  づ: "zu",
  で: "de",
  ど: "do",
  ば: "ba",
  び: "bi",
  ぶ: "bu",
  べ: "be",
  ぼ: "bo",
  ぱ: "pa",
  ぴ: "pi",
  ぷ: "pu",
  ぺ: "pe",
  ぽ: "po",
  ゔ: "vu",
  ゕ: "ka",
  ゖ: "ke",
  ゎ: "wa",
  ぁ: "a",
  ぃ: "i",
  ぅ: "u",
  ぇ: "e",
  ぉ: "o",
  ゃ: "ya",
  ゅ: "yu",
  ょ: "yo",
};

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();

  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
};

const katakanaCharToHiragana = (char: string): string => {
  const codePoint = char.codePointAt(0);
  if (!codePoint || codePoint < 0x30a1 || codePoint > 0x30f6) {
    return char;
  }

  return String.fromCodePoint(codePoint - 0x60);
};

const normalizeKanaWidth = (value: string): string => (
  value.normalize("NFKC")
);

export const hasJapaneseKana = (value: string): boolean => (
  KANA_PATTERN.test(value)
);

export const hasJapaneseKanji = (value: string): boolean => (
  KANJI_PATTERN.test(value)
);

export const convertJapaneseKanaToHiragana = (value: string): string => (
  Array.from(normalizeKanaWidth(value)).map(katakanaCharToHiragana).join("")
);

const getLastRomanVowel = (value: string): string => {
  const match = value.match(/[aeiou](?!.*[aeiou])/);

  return match?.[0] ?? "";
};

const getSokuonPrefix = (romaji: string): string => {
  const firstCharacter = romaji[0] ?? "";
  if (!firstCharacter || /[aeioun]/.test(firstCharacter)) {
    return "";
  }

  return firstCharacter;
};

const romanizeHiragana = (hiragana: string): string => {
  const characters = Array.from(hiragana);
  let result = "";
  let hasPendingSokuon = false;

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];

    if (character === SMALL_TSU) {
      hasPendingSokuon = true;
      continue;
    }

    if (character === PROLONGED_SOUND_MARK) {
      result += getLastRomanVowel(result);
      continue;
    }

    const digraph = `${character}${characters[index + 1] ?? ""}`;
    const romaji = DIGRAPH_ROMAJI[digraph] ?? MORA_ROMAJI[character] ?? character;
    if (DIGRAPH_ROMAJI[digraph]) {
      index += 1;
    }

    if (hasPendingSokuon) {
      result += getSokuonPrefix(romaji);
      hasPendingSokuon = false;
    }

    result += romaji;
  }

  return hasPendingSokuon ? `${result}tsu` : result;
};

export const romanizeJapaneseKana = (value: string): string => (
  romanizeHiragana(convertJapaneseKanaToHiragana(value))
);

const foldLongVowels = (value: string): string => (
  value
    .replace(/ou/g, "o")
    .replace(/aa/g, "a")
    .replace(/ii/g, "i")
    .replace(/uu/g, "u")
    .replace(/ee/g, "e")
    .replace(/oo/g, "o")
);

export const getJapaneseRomajiVariants = (value: string): string[] => {
  if (!hasJapaneseKana(value) || hasJapaneseKanji(value)) {
    return [];
  }

  const romanized = romanizeJapaneseKana(value);
  const foldedLongVowels = foldLongVowels(romanized);

  return uniqueValues([
    romanized,
    foldedLongVowels,
  ]);
};
