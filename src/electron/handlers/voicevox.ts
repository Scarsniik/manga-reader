import {
    DEFAULT_READER_OCR_VOICEVOX_ENABLE_KATAKANA_ENGLISH,
    DEFAULT_READER_OCR_VOICEVOX_INTERROGATIVE_UPSPEAK,
    DEFAULT_READER_OCR_VOICEVOX_OUTPUT_SAMPLING_RATE,
    DEFAULT_READER_OCR_VOICEVOX_OUTPUT_STEREO,
    DEFAULT_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE,
    DEFAULT_READER_OCR_VOICEVOX_POST_PHONEME_LENGTH,
    DEFAULT_READER_OCR_VOICEVOX_PRE_PHONEME_LENGTH,
    DEFAULT_READER_OCR_VOICEVOX_STYLE_ID,
    DEFAULT_READER_OCR_VOICEVOX_VOLUME_SCALE,
    normalizeReaderOcrVoicevoxEnableKatakanaEnglish,
    normalizeReaderOcrVoicevoxInterrogativeUpspeak,
    normalizeReaderOcrVoicevoxIntonationScale,
    normalizeReaderOcrVoicevoxOutputSamplingRate,
    normalizeReaderOcrVoicevoxOutputStereo,
    normalizeReaderOcrVoicevoxPauseLengthScale,
    normalizeReaderOcrVoicevoxPitchScale,
    normalizeReaderOcrVoicevoxPostPhonemeLength,
    normalizeReaderOcrVoicevoxPrePhonemeLength,
    normalizeReaderOcrVoicevoxSpeedScale,
    normalizeReaderOcrVoicevoxStyleId,
    normalizeReaderOcrVoicevoxVolumeScale,
} from "../../shared/readerSettings";
import { app } from "electron";
import fs from "fs";
import path from "path";

const VOICEVOX_BASE_URL_ENV_NAMES = [
    "MANGA_HELPER_VOICEVOX_BASE_URL",
    "SCARAMANGA_VOICEVOX_BASE_URL",
];
const VOICEVOX_REQUEST_TIMEOUT_MS = 45000;
const VOICEVOX_UNAVAILABLE_MESSAGE = "La lecture audio n'est pas disponible pour le moment.";

type VoicevoxConfig = {
    baseUrl: URL | null;
    message: string | null;
};

export type VoicevoxSpeakerStyle = {
    id: number;
    name: string;
    type?: string;
};

export type VoicevoxSpeaker = {
    name: string;
    speakerUuid: string;
    styles: VoicevoxSpeakerStyle[];
    version?: string;
};

export type VoicevoxStatus = {
    configured: boolean;
    baseUrl: string | null;
    speakerId: number;
    message: string | null;
};

export type VoicevoxVoicesResult = {
    success: boolean;
    configured: boolean;
    baseUrl: string | null;
    speakers: VoicevoxSpeaker[];
    defaultSpeakerId: number;
    defaultSpeakerUuid: string | null;
    message?: string;
    error?: string;
    code?: string;
};

export type VoicevoxSynthesisResult = {
    success: boolean;
    audioBase64?: string;
    mimeType?: string;
    error?: string;
    code?: string;
};

type VoicevoxSynthesisOptions = {
    speakerId: number;
    speedScale: number;
    pitchScale: number;
    intonationScale: number;
    volumeScale: number;
    prePhonemeLength: number;
    postPhonemeLength: number;
    pauseLengthScale: number;
    outputSamplingRate: number;
    outputStereo: boolean;
    interrogativeUpspeak: boolean;
    enableKatakanaEnglish: boolean;
};

type VoicevoxSynthesisRequest = {
    text: string;
    options: VoicevoxSynthesisOptions;
};

const normalizeNullableString = (value: unknown): string | null => {
    if (typeof value !== "string") {
        return null;
    }

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
};

const readPackagedVoicevoxBaseUrl = (): string | null => {
    try {
        const packageJsonPath = path.join(app.getAppPath(), "package.json");
        const packageText = fs.readFileSync(packageJsonPath, "utf-8");
        const packageMetadata = JSON.parse(packageText);

        if (!packageMetadata || typeof packageMetadata !== "object") {
            return null;
        }

        return normalizeNullableString((packageMetadata as Record<string, unknown>).voicevoxBaseUrl);
    } catch {
        return null;
    }
};

