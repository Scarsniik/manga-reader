import React from "react";
import type { ReaderOcrBox } from "@/renderer/components/Reader/types";

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
};

type PlaybackState = "idle" | "loading" | "playing";

const createAudioBlob = (audioBase64: string, mimeType: string): Blob => {
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType || "audio/wav" });
};

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
}: Args) => {
    const [voicevoxConfigured, setVoicevoxConfigured] = React.useState<boolean>(false);
    const [voicevoxStatusLoading, setVoicevoxStatusLoading] = React.useState<boolean>(true);
    const [voicevoxUnavailableMessage, setVoicevoxUnavailableMessage] = React.useState<string | null>(null);
    const [playbackState, setPlaybackState] = React.useState<PlaybackState>("idle");
    const [playbackError, setPlaybackError] = React.useState<string | null>(null);
    const activeAudioRef = React.useRef<HTMLAudioElement | null>(null);
    const activeAudioUrlRef = React.useRef<string | null>(null);
    const playbackRequestIdRef = React.useRef<number>(0);
    const lastAutoPlayKeyRef = React.useRef<string | null>(null);

    const selectedBox = React.useMemo(() => {
        if (selectedBoxes.length !== 1) {
            return null;
        }

        const selectedBoxId = selectedBoxes[0];
        return allOcrBoxes.find((box) => box.id === selectedBoxId) ?? null;
    }, [allOcrBoxes, selectedBoxes]);

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

    const playText = React.useCallback(async (text: string) => {
        const normalizedText = String(text || "").trim();

        if (!normalizedText) {
            setPlaybackError("Aucun texte OCR à lire pour cette bulle.");
            return;
        }

        if (!voicevoxConfigured || !window.api || typeof window.api.voicevoxSynthesize !== "function") {
            setPlaybackError(voicevoxUnavailableMessage || "La lecture audio n'est pas configurée.");
            return;
        }

        const playbackRequestId = playbackRequestIdRef.current + 1;
        playbackRequestIdRef.current = playbackRequestId;
        releaseActiveAudio();
        setPlaybackState("loading");
        setPlaybackError(null);

        try {
            const result = await window.api.voicevoxSynthesize({
                text: normalizedText,
                ...speechSettings,
            }) as VoicevoxSynthesisResult;
            if (playbackRequestIdRef.current !== playbackRequestId) {
                return;
            }

            if (!result?.success || !result.audioBase64) {
                throw new Error(result?.error || "VOICEVOX n'a pas pu générer l'audio.");
            }

            const audioBlob = createAudioBlob(result.audioBase64, result.mimeType || "audio/wav");
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
    }, [releaseActiveAudio, speechSettings, voicevoxConfigured, voicevoxUnavailableMessage]);

    const playSelectedText = React.useCallback(() => {
        if (!selectedBox) {
            setPlaybackError("Sélectionne une bulle OCR avant de lancer la lecture.");
            return;
        }

        void playText(selectedBox.text);
    }, [playText, selectedBox]);

    React.useEffect(() => {
        if (!activeOcrEnabled) {
            stopPlayback();
        }
    }, [activeOcrEnabled, stopPlayback]);

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

        const autoPlayKey = `${selectedBox.id}::${selectedBox.text}`;
        if (lastAutoPlayKeyRef.current === autoPlayKey) {
            return;
        }

        lastAutoPlayKeyRef.current = autoPlayKey;
        void playText(selectedBox.text);
    }, [
        activeOcrEnabled,
        autoPlayEnabled,
        playText,
        selectedBox,
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
        playSelectedText,
        stopPlayback,
    };
};

export default useReaderVoicevoxSpeech;
