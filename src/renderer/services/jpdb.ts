export type JpdbToken = [number, number, number, any];
export type JpdbVocab = [number, number, number, string, string, number, string[]];

export type JpdbParseResult = {
  tokens: JpdbToken[];
  vocabulary: JpdbVocab[];
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