const readVoicevoxBaseUrl = (): string | null => (
    VOICEVOX_BASE_URL_ENV_NAMES
        .map((name) => normalizeNullableString(process.env[name]))
        .find((value): value is string => !!value)
    || readPackagedVoicevoxBaseUrl()
);

const readVoicevoxConfig = (): VoicevoxConfig => {
    const rawBaseUrl = readVoicevoxBaseUrl();

    if (!rawBaseUrl) {
        return {
            baseUrl: null,
            message: VOICEVOX_UNAVAILABLE_MESSAGE,
        };
    }

    try {
        const baseUrl = new URL(rawBaseUrl);
        if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
            return {
                baseUrl: null,
                message: VOICEVOX_UNAVAILABLE_MESSAGE,
            };
        }

        return {
            baseUrl,
            message: null,
        };
    } catch {
        return {
            baseUrl: null,
            message: VOICEVOX_UNAVAILABLE_MESSAGE,
        };
    }
};

const buildVoicevoxUrl = (baseUrl: URL, endpointPath: string): URL => {
    const baseUrlText = baseUrl.toString().endsWith("/")
        ? baseUrl.toString()
        : `${baseUrl.toString()}/`;

    return new URL(endpointPath.replace(/^\/+/, ""), baseUrlText);
};

const fetchWithTimeout = async (url: URL, init: RequestInit): Promise<Response> => {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), VOICEVOX_REQUEST_TIMEOUT_MS);

    try {
        return await fetch(url, {
            ...init,
            signal: abortController.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
};

const readResponseError = async (response: Response): Promise<string> => {
    try {
        return await response.text();
    } catch {
        return "";
    }
};

const normalizeSynthesisError = (error: unknown): string => {
    const errorName = error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name || "")
        : "";

    if (errorName === "AbortError") {
        return "VOICEVOX met trop longtemps à répondre. Réessaie dans quelques instants.";
    }

    if (error instanceof Error) {
        return error.message || "La lecture audio a échoué.";
    }

    return "La lecture audio a échoué.";
};

const sanitizeVoicevoxSpeakers = (payload: unknown): VoicevoxSpeaker[] => {
    if (!Array.isArray(payload)) {
        return [];
    }

    return payload.reduce<VoicevoxSpeaker[]>((speakers, rawSpeaker) => {
        if (!rawSpeaker || typeof rawSpeaker !== "object") {
            return speakers;
        }

        const speakerRecord = rawSpeaker as Record<string, unknown>;
        const name = String(speakerRecord.name ?? "").trim();
        const speakerUuid = String(speakerRecord.speaker_uuid ?? "").trim();
        const rawStyles = Array.isArray(speakerRecord.styles) ? speakerRecord.styles : [];
        const styles = rawStyles.reduce<VoicevoxSpeakerStyle[]>((result, rawStyle) => {
            if (!rawStyle || typeof rawStyle !== "object") {
                return result;
            }

            const styleRecord = rawStyle as Record<string, unknown>;
            const id = Number(styleRecord.id);
            const styleName = String(styleRecord.name ?? "").trim();
            const type = String(styleRecord.type ?? "").trim();

            if (!Number.isFinite(id) || !styleName) {
                return result;
            }

            result.push({
                id,
                name: styleName,
                ...(type ? { type } : {}),
            });
            return result;
        }, []);

        if (!name || !speakerUuid || styles.length === 0) {
            return speakers;
        }

        speakers.push({
            name,
            speakerUuid,
            styles,
            version: typeof speakerRecord.version === "string" ? speakerRecord.version : undefined,
        });
        return speakers;
    }, []);
};

const findSpeakerUuidByStyleId = (speakers: VoicevoxSpeaker[], styleId: number): string | null => {
    const speaker = speakers.find((candidate) => (
        candidate.styles.some((style) => style.id === styleId)
    ));

    return speaker?.speakerUuid ?? null;
};

const getPayloadValue = (source: Record<string, unknown>, keys: string[]): unknown => {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            return source[key];
        }
    }

    return undefined;
};

const extractSynthesisRequest = (payload: unknown): VoicevoxSynthesisRequest => {
    if (typeof payload === "string") {
        return {
            text: payload.trim(),
            options: buildSynthesisOptions({}),
        };
    }

    const source = payload && typeof payload === "object"
        ? payload as Record<string, unknown>
        : {};

    return {
        text: String(source.text ?? "").trim(),
        options: buildSynthesisOptions(source),
    };
};

