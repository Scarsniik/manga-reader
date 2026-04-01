export type JpdbTokenVocabularyIndex = number | number[] | null;
export type JpdbFuriganaSegment = string | [string, string];
export type JpdbFurigana = JpdbFuriganaSegment[] | null;
export type JpdbToken = [JpdbTokenVocabularyIndex, number, number, JpdbFurigana];
export type JpdbVocab = [number, number, number, string, string, number, string[]];

export type JpdbParseResult = {
  tokens: JpdbToken[];
  vocabulary: JpdbVocab[];
};

export type JpdbVocabularyEntry = {
  vid: number;
  sid: number;
  rid: number;
  spelling: string;
  reading: string;
  frequencyRank: number;
  meanings: string[];
};

export type JpdbRubyPart = {
  text: string;
  reading: string | null;
  hasKanji: boolean;
};

export type JpdbSentenceSegment =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'token';
      index: number;
      surface: string;
      vocabulary: JpdbVocabularyEntry[];
      rubyParts: JpdbRubyPart[];
    };

export type JpdbKanjiDetail = {
  kanji: string;
  reading: string | null;
  segmentText: string;
  segmentReading: string | null;
  isDirectReading: boolean;
};

export type KanjiApiEntry = {
  kanji: string;
  meanings: string[];
  kunReadings: string[];
  onReadings: string[];
};

const KANJI_RE = /\p{Script=Han}/u;
const kanjiApiCache = new Map<string, Promise<KanjiApiEntry | null>>();

export const isKanjiText = (value: string): boolean => KANJI_RE.test(value);

export const getJpdbVocabularyEntry = (entry: JpdbVocab): JpdbVocabularyEntry => ({
  vid: entry[0],
  sid: entry[1],
  rid: entry[2],
  spelling: entry[3],
  reading: entry[4],
  frequencyRank: entry[5],
  meanings: Array.isArray(entry[6]) ? entry[6] : [],
});

export const getJpdbTokenSurface = (text: string, token: JpdbToken): string => {
  const position = token[1];
  const length = token[2];

  if (typeof position !== 'number' || typeof length !== 'number') {
    return '';
  }

  return text.slice(position, position + length);
};

export const getJpdbTokenVocabularyIndexes = (token: JpdbToken): number[] => {
  const rawIndex = token[0];

  if (Array.isArray(rawIndex)) {
    return rawIndex.filter((value): value is number => typeof value === 'number');
  }

  return typeof rawIndex === 'number' ? [rawIndex] : [];
};

export const getJpdbTokenVocabulary = (
  parseResult: JpdbParseResult | null,
  token: JpdbToken
): JpdbVocabularyEntry[] => {
  if (!parseResult) {
    return [];
  }

  return getJpdbTokenVocabularyIndexes(token)
    .map((index) => parseResult.vocabulary[index])
    .filter((entry): entry is JpdbVocab => Array.isArray(entry))
    .map(getJpdbVocabularyEntry);
};

export const getJpdbTokenRubyParts = (
  text: string,
  token: JpdbToken,
  vocabulary: JpdbVocabularyEntry[] = []
): JpdbRubyPart[] => {
  const surface = getJpdbTokenSurface(text, token);
  const furigana = token[3];

  if (Array.isArray(furigana) && furigana.length > 0) {
    const parts = furigana
      .map((segment): JpdbRubyPart | null => {
        if (typeof segment === 'string') {
          return {
            text: segment,
            reading: null,
            hasKanji: isKanjiText(segment),
          };
        }

        if (
          Array.isArray(segment)
          && typeof segment[0] === 'string'
          && typeof segment[1] === 'string'
        ) {
          return {
            text: segment[0],
            reading: segment[1] || null,
            hasKanji: isKanjiText(segment[0]),
          };
        }

        return null;
      })
      .filter((part): part is JpdbRubyPart => !!part && part.text.length > 0);

    const consumedLength = parts.reduce((total, part) => total + part.text.length, 0);
    if (consumedLength < surface.length) {
      const trailingText = surface.slice(consumedLength);
      if (trailingText.length > 0) {
        parts.push({
          text: trailingText,
          reading: null,
          hasKanji: isKanjiText(trailingText),
        });
      }
    }

    return parts;
  }

  if (surface.length === 0) {
    return [];
  }

  const primaryVocabulary = vocabulary[0];
  if (isKanjiText(surface) && primaryVocabulary?.reading && primaryVocabulary.reading !== surface) {
    return [{
      text: surface,
      reading: primaryVocabulary.reading,
      hasKanji: true,
    }];
  }

  return [{
    text: surface,
    reading: null,
    hasKanji: isKanjiText(surface),
  }];
};

export const buildJpdbSentenceSegments = (
  text: string,
  parseResult: JpdbParseResult | null
): JpdbSentenceSegment[] => {
  if (!text) {
    return [];
  }

  if (!parseResult || !Array.isArray(parseResult.tokens) || parseResult.tokens.length === 0) {
    return [{ kind: 'text', text }];
  }

  const segments: JpdbSentenceSegment[] = [];
  let cursor = 0;

  parseResult.tokens.forEach((token, index) => {
    const position = token[1];
    const length = token[2];

    if (typeof position !== 'number' || typeof length !== 'number' || length <= 0) {
      return;
    }

    if (position > cursor) {
      const gap = text.slice(cursor, position);
      if (gap.length > 0) {
        segments.push({
          kind: 'text',
          text: gap,
        });
      }
    }

    const surface = getJpdbTokenSurface(text, token);
    const vocabulary = getJpdbTokenVocabulary(parseResult, token);
    segments.push({
      kind: 'token',
      index,
      surface,
      vocabulary,
      rubyParts: getJpdbTokenRubyParts(text, token, vocabulary),
    });

    cursor = Math.max(cursor, position + length);
  });

  if (cursor < text.length) {
    segments.push({
      kind: 'text',
      text: text.slice(cursor),
    });
  }

  return segments;
};

