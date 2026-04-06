import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { app, net } from "electron";
import {
  JPDB_PARSE_CONCURRENCY,
  JPDB_PARSE_MAX_ATTEMPTS,
  JPDB_PARSE_THROTTLE_MS,
  MANGA_VOCABULARY_SCHEMA_VERSION,
} from "./constants";
import {
  delay,
  getMangaOcrFilePath,
  getMangaVocabularyFilePath,
  mapWithConcurrency,
  normalizeVocabularyMode,
  writeJsonFileAtomically,
} from "./helpers";
import { ocrRuntimeState } from "./state";
import type {
  JpdbParseResult,
  JpdbParseToken,
  MangaOcrFile,
  MangaVocabularyFile,
  MangaVocabularyMode,
  MangaVocabularyStatus,
} from "./types";

function buildEmptyMangaVocabularyStatus(mangaPath: string): MangaVocabularyStatus {
  return {
    exists: false,
    filePath: getMangaVocabularyFilePath(mangaPath),
    mode: null,
    extractedAt: undefined,
    allTokens: 0,
    uniqueTokens: 0,
    outputTokens: 0,
  };
}

export function getMangaVocabularyStatusSnapshot(mangaPath: string, file?: MangaVocabularyFile | null): MangaVocabularyStatus {
  if (!file) {
    return buildEmptyMangaVocabularyStatus(mangaPath);
  }

  return {
    exists: true,
    filePath: getMangaVocabularyFilePath(mangaPath),
    mode: file.source?.mode === "all" ? "all" : "unique",
    extractedAt: file.source?.extractedAt,
    allTokens: Number(file.counts?.allTokens || 0),
    uniqueTokens: Number(file.counts?.uniqueTokens || 0),
    outputTokens: Number(file.counts?.outputTokens || 0),
  };
}

export async function readMangaVocabularyFile(mangaPath: string): Promise<MangaVocabularyFile | null> {
  const targetPath = getMangaVocabularyFilePath(mangaPath);

  try {
    const raw = await fs.readFile(targetPath, "utf-8");
    const parsed = JSON.parse(raw) as MangaVocabularyFile;
    const normalizedTokens = Array.isArray(parsed?.tokens)
      ? parsed.tokens.filter((token): token is string => typeof token === "string" && token.length > 0)
      : [];

    return {
      version: parsed?.version || MANGA_VOCABULARY_SCHEMA_VERSION,
      manga: {
        id: String(parsed?.manga?.id || path.basename(mangaPath)),
        title: String(parsed?.manga?.title || path.basename(mangaPath)),
        rootPath: mangaPath,
      },
      source: {
        mode: parsed?.source?.mode === "all" ? "all" : "unique",
        extractedAt: String(parsed?.source?.extractedAt || new Date(0).toISOString()),
        ocrFilePath: String(parsed?.source?.ocrFilePath || getMangaOcrFilePath(mangaPath)),
        ocrUpdatedAt: parsed?.source?.ocrUpdatedAt,
        phraseCount: Number(parsed?.source?.phraseCount || 0),
        processedPages: Number(parsed?.source?.processedPages || 0),
        failedPages: Number(parsed?.source?.failedPages || 0),
      },
      counts: {
        allTokens: Number(parsed?.counts?.allTokens || normalizedTokens.length),
        uniqueTokens: Number(parsed?.counts?.uniqueTokens || new Set(normalizedTokens).size),
        outputTokens: Number(parsed?.counts?.outputTokens || normalizedTokens.length),
      },
      tokens: normalizedTokens,
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeMangaVocabularyFile(mangaPath: string, file: MangaVocabularyFile) {
  const targetPath = getMangaVocabularyFilePath(mangaPath);
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  const nextFile: MangaVocabularyFile = {
    ...file,
    version: MANGA_VOCABULARY_SCHEMA_VERSION,
    manga: {
      ...(file?.manga || {}),
      rootPath: mangaPath,
    },
    tokens: Array.isArray(file?.tokens)
      ? file.tokens.filter((token): token is string => typeof token === "string" && token.length > 0)
      : [],
  };
  const serialized = JSON.stringify(nextFile, null, 2);

  await writeJsonFileAtomically(targetPath, tempPath, serialized);
  return nextFile;
}

function getJpdbTokenSurfaceFromText(text: string, token: JpdbParseToken): string {
  const position = token?.[1];
  const length = token?.[2];

  if (typeof position !== "number" || typeof length !== "number" || length <= 0) {
    return "";
  }

  return text.slice(position, position + length);
}

async function parseTextWithJpdbInMain(text: string, apiKey: string): Promise<JpdbParseResult> {
  await app.whenReady();

  const body = JSON.stringify({
    text,
    token_fields: ["vocabulary_index", "position", "length", "furigana"],
    position_length_encoding: "utf16",
    vocabulary_fields: ["vid", "sid", "rid", "spelling", "reading", "frequency_rank", "meanings", "card_level", "card_state"],
  });

  let releaseQueue = () => {};
  const previousQueue = ocrRuntimeState.jpdbParseQueue;
  ocrRuntimeState.jpdbParseQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previousQueue;

  try {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= JPDB_PARSE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await net.fetch("https://jpdb.io/api/v1/parse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body,
        });

        if (!response.ok) {
          const details = await response.text();
          throw new Error(`JPDB API error ${response.status}: ${details}`);
        }

        return await response.json() as JpdbParseResult;
      } catch (error: any) {
        lastError = error;
        const message = String(error?.message || error || "");
        const isApiResponseError = message.includes("JPDB API error");
        const isLastAttempt = attempt >= JPDB_PARSE_MAX_ATTEMPTS;

        if (isApiResponseError || isLastAttempt) {
          break;
        }

        await delay(700 * attempt);
      }
    }

    throw new Error(String(lastError && (lastError as any).message ? (lastError as any).message : lastError || "JPDB network error"));
  } finally {
    await delay(JPDB_PARSE_THROTTLE_MS);
    releaseQueue();
  }
}