const buildSynthesisOptions = (source: Record<string, unknown>): VoicevoxSynthesisOptions => ({
    speakerId: normalizeReaderOcrVoicevoxStyleId(
        getPayloadValue(source, ["speakerId", "styleId", "readerOcrVoicevoxStyleId"]),
    ),
    speedScale: normalizeReaderOcrVoicevoxSpeedScale(
        getPayloadValue(source, ["speedScale", "readerOcrVoicevoxSpeedScale"]),
    ),
    pitchScale: normalizeReaderOcrVoicevoxPitchScale(
        getPayloadValue(source, ["pitchScale", "readerOcrVoicevoxPitchScale"]),
    ),
    intonationScale: normalizeReaderOcrVoicevoxIntonationScale(
        getPayloadValue(source, ["intonationScale", "readerOcrVoicevoxIntonationScale"]),
    ),
    volumeScale: normalizeReaderOcrVoicevoxVolumeScale(
        getPayloadValue(source, ["volumeScale", "readerOcrVoicevoxVolumeScale"]),
    ),
    prePhonemeLength: normalizeReaderOcrVoicevoxPrePhonemeLength(
        getPayloadValue(source, ["prePhonemeLength", "readerOcrVoicevoxPrePhonemeLength"]),
    ),
    postPhonemeLength: normalizeReaderOcrVoicevoxPostPhonemeLength(
        getPayloadValue(source, ["postPhonemeLength", "readerOcrVoicevoxPostPhonemeLength"]),
    ),
    pauseLengthScale: normalizeReaderOcrVoicevoxPauseLengthScale(
        getPayloadValue(source, ["pauseLengthScale", "readerOcrVoicevoxPauseLengthScale"]),
    ),
    outputSamplingRate: normalizeReaderOcrVoicevoxOutputSamplingRate(
        getPayloadValue(source, ["outputSamplingRate", "readerOcrVoicevoxOutputSamplingRate"]),
    ),
    outputStereo: normalizeReaderOcrVoicevoxOutputStereo(
        getPayloadValue(source, ["outputStereo", "readerOcrVoicevoxOutputStereo"]),
    ),
    interrogativeUpspeak: normalizeReaderOcrVoicevoxInterrogativeUpspeak(
        getPayloadValue(source, ["interrogativeUpspeak", "readerOcrVoicevoxInterrogativeUpspeak"]),
    ),
    enableKatakanaEnglish: normalizeReaderOcrVoicevoxEnableKatakanaEnglish(
        getPayloadValue(source, ["enableKatakanaEnglish", "readerOcrVoicevoxEnableKatakanaEnglish"]),
    ),
});

const applySynthesisOptions = (audioQuery: unknown, options: VoicevoxSynthesisOptions): unknown => {
    if (!audioQuery || typeof audioQuery !== "object" || Array.isArray(audioQuery)) {
        return audioQuery;
    }

    const queryRecord = audioQuery as Record<string, unknown>;
    queryRecord.speedScale = options.speedScale;
    queryRecord.pitchScale = options.pitchScale;
    queryRecord.intonationScale = options.intonationScale;
    queryRecord.volumeScale = options.volumeScale;
    queryRecord.prePhonemeLength = options.prePhonemeLength;
    queryRecord.postPhonemeLength = options.postPhonemeLength;
    queryRecord.pauseLengthScale = options.pauseLengthScale;
    queryRecord.outputSamplingRate = options.outputSamplingRate;
    queryRecord.outputStereo = options.outputStereo;
    return queryRecord;
};

export const getVoicevoxStatus = async (): Promise<VoicevoxStatus> => {
    const config = readVoicevoxConfig();

    return {
        configured: !!config.baseUrl,
        baseUrl: config.baseUrl?.toString() ?? null,
        speakerId: DEFAULT_READER_OCR_VOICEVOX_STYLE_ID,
        message: config.message,
    };
};

