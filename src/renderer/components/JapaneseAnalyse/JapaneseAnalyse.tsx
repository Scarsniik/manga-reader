import React, { useEffect, useMemo, useRef, useState } from 'react';
import './JapaneseAnalyse.scss';
import {
  addVocabularyToJpdbDeck,
  buildJpdbSentenceSegments,
  fetchKanjiApiEntries,
  getJpdbKanjiDetails,
  getJpdbTokenRubyParts,
  getJpdbTokenSurface,
  JpdbCardState,
  getJpdbTokenVocabulary,
  KanjiApiEntry,
  listUserDecksFromJpdb,
  lookupVocabularyFromJpdb,
  JpdbParseResult,
  JpdbSentenceSegment,
  JpdbVocabularyEntry,
  parseTextWithJpdb,
  removeVocabularyFromJpdbDeck,
  submitVocabularyReviewToJpdb,
  translateJaToEn,
} from '@/renderer/services/jpdb';
import Header from './Header';
import DetectedText from './DetectedText';
import TokensList from './TokensList';
import DetailsPanel from './DetailsPanel';

const TOKEN_CYCLE_DEBOUNCE_MS = 500;

type JpdbReviewOverride = {
  spelling?: string;
  reading?: string;
  frequencyRank?: number;
  meanings?: string[];
  cardLevel: number | null;
  cardStates: JpdbCardState[];
};

type JpdbActionType = 'fail' | 'add' | 'remove';

export type Box = {
  id: string;
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
};

type Props = {
  selectedBoxes: Box[];
  analysisScrollKey?: string;
  tokenCycleRequestNonce?: number;
  tokenCycleSelectionKey?: string | null;
  onWordClick?: (word: string) => void;
  onClose?: () => void;
};