export const getJpdbKanjiDetails = (
  surface: string,
  rubyParts: JpdbRubyPart[]
): JpdbKanjiDetail[] => {
  const details: JpdbKanjiDetail[] = [];

  rubyParts.forEach((part) => {
    if (!part.hasKanji) {
      return;
    }

    const kanjiChars = Array.from(part.text).filter((char) => isKanjiText(char));
    if (kanjiChars.length === 0) {
      return;
    }

    const isDirectReading = kanjiChars.length === 1 && part.text.length === 1;
    kanjiChars.forEach((kanji) => {
      details.push({
        kanji,
        reading: isDirectReading ? part.reading : null,
        segmentText: part.text,
        segmentReading: part.reading,
        isDirectReading,
      });
    });
  });

  if (details.length > 0) {
    return details;
  }

  return Array.from(surface)
    .filter((char) => isKanjiText(char))
    .map((kanji) => ({
      kanji,
      reading: null,
      segmentText: surface,
      segmentReading: null,
      isDirectReading: false,
    }));
};

export const fetchKanjiApiEntry = async (kanji: string): Promise<KanjiApiEntry | null> => {
  if (!kanji || !isKanjiText(kanji)) {
    return null;
  }

  const cached = kanjiApiCache.get(kanji);
  if (cached) {
    return cached;
  }

  const request = (async (): Promise<KanjiApiEntry | null> => {
    try {
      const response = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(kanji)}`, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }

        throw new Error(`kanjiapi.dev ${response.status}`);
      }

      const payload = await response.json() as {
        kanji?: string;
        meanings?: unknown;
        kun_readings?: unknown;
        on_readings?: unknown;
      };

      return {
        kanji: typeof payload.kanji === 'string' && payload.kanji.length > 0 ? payload.kanji : kanji,
        meanings: Array.isArray(payload.meanings) ? payload.meanings.filter((value): value is string => typeof value === 'string') : [],
        kunReadings: Array.isArray(payload.kun_readings) ? payload.kun_readings.filter((value): value is string => typeof value === 'string') : [],
        onReadings: Array.isArray(payload.on_readings) ? payload.on_readings.filter((value): value is string => typeof value === 'string') : [],
      };
    } catch (error) {
      console.debug('fetchKanjiApiEntry failed:', kanji, error);
      return null;
    }
  })();

  kanjiApiCache.set(kanji, request);
  return request;
};

export const fetchKanjiApiEntries = async (kanjiList: string[]): Promise<Record<string, KanjiApiEntry | null>> => {
  const uniqueKanji = Array.from(new Set(
    kanjiList.filter((value): value is string => typeof value === 'string' && value.length > 0 && isKanjiText(value))
  ));

  if (uniqueKanji.length === 0) {
    return {};
  }

  const entries = await Promise.all(uniqueKanji.map(async (kanji) => [kanji, await fetchKanjiApiEntry(kanji)] as const));
  return Object.fromEntries(entries);
};

export async function parseTextWithJpdb(text: string): Promise<JpdbParseResult> {
  if (!text) throw new Error('text is required');

  // Try to get API key from electron settings via preload API
  const settings: any = typeof window !== 'undefined' && (window as any).api && typeof (window as any).api.getSettings === 'function'
    ? await (window as any).api.getSettings()
    : {};

  const key = settings?.jpdbApiKey;
  if (!key) throw new Error('JPDB API key not configured.');

  const body = {
    text,
    token_fields: ["vocabulary_index", "position", "length", "furigana"],
    position_length_encoding: "utf16",
    vocabulary_fields: ["vid", "sid", "rid", "spelling", "reading", "frequency_rank", "meanings"],
  };

  const resp = await fetch('https://jpdb.io/api/v1/parse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const textResp = await resp.text();
    throw new Error(`JPDB API error ${resp.status}: ${textResp}`);
  }

  const json = await resp.json();
  return json as JpdbParseResult;
}

export type JpdbJa2EnResult = {
  text: string;
  is_truncated?: boolean;
};

export async function translateJaToEn(text: string): Promise<JpdbJa2EnResult> {
  if (!text) throw new Error('text is required');

  // Try to get API key from electron settings via preload API
  const settings: any = typeof window !== 'undefined' && (window as any).api && typeof (window as any).api.getSettings === 'function'
    ? await (window as any).api.getSettings()
    : {};

  const key = settings?.jpdbApiKey;
  if (!key) throw new Error('JPDB API key not configured.');

  const body = { text };

  // Log the body JSON to help diagnose malformed requests (400)
  let resp!: Response;
  try {
    const bodyStr = JSON.stringify(body);
    console.debug('jpdb.translateJaToEn request body:', bodyStr);

    resp = await fetch('https://jpdb.io/api/v1/ja2en', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: bodyStr,
    });

    if (!resp.ok) {
      const textResp = await resp.text();
      throw new Error(`JPDB ja2en API error ${resp.status}: ${textResp}`);
    }

    const json = await resp.json();
    return json as JpdbJa2EnResult;
  } catch (e) {
    console.debug('jpdb.translateJaToEn error building/sending request:', e);
    throw e;
  }
}