export const getVoicevoxVoices = async (): Promise<VoicevoxVoicesResult> => {
    const config = readVoicevoxConfig();
    if (!config.baseUrl) {
        return {
            success: false,
            configured: false,
            baseUrl: null,
            speakers: [],
            defaultSpeakerId: DEFAULT_READER_OCR_VOICEVOX_STYLE_ID,
            defaultSpeakerUuid: null,
            code: "voicevox-not-configured",
            message: config.message || VOICEVOX_UNAVAILABLE_MESSAGE,
        };
    }

    try {
        const speakersUrl = buildVoicevoxUrl(config.baseUrl, "/speakers");
        const response = await fetchWithTimeout(speakersUrl, {
            method: "GET",
            headers: {
                "Accept": "application/json",
            },
        });

        if (!response.ok) {
            const responseText = await readResponseError(response);
            console.warn("VOICEVOX speakers failed", {
                status: response.status,
                responseText,
            });

            return {
                success: false,
                configured: true,
                baseUrl: config.baseUrl.toString(),
                speakers: [],
                defaultSpeakerId: DEFAULT_READER_OCR_VOICEVOX_STYLE_ID,
                defaultSpeakerUuid: null,
                code: "voicevox-speakers-failed",
                error: "Impossible de charger les voix VOICEVOX pour le moment.",
            };
        }

        const speakers = sanitizeVoicevoxSpeakers(await response.json());
        return {
            success: true,
            configured: true,
            baseUrl: config.baseUrl.toString(),
            speakers,
            defaultSpeakerId: DEFAULT_READER_OCR_VOICEVOX_STYLE_ID,
            defaultSpeakerUuid: findSpeakerUuidByStyleId(speakers, DEFAULT_READER_OCR_VOICEVOX_STYLE_ID),
        };
    } catch (error) {
        console.warn("VOICEVOX speakers request failed", error);
        return {
            success: false,
            configured: true,
            baseUrl: config.baseUrl.toString(),
            speakers: [],
            defaultSpeakerId: DEFAULT_READER_OCR_VOICEVOX_STYLE_ID,
            defaultSpeakerUuid: null,
            code: "voicevox-speakers-request-failed",
            error: normalizeSynthesisError(error),
        };
    }
};

export const synthesizeVoicevoxSpeech = async (payload: unknown): Promise<VoicevoxSynthesisResult> => {
    const config = readVoicevoxConfig();
    if (!config.baseUrl) {
        return {
            success: false,
            code: "voicevox-not-configured",
            error: config.message || VOICEVOX_UNAVAILABLE_MESSAGE,
        };
    }

    const { text, options } = extractSynthesisRequest(payload);
    if (!text) {
        return {
            success: false,
            code: "voicevox-empty-text",
            error: "Aucun texte OCR à lire pour cette bulle.",
        };
    }

    try {
        const audioQueryUrl = buildVoicevoxUrl(config.baseUrl, "/audio_query");
        audioQueryUrl.searchParams.set("text", text);
        audioQueryUrl.searchParams.set("speaker", String(options.speakerId));
        audioQueryUrl.searchParams.set("enable_katakana_english", String(options.enableKatakanaEnglish));

        const audioQueryResponse = await fetchWithTimeout(audioQueryUrl, {
            method: "POST",
            headers: {
                "Accept": "application/json",
            },
        });

        if (!audioQueryResponse.ok) {
            const responseText = await readResponseError(audioQueryResponse);
            console.warn("VOICEVOX audio_query failed", {
                status: audioQueryResponse.status,
                responseText,
            });

            return {
                success: false,
                code: "voicevox-audio-query-failed",
                error: "VOICEVOX n'a pas pu préparer la voix. Vérifie que le serveur est disponible.",
            };
        }

        const audioQuery = applySynthesisOptions(await audioQueryResponse.json(), options);
        const synthesisUrl = buildVoicevoxUrl(config.baseUrl, "/synthesis");
        synthesisUrl.searchParams.set("speaker", String(options.speakerId));
        synthesisUrl.searchParams.set("enable_interrogative_upspeak", String(options.interrogativeUpspeak));

        const synthesisResponse = await fetchWithTimeout(synthesisUrl, {
            method: "POST",
            headers: {
                "Accept": "audio/wav",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(audioQuery),
        });

        if (!synthesisResponse.ok) {
            const responseText = await readResponseError(synthesisResponse);
            console.warn("VOICEVOX synthesis failed", {
                status: synthesisResponse.status,
                responseText,
            });

            return {
                success: false,
                code: "voicevox-synthesis-failed",
                error: "VOICEVOX n'a pas pu générer l'audio pour cette bulle.",
            };
        }

        const audioBuffer = Buffer.from(await synthesisResponse.arrayBuffer());
        return {
            success: true,
            audioBase64: audioBuffer.toString("base64"),
            mimeType: synthesisResponse.headers.get("content-type") || "audio/wav",
        };
    } catch (error) {
        console.warn("VOICEVOX request failed", error);
        return {
            success: false,
            code: "voicevox-request-failed",
            error: normalizeSynthesisError(error),
        };
    }
};
