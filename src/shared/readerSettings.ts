export const DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT = 2;
export const MAX_READER_OCR_PRELOAD_PAGE_COUNT = 10;
export const DEFAULT_READER_OCR_AUTO_ANALYZE_BUBBLES = true;
export const DEFAULT_READER_OCR_PRELOAD_TOKEN_DETAILS = false;
export const DEFAULT_READER_OCR_AUTO_PLAY_VOICE = false;
export const DEFAULT_READER_OCR_VOICEVOX_SPEAKER_UUID = "";
export const DEFAULT_READER_OCR_VOICEVOX_STYLE_ID = 2;
export const DEFAULT_READER_OCR_VOICEVOX_SPEED_SCALE = 1;
export const MIN_READER_OCR_VOICEVOX_SPEED_SCALE = 0.5;
export const MAX_READER_OCR_VOICEVOX_SPEED_SCALE = 2;
export const DEFAULT_READER_OCR_VOICEVOX_PITCH_SCALE = 0;
export const MIN_READER_OCR_VOICEVOX_PITCH_SCALE = -0.15;
export const MAX_READER_OCR_VOICEVOX_PITCH_SCALE = 0.15;
export const DEFAULT_READER_OCR_VOICEVOX_INTONATION_SCALE = 1;
export const MIN_READER_OCR_VOICEVOX_INTONATION_SCALE = 0;
export const MAX_READER_OCR_VOICEVOX_INTONATION_SCALE = 2;
export const DEFAULT_READER_OCR_VOICEVOX_VOLUME_SCALE = 1;
export const MIN_READER_OCR_VOICEVOX_VOLUME_SCALE = 0;
export const MAX_READER_OCR_VOICEVOX_VOLUME_SCALE = 2;
export const DEFAULT_READER_OCR_VOICEVOX_PRE_PHONEME_LENGTH = 0.1;
export const DEFAULT_READER_OCR_VOICEVOX_POST_PHONEME_LENGTH = 0.1;
export const MIN_READER_OCR_VOICEVOX_PHONEME_LENGTH = 0;
export const MAX_READER_OCR_VOICEVOX_PHONEME_LENGTH = 1.5;
export const DEFAULT_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE = 1;
export const MIN_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE = 0.5;
export const MAX_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE = 2;
export const DEFAULT_READER_OCR_VOICEVOX_OUTPUT_SAMPLING_RATE = 24000;
export const READER_OCR_VOICEVOX_OUTPUT_SAMPLING_RATE_OPTIONS = [16000, 24000, 44100, 48000] as const;
export const DEFAULT_READER_OCR_VOICEVOX_OUTPUT_STEREO = false;
export const DEFAULT_READER_OCR_VOICEVOX_INTERROGATIVE_UPSPEAK = true;
export const DEFAULT_READER_OCR_VOICEVOX_ENABLE_KATAKANA_ENGLISH = true;
export const DEFAULT_READER_OCR_NAVIGATION_OFFSET = 6;
export const MIN_READER_OCR_NAVIGATION_OFFSET = 0;
export const MAX_READER_OCR_NAVIGATION_OFFSET = 25;
export const DEFAULT_READER_OCR_NAVIGATION_DEAD_ZONE = 1;
export const MIN_READER_OCR_NAVIGATION_DEAD_ZONE = 0;
export const MAX_READER_OCR_NAVIGATION_DEAD_ZONE = 10;
export const DEFAULT_READER_OCR_NAVIGATION_STRICT_DIRECTION = true;
export const DEFAULT_READER_OCR_NAVIGATION_LOOSE_FALLBACK = true;
export const DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT = 2;
export const MAX_READER_IMAGE_PRELOAD_PAGE_COUNT = 10;
export const DEFAULT_READER_IMAGE_MAX_WIDTH = 1100;
export const MIN_READER_IMAGE_MAX_WIDTH = 480;
export const MAX_READER_IMAGE_MAX_WIDTH = 2400;
export const DEFAULT_READER_SCROLL_STRENGTH = 60;
export const MIN_READER_SCROLL_STRENGTH = 10;
export const MAX_READER_SCROLL_STRENGTH = 200;
export const DEFAULT_READER_SCROLL_HOLD_SPEED = 280;
export const MIN_READER_SCROLL_HOLD_SPEED = 50;
export const MAX_READER_SCROLL_HOLD_SPEED = 500;
export const DEFAULT_READER_SCROLL_START_BOOST = 90;
export const MIN_READER_SCROLL_START_BOOST = 0;
export const MAX_READER_SCROLL_START_BOOST = 250;