function extractTokenLabelsFromParse(text: string, parseResult: JpdbParseResult): string[] {
  if (!Array.isArray(parseResult?.tokens)) {
    return [];
  }

  return parseResult.tokens
    .map((token) => getJpdbTokenSurfaceFromText(text, token))
    .filter((surface) => surface.length > 0);
}

function collectTextsFromMangaOcrFile(file: MangaOcrFile): { phrases: string[]; processedPages: number } {
  const pageEntries = Object.values(file.pages || {})
    .filter((entry) => entry.status === "done")
    .sort((left, right) => {
      const pageNumberDelta = Number(left.pageIndex || 0) - Number(right.pageIndex || 0);
      if (pageNumberDelta !== 0) {
        return pageNumberDelta;
      }
      return String(left.fileName || "").localeCompare(String(right.fileName || ""));
    });

  const phrases = pageEntries.flatMap((entry) => {
    const boxes = [
      ...(Array.isArray(entry.boxes) ? entry.boxes : []),
      ...(Array.isArray(entry.manualBoxes) ? entry.manualBoxes : []),
    ];

    return boxes
      .map((box) => (typeof box?.text === "string" ? box.text.trim() : ""))
      .filter((text) => text.length > 0);
  });

  return {
    phrases,
    processedPages: pageEntries.length,
  };
}

export async function buildVocabularyFileFromOcr(
  manga: any,
  ocrFile: MangaOcrFile,
  mode: MangaVocabularyMode,
  apiKey: string,
) {
  const { phrases, processedPages } = collectTextsFromMangaOcrFile(ocrFile);

  if (phrases.length === 0) {
    throw new Error("Aucune phrase OCR exploitable n'a ete trouvee pour ce manga.");
  }

  const parseCache = new Map<string, Promise<string[]>>();
  const skippedPhraseErrors: string[] = [];
  const tokenLists = await mapWithConcurrency(phrases, JPDB_PARSE_CONCURRENCY, async (phrase) => {
    const cached = parseCache.get(phrase);
    if (cached) {
      return cached;
    }

    const request = parseTextWithJpdbInMain(phrase, apiKey)
      .then((parseResult) => extractTokenLabelsFromParse(phrase, parseResult))
      .catch((error: any) => {
        const message = String(error?.message || error);
        if (message.includes("JPDB API error")) {
          throw new Error(`JPDB parse impossible pour "${phrase.slice(0, 40)}": ${message}`);
        }

        console.warn("[jpdb] Parse skipped after retries", {
          phrasePreview: phrase.slice(0, 80),
          error: message,
        });
        skippedPhraseErrors.push(`${phrase.slice(0, 40)} -> ${message}`);
        return [];
      });

    parseCache.set(phrase, request);
    return request;
  });

  const allTokens = tokenLists.flat();
  const uniqueTokens = Array.from(new Set(allTokens));
  const outputTokens = mode === "all" ? allTokens : uniqueTokens;

  if (outputTokens.length === 0) {
    if (skippedPhraseErrors.length > 0) {
      throw new Error(`JPDB indisponible pendant l'extraction. Exemple: ${skippedPhraseErrors[0]}`);
    }
    throw new Error("JPDB n'a retourne aucun token exploitable pour ce manga.");
  }

  return {
    version: MANGA_VOCABULARY_SCHEMA_VERSION,
    manga: {
      id: String(manga.id),
      title: String(manga.title || path.basename(manga.path)),
      rootPath: manga.path,
    },
    source: {
      mode,
      extractedAt: new Date().toISOString(),
      ocrFilePath: getMangaOcrFilePath(manga.path),
      ocrUpdatedAt: ocrFile.progress?.updatedAt,
      phraseCount: phrases.length,
      processedPages,
      failedPages: Number(ocrFile.progress?.failedPages || 0),
    },
    counts: {
      allTokens: allTokens.length,
      uniqueTokens: uniqueTokens.length,
      outputTokens: outputTokens.length,
    },
    tokens: outputTokens,
  } as MangaVocabularyFile;
}

export async function readMangaVocabularyForUi(mangaPath: string) {
  const file = await readMangaVocabularyFile(mangaPath);
  const status = getMangaVocabularyStatusSnapshot(mangaPath, file);
  const tokens = Array.isArray(file?.tokens) ? file.tokens : [];
  return {
    ...status,
    tokens,
    csv: tokens.join(","),
    phraseCount: Number(file?.source?.phraseCount || 0),
    processedPages: Number(file?.source?.processedPages || 0),
    failedPages: Number(file?.source?.failedPages || 0),
    ocrFilePath: file?.source?.ocrFilePath || getMangaOcrFilePath(mangaPath),
    ocrUpdatedAt: file?.source?.ocrUpdatedAt,
  };
}

export { normalizeVocabularyMode };
