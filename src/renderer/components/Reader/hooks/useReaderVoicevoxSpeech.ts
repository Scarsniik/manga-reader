import React from "react";
import type { ReaderOcrBox } from "@/renderer/components/Reader/types";
import {
    normalizeReaderOcrVoicevoxSpeedScale,
    normalizeReaderOcrVoicevoxSpeedStep,
} from "@/shared/readerSettings";

type VoicevoxStatus = {
    configured?: boolean;
    message?: string | null;
};

type VoicevoxSynthesisResult = {
    success?: boolean;
    audioBase64?: string;
    mimeType?: string;
    error?: string;
};

type VoicevoxAudioSaveResult = {
    success?: boolean;
    filePath?: string;
    directoryPath?: string;
    fileName?: string;
    error?: string;
};

export type ReaderVoicevoxSpeechSettings = {
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

type Args = {
    activeOcrEnabled: boolean;
    allOcrBoxes: ReaderOcrBox[];
    selectedBoxes: string[];
    autoPlayEnabled: boolean;
    speechSettings: ReaderVoicevoxSpeechSettings;
    speedStep: number;
    audioDownloadDirectory: string;
};

type PlaybackState = "idle" | "loading" | "playing";
type SpeedDirection = "slower" | "faster";

type CachedVoiceAudio = {
    audioBase64: string;
    mimeType: string;
};

const createAudioBlob = (audioBase64: string, mimeType: string): Blob => {
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType || "audio/wav" });
};

const createTextPlaybackBox = (text: string): ReaderOcrBox => ({
    id: `text:${text}`,
    text,
    bbox: { x: 0, y: 0, w: 0, h: 0 },
});

const getFriendlyPlaybackError = (error: unknown): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }

    return "Impossible de lire cette bulle pour le moment.";
};