const parseNumericSetting = (value: unknown): number => {
    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
        return Number(value);
    }

    return Number.NaN;
};

const normalizeIntegerSetting = (
    value: unknown,
    fallback: number,
    min: number,
    max: number,
): number => {
    const parsed = parseNumericSetting(value);

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const normalizeNumberSetting = (
    value: unknown,
    fallback: number,
    min: number,
    max: number,
): number => {
    const parsed = parseNumericSetting(value);

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    const clamped = Math.max(min, Math.min(max, parsed));
    return Number(clamped.toFixed(3));
};

const normalizeBooleanSetting = (value: unknown, fallback: boolean): boolean => (
    typeof value === "boolean" ? value : fallback
);

const normalizeStringSetting = (value: unknown, fallback: string = ""): string => {
    if (typeof value !== "string") {
        return fallback;
    }

    return value.trim();
};

export const normalizeReaderOcrPreloadPageCount = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT,
        0,
        MAX_READER_OCR_PRELOAD_PAGE_COUNT,
    )
);

export const normalizeReaderOcrAutoAnalyzeBubbles = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_AUTO_ANALYZE_BUBBLES)
);

export const normalizeReaderOcrPreloadTokenDetails = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_PRELOAD_TOKEN_DETAILS)
);

export const normalizeReaderOcrAutoPlayVoice = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_AUTO_PLAY_VOICE)
);

export const normalizeReaderOcrVoicevoxSpeakerUuid = (value: unknown): string => (
    normalizeStringSetting(value, DEFAULT_READER_OCR_VOICEVOX_SPEAKER_UUID)
);

export const normalizeReaderOcrVoicevoxStyleId = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_VOICEVOX_STYLE_ID,
        0,
        100000,
    )
);

export const normalizeReaderOcrVoicevoxSpeedScale = (value: unknown): number => (
    normalizeNumberSetting(
        value,
        DEFAULT_READER_OCR_VOICEVOX_SPEED_SCALE,
        MIN_READER_OCR_VOICEVOX_SPEED_SCALE,
        MAX_READER_OCR_VOICEVOX_SPEED_SCALE,
    )
);

export const normalizeReaderOcrVoicevoxPitchScale = (value: unknown): number => (
    normalizeNumberSetting(
        value,
        DEFAULT_READER_OCR_VOICEVOX_PITCH_SCALE,
        MIN_READER_OCR_VOICEVOX_PITCH_SCALE,
        MAX_READER_OCR_VOICEVOX_PITCH_SCALE,
    )
);

export const normalizeReaderOcrVoicevoxIntonationScale = (value: unknown): number => (
    normalizeNumberSetting(
        value,
        DEFAULT_READER_OCR_VOICEVOX_INTONATION_SCALE,
        MIN_READER_OCR_VOICEVOX_INTONATION_SCALE,
        MAX_READER_OCR_VOICEVOX_INTONATION_SCALE,
    )
);

export const normalizeReaderOcrVoicevoxVolumeScale = (value: unknown): number => (
    normalizeNumberSetting(
        value,
        DEFAULT_READER_OCR_VOICEVOX_VOLUME_SCALE,
        MIN_READER_OCR_VOICEVOX_VOLUME_SCALE,
        MAX_READER_OCR_VOICEVOX_VOLUME_SCALE,
    )
);