export default function JapaneseAnalyse({
  selectedBoxes,
  analysisScrollKey,
  tokenCycleRequestNonce = 0,
  tokenCycleSelectionKey = null,
  onWordClick,
  onClose,
}: Props) {
  const [inputText, setInputText] = useState<string>('');
  const [manualText, setManualText] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<JpdbParseResult | null>(null);
  const [jpdbError, setJpdbError] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translationTruncated, setTranslationTruncated] = useState<boolean>(false);
  const [activeTokenIndex, setActiveTokenIndex] = useState<number | null>(null);
  const [selectedTokenIndex, setSelectedTokenIndex] = useState<number | null>(null);
  const [analysisNonce, setAnalysisNonce] = useState<number>(0);
  const [kanjiEntriesByChar, setKanjiEntriesByChar] = useState<Record<string, KanjiApiEntry | null>>({});
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [kanjiFetchLoading, setKanjiFetchLoading] = useState<boolean>(false);
  const [analysisCompletedKey, setAnalysisCompletedKey] = useState<string | null>(null);
  const [kanjiCompletedKey, setKanjiCompletedKey] = useState<string | null>(null);
  const [shouldScrollToDetails, setShouldScrollToDetails] = useState<boolean>(false);
  const [reviewOverridesByKey, setReviewOverridesByKey] = useState<Record<string, JpdbReviewOverride>>({});
  const [justAddedDeckIdsByKey, setJustAddedDeckIdsByKey] = useState<Record<string, number>>({});
  const [actionSubmittingKey, setActionSubmittingKey] = useState<string | null>(null);
  const [actionSubmittingType, setActionSubmittingType] = useState<JpdbActionType | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const analysisRootRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const lastAnalysisScrollKeyRef = useRef<string | null>(null);
  const activeTokenIndexRef = useRef<number | null>(null);
  const previewedTokenCycleNonceRef = useRef<number>(0);
  const handledTokenCycleNonceRef = useRef<number>(0);
  const tokenCycleDebounceTimerRef = useRef<number | null>(null);

  const autoText = useMemo(() => selectedBoxes.map((box) => box.text).join('\n'), [selectedBoxes]);
  const text = manualText ?? autoText;
  const isUsingManualText = manualText !== null;
  const currentAnalysisKey = analysisScrollKey || text || autoText;
  const getVocabularyReviewKey = (entry: Pick<JpdbVocabularyEntry, 'vid' | 'sid'>) => `${entry.vid}:${entry.sid}`;

  useEffect(() => {
    setInputText(autoText);
    setManualText(null);
    setActiveTokenIndex(null);
    setSelectedTokenIndex(null);
    setParseResult(null);
    setJpdbError(null);
    setTranslation(null);
    setTranslationTruncated(false);
    setKanjiEntriesByChar({});
    setAnalysisLoading(false);
    setKanjiFetchLoading(false);
    setAnalysisCompletedKey(null);
    setKanjiCompletedKey(null);
    setReviewOverridesByKey({});
    setJustAddedDeckIdsByKey({});
    setActionSubmittingKey(null);
    setActionSubmittingType(null);
    setActionError(null);
  }, [autoText]);

  useEffect(() => {
    if (text.length === 0) {
      setParseResult(null);
      setJpdbError(null);
      setTranslation(null);
      setTranslationTruncated(false);
      setActiveTokenIndex(null);
      setSelectedTokenIndex(null);
      setKanjiEntriesByChar({});
      setAnalysisLoading(false);
      setKanjiFetchLoading(false);
      setAnalysisCompletedKey(null);
      setKanjiCompletedKey(null);
      setReviewOverridesByKey({});
      setJustAddedDeckIdsByKey({});
      setActionSubmittingKey(null);
      setActionSubmittingType(null);
      setActionError(null);
      return;
    }

    let cancelled = false;
    const requestKey = analysisScrollKey || text || autoText;

    setParseResult(null);
    setJpdbError(null);
    setTranslation(null);
    setTranslationTruncated(false);
    setActiveTokenIndex(null);
    setSelectedTokenIndex(null);
    setKanjiEntriesByChar({});
    setAnalysisLoading(true);
    setKanjiFetchLoading(false);
    setAnalysisCompletedKey(null);
    setKanjiCompletedKey(null);
    setReviewOverridesByKey({});
    setJustAddedDeckIdsByKey({});
    setActionSubmittingKey(null);
    setActionSubmittingType(null);
    setActionError(null);

    (async () => {
      const [parseRes, translationRes] = await Promise.allSettled([
        parseTextWithJpdb(text),
        translateJaToEn(text),
      ]);

      if (cancelled) {
        return;
      }

      if (parseRes.status === 'fulfilled') {
        const parsed = parseRes.value;
        setParseResult(parsed);
        if (parsed.tokens.length > 0) {
          setActiveTokenIndex(0);
          setSelectedTokenIndex(0);
        }
      } else {
        const error = parseRes.reason;
        setJpdbError(error?.message || String(error));
      }

      if (translationRes.status === 'fulfilled') {
        setTranslation(translationRes.value.text);
        setTranslationTruncated(!!translationRes.value.is_truncated);
      } else {
        console.debug('translateJaToEn failed:', translationRes.reason?.message || translationRes.reason);
      }

      if (!cancelled) {
        setAnalysisLoading(false);
        setAnalysisCompletedKey(requestKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [analysisNonce, analysisScrollKey, autoText, text]);

  const sentenceSegments = useMemo<JpdbSentenceSegment[]>(
    () => buildJpdbSentenceSegments(text, parseResult),
    [text, parseResult]
  );

  const selectedToken = useMemo(() => {
    if (
      selectedTokenIndex === null
      || !parseResult
      || !Array.isArray(parseResult.tokens)
      || !parseResult.tokens[selectedTokenIndex]
    ) {
      return null;
    }

    const token = parseResult.tokens[selectedTokenIndex];
    const baseVocabulary = getJpdbTokenVocabulary(parseResult, token);
    const vocabulary = baseVocabulary.map((entry) => {
      const override = reviewOverridesByKey[getVocabularyReviewKey(entry)];
      return override
        ? {
          ...entry,
          ...override,
        }
        : entry;
    });
    return {
      surface: getJpdbTokenSurface(text, token),
      baseVocabulary,
      vocabulary,
      rubyParts: getJpdbTokenRubyParts(text, token, vocabulary),
    };
  }, [parseResult, reviewOverridesByKey, selectedTokenIndex, text]);

  const selectedSurface = selectedToken?.surface ?? null;
  const selectedRubyParts = selectedToken?.rubyParts ?? [];
  const selectedVocabulary = selectedToken?.vocabulary ?? [];
  const selectedBaseVocabulary = selectedToken?.baseVocabulary ?? [];
  const primaryBaseVocabulary = selectedBaseVocabulary[0] ?? null;
  const primaryVocabulary = selectedVocabulary[0] ?? null;
  const primaryReviewKey = primaryVocabulary ? getVocabularyReviewKey(primaryVocabulary) : null;
  const primaryVocabularyWasJustAdded = !!primaryReviewKey && Number.isFinite(justAddedDeckIdsByKey[primaryReviewKey]);
  const primaryVocabularyHasDeckState = !!primaryVocabulary
    && (primaryVocabulary.cardStates.length > 0 || primaryVocabulary.cardLevel !== null);
  const canShowAddVocabularyButton = !!primaryVocabulary && !primaryVocabularyHasDeckState && !primaryVocabularyWasJustAdded;
  const canShowRemoveVocabularyButton = !!primaryVocabulary && primaryVocabularyWasJustAdded;
  const canShowFailReviewButton = !!primaryBaseVocabulary?.cardStates.includes('known');
  const isPrimaryVocabularyFailed = !!primaryVocabulary?.cardStates.includes('failed');
  const isPrimaryActionSubmitting = primaryReviewKey !== null && actionSubmittingKey === primaryReviewKey;
  const isPrimaryFailReviewSubmitting = isPrimaryActionSubmitting && actionSubmittingType === 'fail';
  const isPrimaryFailReviewDisabled = isPrimaryActionSubmitting || isPrimaryVocabularyFailed;
  const isPrimaryAddSubmitting = isPrimaryActionSubmitting && actionSubmittingType === 'add';
  const isPrimaryAddDisabled = isPrimaryActionSubmitting || primaryVocabularyHasDeckState || primaryVocabularyWasJustAdded;
  const isPrimaryRemoveSubmitting = isPrimaryActionSubmitting && actionSubmittingType === 'remove';
  const isPrimaryRemoveDisabled = isPrimaryActionSubmitting || !primaryVocabularyWasJustAdded;

  const kanjiDetails = useMemo(
    () => selectedSurface ? getJpdbKanjiDetails(selectedSurface, selectedRubyParts) : [],
    [selectedRubyParts, selectedSurface]
  );

  useEffect(() => {
    const requestKey = analysisScrollKey || text || autoText;
    const targetKanji = Array.from(new Set(kanjiDetails.map((detail) => detail.kanji)));
    if (targetKanji.length === 0) {
      setKanjiEntriesByChar({});
      setKanjiFetchLoading(false);
      setKanjiCompletedKey(requestKey || null);
      return;
    }

    let cancelled = false;
    setKanjiEntriesByChar({});
    setKanjiFetchLoading(true);
    setKanjiCompletedKey(null);

    (async () => {
      const entries = await fetchKanjiApiEntries(targetKanji);
      if (!cancelled) {
        setKanjiEntriesByChar(entries);
        setKanjiFetchLoading(false);
        setKanjiCompletedKey(requestKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [analysisScrollKey, autoText, kanjiDetails, text]);

  const enrichedKanjiDetails = useMemo(
    () => kanjiDetails.map((detail) => ({
      ...detail,
      meanings: kanjiEntriesByChar[detail.kanji]?.meanings ?? [],
      dictionaryKunReadings: kanjiEntriesByChar[detail.kanji]?.kunReadings ?? [],
      dictionaryOnReadings: kanjiEntriesByChar[detail.kanji]?.onReadings ?? [],
    })),
    [kanjiDetails, kanjiEntriesByChar]
  );
  const kanjiMeaningsLoading = kanjiFetchLoading;

  useEffect(() => {
    activeTokenIndexRef.current = activeTokenIndex;
  }, [activeTokenIndex]);

  useEffect(() => {
    lastAnalysisScrollKeyRef.current = null;
  }, [analysisScrollKey]);

  useEffect(() => {
    if (!currentAnalysisKey) {
      return;
    }

    const readyForAnalysisScroll = (
      analysisCompletedKey === currentAnalysisKey
      && kanjiCompletedKey === currentAnalysisKey
      && !analysisLoading
      && !kanjiFetchLoading
    );
    if (!readyForAnalysisScroll || lastAnalysisScrollKeyRef.current === currentAnalysisKey) {
      return;
    }
    const rootElement = analysisRootRef.current;
    if (!rootElement) {
      return;
    }

    const targetElement = (rootElement.closest('.ocr-analysis') as HTMLElement | null) || rootElement;
    const panelElement = targetElement.closest('.reader-ocr-panel');
    if (!(panelElement instanceof HTMLElement)) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (lastAnalysisScrollKeyRef.current === currentAnalysisKey) {
          return;
        }

        lastAnalysisScrollKeyRef.current = currentAnalysisKey;
        const panelRect = panelElement.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();
        const targetTop = panelElement.scrollTop + (targetRect.top - panelRect.top) - 16;

        panelElement.scrollTo({
          top: Math.max(0, targetTop),
          behavior: 'smooth',
        });
      });
    });
  }, [analysisCompletedKey, analysisLoading, currentAnalysisKey, kanjiCompletedKey, kanjiFetchLoading]);

  useEffect(() => {
    if (selectedSurface) {
      onWordClick?.(selectedSurface);
    }
  }, [onWordClick, selectedSurface]);

  useEffect(() => {
    const pendingCycleCount = tokenCycleRequestNonce - previewedTokenCycleNonceRef.current;
    if (
      !tokenCycleSelectionKey
      || tokenCycleSelectionKey !== currentAnalysisKey
      || pendingCycleCount <= 0
      || !parseResult
      || !Array.isArray(parseResult.tokens)
      || parseResult.tokens.length === 0
    ) {
      return;
    }

    previewedTokenCycleNonceRef.current = tokenCycleRequestNonce;
    setActiveTokenIndex((currentIndex) => {
      const activeIndex = (
        currentIndex !== null
        && currentIndex >= 0
        && currentIndex < parseResult.tokens.length
      )
        ? currentIndex
        : -1;
      return (activeIndex + pendingCycleCount) % parseResult.tokens.length;
    });

    if (tokenCycleDebounceTimerRef.current !== null) {
      window.clearTimeout(tokenCycleDebounceTimerRef.current);
    }

    tokenCycleDebounceTimerRef.current = window.setTimeout(() => {
      handledTokenCycleNonceRef.current = tokenCycleRequestNonce;
      setSelectedTokenIndex(activeTokenIndexRef.current);
      setShouldScrollToDetails(true);
      tokenCycleDebounceTimerRef.current = null;
    }, TOKEN_CYCLE_DEBOUNCE_MS);

    return () => {
      if (tokenCycleDebounceTimerRef.current !== null) {
        window.clearTimeout(tokenCycleDebounceTimerRef.current);
        tokenCycleDebounceTimerRef.current = null;
      }
    };
  }, [currentAnalysisKey, parseResult, tokenCycleRequestNonce, tokenCycleSelectionKey]);

  useEffect(() => () => {
    if (tokenCycleDebounceTimerRef.current !== null) {
      window.clearTimeout(tokenCycleDebounceTimerRef.current);
      tokenCycleDebounceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!shouldScrollToDetails || selectedTokenIndex === null) {
      return;
    }

    const detailsElement = detailsRef.current;
    if (!detailsElement) {
      setShouldScrollToDetails(false);
      return;
    }

    const panelElement = detailsElement.closest('.reader-ocr-panel');
    if (!(panelElement instanceof HTMLElement)) {
      detailsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setShouldScrollToDetails(false);
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const panelRect = panelElement.getBoundingClientRect();
      const detailsRect = detailsElement.getBoundingClientRect();
      const targetTop = panelElement.scrollTop + (detailsRect.top - panelRect.top) - 16;

      panelElement.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth',
      });
      setShouldScrollToDetails(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [selectedTokenIndex, shouldScrollToDetails]);

  return (
    <div className="jp-analyse" ref={analysisRootRef}>
      <Header onClose={onClose} />

      <DetectedText
        autoText={autoText}
        inputText={inputText}
        isUsingManualText={isUsingManualText}
        setInputText={setInputText}
        onValidate={() => {
          setManualText(inputText);
          setAnalysisNonce((value) => value + 1);
        }}
        onReset={() => {
          setInputText(autoText);
          setManualText(null);
          setAnalysisNonce((value) => value + 1);
        }}
      />

      {translation ? (
        <div className="translation">
          <div className="translation__label">Traduction</div>
          <div className="translation__text">{translation}</div>
          {translationTruncated ? (
            <div className="translation-truncated">Traduction tronquée par JPDB.</div>
          ) : null}
        </div>
      ) : null}

      <TokensList
        text={text}
        sentenceSegments={sentenceSegments}
        selectedTokenIndex={activeTokenIndex}
        onTokenClick={(index) => {
          setActiveTokenIndex(index);
          setSelectedTokenIndex(index);
          setShouldScrollToDetails(true);
        }}
      />

      <div ref={detailsRef}>
        <DetailsPanel
          jpdbError={jpdbError}
          reviewError={actionError}
          selectedSurface={selectedSurface}
          selectedRubyParts={selectedRubyParts}
          selectedVocabulary={selectedVocabulary}
          kanjiDetails={enrichedKanjiDetails}
          kanjiMeaningsLoading={kanjiMeaningsLoading}
          showFailReviewButton={canShowFailReviewButton}
          showAddVocabularyButton={canShowAddVocabularyButton}
          showRemoveVocabularyButton={canShowRemoveVocabularyButton}
          addVocabularyButtonDisabled={isPrimaryAddDisabled}
          addVocabularyButtonLoading={isPrimaryAddSubmitting}
          removeVocabularyButtonDisabled={isPrimaryRemoveDisabled}
          removeVocabularyButtonLoading={isPrimaryRemoveSubmitting}
          onAddVocabulary={async () => {
            if (!primaryBaseVocabulary || isPrimaryAddDisabled) {
              return;
            }

            const requestKey = getVocabularyReviewKey(primaryBaseVocabulary);
            setActionSubmittingKey(requestKey);
            setActionSubmittingType('add');
            setActionError(null);

            try {
              const decks = await listUserDecksFromJpdb();
              const firstDeck = decks[0] ?? null;

              if (!firstDeck) {
                throw new Error('Aucun deck utilisateur JPDB n’a été trouvé.');
              }

              await addVocabularyToJpdbDeck(firstDeck.id, primaryBaseVocabulary.vid, primaryBaseVocabulary.sid);
              let refreshedVocabulary: JpdbVocabularyEntry | null = null;

              try {
                refreshedVocabulary = await lookupVocabularyFromJpdb(primaryBaseVocabulary.vid, primaryBaseVocabulary.sid);
              } catch (lookupError) {
                console.debug('lookupVocabularyFromJpdb failed after add:', lookupError);
              }

              setReviewOverridesByKey((current) => ({
                ...current,
                [requestKey]: {
                  spelling: refreshedVocabulary?.spelling,
                  reading: refreshedVocabulary?.reading,
                  frequencyRank: refreshedVocabulary?.frequencyRank,
                  meanings: refreshedVocabulary?.meanings,
                  cardLevel: refreshedVocabulary?.cardLevel ?? null,
                  cardStates: refreshedVocabulary?.cardStates ?? ['new'],
                },
              }));
              setJustAddedDeckIdsByKey((current) => ({
                ...current,
                [requestKey]: firstDeck.id,
              }));
            } catch (error: any) {
              setActionError(error?.message || String(error));
            } finally {
              setActionSubmittingKey(null);
              setActionSubmittingType(null);
            }
          }}
          onRemoveVocabulary={async () => {
            if (!primaryBaseVocabulary || !primaryReviewKey || isPrimaryRemoveDisabled) {
              return;
            }

            const requestKey = getVocabularyReviewKey(primaryBaseVocabulary);
            const deckId = justAddedDeckIdsByKey[requestKey];
            if (!Number.isFinite(deckId) || deckId <= 0) {
              setActionError('Impossible de retrouver le deck JPDB utilisé pour cet ajout.');
              return;
            }

            setActionSubmittingKey(requestKey);
            setActionSubmittingType('remove');
            setActionError(null);

            try {
              await removeVocabularyFromJpdbDeck(deckId, primaryBaseVocabulary.vid, primaryBaseVocabulary.sid);
              setJustAddedDeckIdsByKey((current) => {
                const next = { ...current };
                delete next[requestKey];
                return next;
              });
              setReviewOverridesByKey((current) => {
                if (!(requestKey in current)) {
                  return current;
                }

                const next = { ...current };
                delete next[requestKey];
                return next;
              });
            } catch (error: any) {
              setActionError(error?.message || String(error));
            } finally {
              setActionSubmittingKey(null);
              setActionSubmittingType(null);
            }
          }}
          failReviewButtonDisabled={isPrimaryFailReviewDisabled}
          failReviewButtonLoading={isPrimaryFailReviewSubmitting}
          onFailReview={async () => {
            if (!primaryBaseVocabulary || isPrimaryFailReviewDisabled) {
              return;
            }

            const requestKey = getVocabularyReviewKey(primaryBaseVocabulary);
            setActionSubmittingKey(requestKey);
            setActionSubmittingType('fail');
            setActionError(null);

            try {
              await submitVocabularyReviewToJpdb(primaryBaseVocabulary.vid, primaryBaseVocabulary.sid, 'fail');
              setReviewOverridesByKey((current) => ({
                ...current,
                [requestKey]: {
                  cardLevel: null,
                  cardStates: ['failed'],
                },
              }));
            } catch (error: any) {
              setActionError(error?.message || String(error));
            } finally {
              setActionSubmittingKey(null);
              setActionSubmittingType(null);
            }
          }}
        />
      </div>
    </div>
  );
}