const useReaderVoicevoxSpeech = ({
    activeOcrEnabled,
    allOcrBoxes,
    selectedBoxes,
    autoPlayEnabled,
    speechSettings,
    speedStep,
    audioDownloadDirectory,
}: Args) => {
    const [voicevoxConfigured, setVoicevoxConfigured] = React.useState<boolean>(false);
    const [voicevoxStatusLoading, setVoicevoxStatusLoading] = React.useState<boolean>(true);
    const [voicevoxUnavailableMessage, setVoicevoxUnavailableMessage] = React.useState<string | null>(null);
    const [playbackState, setPlaybackState] = React.useState<PlaybackState>("idle");
    const [playbackError, setPlaybackError] = React.useState<string | null>(null);
    const [audioDownloadLoading, setAudioDownloadLoading] = React.useState<boolean>(false);
    const [audioDownloadPath, setAudioDownloadPath] = React.useState<string | null>(null);
    const [audioDownloadError, setAudioDownloadError] = React.useState<string | null>(null);
    const activeAudioRef = React.useRef<HTMLAudioElement | null>(null);
    const activeAudioUrlRef = React.useRef<string | null>(null);
    const playbackRequestIdRef = React.useRef<number>(0);
    const lastAutoPlayKeyRef = React.useRef<string | null>(null);
    const audioCacheRef = React.useRef<Map<string, CachedVoiceAudio>>(new Map());
    const inFlightAudioCacheRef = React.useRef<Map<string, Promise<CachedVoiceAudio>>>(new Map());
    const audioCacheGenerationRef = React.useRef<number>(0);
    const temporarySpeedScaleRef = React.useRef<number>(speechSettings.speedScale);
    const [temporarySpeedScale, setTemporarySpeedScale] = React.useState<number>(speechSettings.speedScale);

    const selectedBox = React.useMemo(() => {
        if (selectedBoxes.length !== 1) {
            return null;
        }

        const selectedBoxId = selectedBoxes[0];
        return allOcrBoxes.find((box) => box.id === selectedBoxId) ?? null;
    }, [allOcrBoxes, selectedBoxes]);
    const selectedBoxKey = React.useMemo(() => (
        selectedBox ? selectedBox.id : ""
    ), [selectedBox]);
    const baseSpeechSettingsKey = React.useMemo(() => JSON.stringify({
        speakerId: speechSettings.speakerId,
        pitchScale: speechSettings.pitchScale,
        intonationScale: speechSettings.intonationScale,
        volumeScale: speechSettings.volumeScale,
        prePhonemeLength: speechSettings.prePhonemeLength,
        postPhonemeLength: speechSettings.postPhonemeLength,
        pauseLengthScale: speechSettings.pauseLengthScale,
        outputSamplingRate: speechSettings.outputSamplingRate,
        outputStereo: speechSettings.outputStereo,
        interrogativeUpspeak: speechSettings.interrogativeUpspeak,
        enableKatakanaEnglish: speechSettings.enableKatakanaEnglish,
    }), [speechSettings]);

    const releaseActiveAudio = React.useCallback(() => {
        const activeAudio = activeAudioRef.current;
        if (activeAudio) {
            activeAudio.onended = null;
            activeAudio.onerror = null;
            activeAudio.pause();
            activeAudioRef.current = null;
        }

        if (activeAudioUrlRef.current) {
            URL.revokeObjectURL(activeAudioUrlRef.current);
            activeAudioUrlRef.current = null;
        }
    }, []);

    const stopPlayback = React.useCallback(() => {
        playbackRequestIdRef.current += 1;
        releaseActiveAudio();
        setPlaybackState("idle");
    }, [releaseActiveAudio]);

    const resetCurrentBubbleAudioState = React.useCallback(() => {
        audioCacheGenerationRef.current += 1;
        audioCacheRef.current.clear();
        inFlightAudioCacheRef.current.clear();
        temporarySpeedScaleRef.current = normalizeReaderOcrVoicevoxSpeedScale(speechSettings.speedScale);
        setTemporarySpeedScale(temporarySpeedScaleRef.current);
        setAudioDownloadPath(null);
        setAudioDownloadError(null);
        stopPlayback();
    }, [speechSettings.speedScale, stopPlayback]);

    React.useEffect(() => {
        let cancelled = false;

        const loadVoicevoxStatus = async () => {
            setVoicevoxStatusLoading(true);

            if (!window.api || typeof window.api.voicevoxStatus !== "function") {
                if (!cancelled) {
                    setVoicevoxConfigured(false);
                    setVoicevoxUnavailableMessage("La lecture audio n'est pas disponible dans cet environnement.");
                    setVoicevoxStatusLoading(false);
                }
                return;
            }

            try {
                const status = await window.api.voicevoxStatus() as VoicevoxStatus;
                if (!cancelled) {
                    setVoicevoxConfigured(!!status?.configured);
                    setVoicevoxUnavailableMessage(typeof status?.message === "string" ? status.message : null);
                }
            } catch {
                if (!cancelled) {
                    setVoicevoxConfigured(false);
                    setVoicevoxUnavailableMessage("Impossible de vérifier la configuration VOICEVOX.");
                }
            } finally {
                if (!cancelled) {
                    setVoicevoxStatusLoading(false);
                }
            }
        };

        void loadVoicevoxStatus();

        return () => {
            cancelled = true;
        };
    }, []);

    const buildEffectiveSpeechSettings = React.useCallback((speedScale: number): ReaderVoicevoxSpeechSettings => ({
        ...speechSettings,
        speedScale: normalizeReaderOcrVoicevoxSpeedScale(speedScale),
    }), [speechSettings]);

    const withTextOverride = React.useCallback((
        box: ReaderOcrBox,
        textOverride?: string,
    ): ReaderOcrBox => {
        if (typeof textOverride !== "string") {
            return box;
        }

        return {
            ...box,
            text: textOverride.trim(),
        };
    }, []);

    const getAudioCacheKey = React.useCallback((
        box: ReaderOcrBox,
        effectiveSpeechSettings: ReaderVoicevoxSpeechSettings,
    ): string => JSON.stringify({
        boxId: box.id,
        text: String(box.text || "").trim(),
        settings: effectiveSpeechSettings,
    }), []);

    const getVoiceAudio = React.useCallback(async (
        box: ReaderOcrBox,
        effectiveSpeechSettings: ReaderVoicevoxSpeechSettings,
    ): Promise<CachedVoiceAudio> => {
        if (!window.api || typeof window.api.voicevoxSynthesize !== "function") {
            throw new Error(voicevoxUnavailableMessage || "La lecture audio n'est pas disponible pour le moment.");
        }

        const cacheKey = getAudioCacheKey(box, effectiveSpeechSettings);
        const cachedAudio = audioCacheRef.current.get(cacheKey);
        if (cachedAudio) {
            return cachedAudio;
        }

        const inFlightAudio = inFlightAudioCacheRef.current.get(cacheKey);
        if (inFlightAudio) {
            return inFlightAudio;
        }

        const cacheGeneration = audioCacheGenerationRef.current;
        const request = (async () => {
            const result = await window.api.voicevoxSynthesize({
                text: String(box.text || "").trim(),
                ...effectiveSpeechSettings,
            }) as VoicevoxSynthesisResult;

            if (!result?.success || !result.audioBase64) {
                throw new Error(result?.error || "VOICEVOX n'a pas pu générer l'audio.");
            }

            const audio = {
                audioBase64: result.audioBase64,
                mimeType: result.mimeType || "audio/wav",
            };

            if (audioCacheGenerationRef.current === cacheGeneration) {
                audioCacheRef.current.set(cacheKey, audio);
            }

            return audio;
        })();

        inFlightAudioCacheRef.current.set(cacheKey, request);

        try {
            return await request;
        } finally {
            if (inFlightAudioCacheRef.current.get(cacheKey) === request) {
                inFlightAudioCacheRef.current.delete(cacheKey);
            }
        }
    }, [getAudioCacheKey, voicevoxUnavailableMessage]);

    const playBoxAtSpeed = React.useCallback(async (box: ReaderOcrBox, speedScale: number) => {
        const normalizedText = String(box.text || "").trim();

        if (!normalizedText) {
            setPlaybackError("Aucun texte OCR à lire pour cette bulle.");
            return;
        }

        if (!voicevoxConfigured || !window.api || typeof window.api.voicevoxSynthesize !== "function") {
            setPlaybackError(voicevoxUnavailableMessage || "La lecture audio n'est pas disponible pour le moment.");
            return;
        }

        const effectiveSpeechSettings = buildEffectiveSpeechSettings(speedScale);
        const playbackRequestId = playbackRequestIdRef.current + 1;
        playbackRequestIdRef.current = playbackRequestId;
        releaseActiveAudio();
        setPlaybackState("loading");
        setPlaybackError(null);

        try {
            const voiceAudio = await getVoiceAudio(box, effectiveSpeechSettings);
            if (playbackRequestIdRef.current !== playbackRequestId) {
                return;
            }

            const audioBlob = createAudioBlob(voiceAudio.audioBase64, voiceAudio.mimeType);
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            activeAudioRef.current = audio;
            activeAudioUrlRef.current = audioUrl;

            audio.onended = () => {
                if (playbackRequestIdRef.current !== playbackRequestId) {
                    return;
                }

                releaseActiveAudio();
                setPlaybackState("idle");
            };
            audio.onerror = () => {
                if (playbackRequestIdRef.current !== playbackRequestId) {
                    return;
                }

                releaseActiveAudio();
                setPlaybackState("idle");
                setPlaybackError("Impossible de lire l'audio généré.");
            };

            await audio.play();
            if (playbackRequestIdRef.current === playbackRequestId) {
                setPlaybackState("playing");
            }
        } catch (error) {
            if (playbackRequestIdRef.current !== playbackRequestId) {
                return;
            }

            releaseActiveAudio();
            setPlaybackState("idle");
            setPlaybackError(getFriendlyPlaybackError(error));
        }
    }, [
        buildEffectiveSpeechSettings,
        getVoiceAudio,
        releaseActiveAudio,
        voicevoxConfigured,
        voicevoxUnavailableMessage,
    ]);

    const playSelectedTextAtSpeed = React.useCallback((speedScale: number, textOverride?: string) => {
        if (!selectedBox) {
            setPlaybackError("Sélectionne une bulle OCR avant de lancer la lecture.");
            return;
        }

        void playBoxAtSpeed(withTextOverride(selectedBox, textOverride), speedScale);
    }, [playBoxAtSpeed, selectedBox, withTextOverride]);

    const playSelectedText = React.useCallback((textOverride?: string) => {
        playSelectedTextAtSpeed(temporarySpeedScaleRef.current, textOverride);
    }, [playSelectedTextAtSpeed]);

    const playText = React.useCallback((text: string) => {
        const normalizedText = String(text || "").trim();
        if (!normalizedText) {
            setPlaybackError("Aucun texte à lire.");
            return;
        }

        void playBoxAtSpeed(createTextPlaybackBox(normalizedText), temporarySpeedScaleRef.current);
    }, [playBoxAtSpeed]);

    const playSelectedTextWithSpeedDirection = React.useCallback((direction: SpeedDirection) => {
        const normalizedStep = normalizeReaderOcrVoicevoxSpeedStep(speedStep);
        const currentSpeed = normalizeReaderOcrVoicevoxSpeedScale(
            temporarySpeedScaleRef.current || speechSettings.speedScale,
        );
        const nextSpeed = normalizeReaderOcrVoicevoxSpeedScale(
            currentSpeed + (direction === "faster" ? normalizedStep : -normalizedStep),
        );

        temporarySpeedScaleRef.current = nextSpeed;
        setTemporarySpeedScale(nextSpeed);
        playSelectedTextAtSpeed(nextSpeed);
    }, [playSelectedTextAtSpeed, speechSettings.speedScale, speedStep]);

    const playSelectedTextSlower = React.useCallback(() => {
        playSelectedTextWithSpeedDirection("slower");
    }, [playSelectedTextWithSpeedDirection]);

    const playSelectedTextFaster = React.useCallback(() => {
        playSelectedTextWithSpeedDirection("faster");
    }, [playSelectedTextWithSpeedDirection]);

    const downloadSelectedAudio = React.useCallback(async (textOverride?: string) => {
        if (!selectedBox) {
            setAudioDownloadError("Sélectionne une bulle OCR avant de télécharger l'audio.");
            return;
        }

        if (!window.api || typeof window.api.voicevoxSaveAudio !== "function") {
            setAudioDownloadError("Le téléchargement audio n'est pas disponible dans cet environnement.");
            return;
        }

        const downloadBox = withTextOverride(selectedBox, textOverride);
        const normalizedText = String(downloadBox.text || "").trim();
        if (!normalizedText) {
            setAudioDownloadError("La bulle sélectionnée est vide.");
            return;
        }

        const effectiveSpeechSettings = buildEffectiveSpeechSettings(temporarySpeedScaleRef.current);
        setAudioDownloadLoading(true);
        setAudioDownloadPath(null);
        setAudioDownloadError(null);

        try {
            const voiceAudio = await getVoiceAudio(downloadBox, effectiveSpeechSettings);
            const result = await window.api.voicevoxSaveAudio({
                audioBase64: voiceAudio.audioBase64,
                mimeType: voiceAudio.mimeType,
                text: normalizedText,
                outputDirectory: audioDownloadDirectory,
            }) as VoicevoxAudioSaveResult;

            if (!result?.success || !result.filePath) {
                throw new Error(result?.error || "Impossible d'enregistrer l'audio OCR.");
            }

            setAudioDownloadPath(result.filePath);
        } catch (error) {
            setAudioDownloadError(error instanceof Error && error.message.trim()
                ? error.message
                : "Impossible d'enregistrer l'audio OCR pour le moment.");
        } finally {
            setAudioDownloadLoading(false);
        }
    }, [
        audioDownloadDirectory,
        buildEffectiveSpeechSettings,
        getVoiceAudio,
        selectedBox,
        withTextOverride,
    ]);

    React.useEffect(() => {
        if (!activeOcrEnabled) {
            stopPlayback();
        }
    }, [activeOcrEnabled, stopPlayback]);

    React.useEffect(() => {
        resetCurrentBubbleAudioState();
    }, [
        baseSpeechSettingsKey,
        resetCurrentBubbleAudioState,
        selectedBoxKey,
    ]);

    React.useEffect(() => () => {
        stopPlayback();
    }, [stopPlayback]);

    React.useEffect(() => {
        if (!autoPlayEnabled) {
            lastAutoPlayKeyRef.current = null;
            return;
        }

        if (
            !activeOcrEnabled
            || voicevoxStatusLoading
            || !voicevoxConfigured
            || !selectedBox
        ) {
            return;
        }

        const autoPlayKey = `${selectedBox.id}::${selectedBox.text}::${baseSpeechSettingsKey}::${speechSettings.speedScale}`;
        if (lastAutoPlayKeyRef.current === autoPlayKey) {
            return;
        }

        lastAutoPlayKeyRef.current = autoPlayKey;
        temporarySpeedScaleRef.current = normalizeReaderOcrVoicevoxSpeedScale(speechSettings.speedScale);
        setTemporarySpeedScale(temporarySpeedScaleRef.current);
        void playBoxAtSpeed(selectedBox, temporarySpeedScaleRef.current);
    }, [
        activeOcrEnabled,
        autoPlayEnabled,
        baseSpeechSettingsKey,
        playBoxAtSpeed,
        selectedBox,
        speechSettings.speedScale,
        voicevoxConfigured,
        voicevoxStatusLoading,
    ]);

    return {
        selectedVoiceBox: selectedBox,
        voicePlaybackAvailable: voicevoxConfigured,
        voicePlaybackStatusLoading: voicevoxStatusLoading,
        voicePlaybackLoading: playbackState === "loading",
        voicePlaybackPlaying: playbackState === "playing",
        voicePlaybackError: playbackError,
        voicePlaybackUnavailableMessage: voicevoxUnavailableMessage,
        voicePlaybackSpeedScale: temporarySpeedScale,
        voiceAudioDownloadLoading: audioDownloadLoading,
        voiceAudioDownloadPath: audioDownloadPath,
        voiceAudioDownloadError: audioDownloadError,
        playSelectedText,
        playText,
        playSelectedTextSlower,
        playSelectedTextFaster,
        downloadSelectedAudio,
        stopPlayback,
    };
};

export default useReaderVoicevoxSpeech;