export const normalizeReaderOcrVoicevoxPrePhonemeLength = (value: unknown): number => (
    normalizeNumberSetting(
        value,
        DEFAULT_READER_OCR_VOICEVOX_PRE_PHONEME_LENGTH,
        MIN_READER_OCR_VOICEVOX_PHONEME_LENGTH,
        MAX_READER_OCR_VOICEVOX_PHONEME_LENGTH,
    )
);

export const normalizeReaderOcrVoicevoxPostPhonemeLength = (value: unknown): number => (
    normalizeNumberSetting(
        value,
        DEFAULT_READER_OCR_VOICEVOX_POST_PHONEME_LENGTH,
        MIN_READER_OCR_VOICEVOX_PHONEME_LENGTH,
        MAX_READER_OCR_VOICEVOX_PHONEME_LENGTH,
    )
);

export const normalizeReaderOcrVoicevoxPauseLengthScale = (value: unknown): number => (
    normalizeNumberSetting(
        value,
        DEFAULT_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE,
        MIN_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE,
        MAX_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE,
    )
);

export const normalizeReaderOcrVoicevoxOutputSamplingRate = (value: unknown): number => {
    const parsed = normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_VOICEVOX_OUTPUT_SAMPLING_RATE,
        1,
        192000,
    );

    return (READER_OCR_VOICEVOX_OUTPUT_SAMPLING_RATE_OPTIONS as readonly number[]).includes(parsed)
        ? parsed
        : DEFAULT_READER_OCR_VOICEVOX_OUTPUT_SAMPLING_RATE;
};

export const normalizeReaderOcrVoicevoxOutputStereo = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_VOICEVOX_OUTPUT_STEREO)
);

export const normalizeReaderOcrVoicevoxInterrogativeUpspeak = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_VOICEVOX_INTERROGATIVE_UPSPEAK)
);

export const normalizeReaderOcrVoicevoxEnableKatakanaEnglish = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_VOICEVOX_ENABLE_KATAKANA_ENGLISH)
);

export const normalizeReaderOcrNavigationOffset = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_NAVIGATION_OFFSET,
        MIN_READER_OCR_NAVIGATION_OFFSET,
        MAX_READER_OCR_NAVIGATION_OFFSET,
    )
);

export const normalizeReaderOcrNavigationDeadZone = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_NAVIGATION_DEAD_ZONE,
        MIN_READER_OCR_NAVIGATION_DEAD_ZONE,
        MAX_READER_OCR_NAVIGATION_DEAD_ZONE,
    )
);

export const normalizeReaderOcrNavigationStrictDirection = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_NAVIGATION_STRICT_DIRECTION)
);

export const normalizeReaderOcrNavigationLooseFallback = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_NAVIGATION_LOOSE_FALLBACK)
);

export const normalizeReaderImagePreloadPageCount = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT,
        0,
        MAX_READER_IMAGE_PRELOAD_PAGE_COUNT,
    )
);

export const normalizeReaderImageMaxWidth = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_IMAGE_MAX_WIDTH,
        MIN_READER_IMAGE_MAX_WIDTH,
        MAX_READER_IMAGE_MAX_WIDTH,
    )
);

export const normalizeReaderScrollStrength = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_SCROLL_STRENGTH,
        MIN_READER_SCROLL_STRENGTH,
        MAX_READER_SCROLL_STRENGTH,
    )
);

export const normalizeReaderScrollHoldSpeed = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_SCROLL_HOLD_SPEED,
        MIN_READER_SCROLL_HOLD_SPEED,
        MAX_READER_SCROLL_HOLD_SPEED,
    )
);

export const normalizeReaderScrollStartBoost = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_SCROLL_START_BOOST,
        MIN_READER_SCROLL_START_BOOST,
        MAX_READER_SCROLL_START_BOOST,
    )
);
