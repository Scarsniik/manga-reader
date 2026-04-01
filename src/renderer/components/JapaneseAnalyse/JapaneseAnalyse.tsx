import React, { useEffect, useMemo, useRef, useState } from 'react';
import './JapaneseAnalyse.scss';
import {
  buildJpdbSentenceSegments,
  fetchKanjiApiEntries,
  getJpdbKanjiDetails,
  getJpdbTokenRubyParts,
  getJpdbTokenSurface,
  getJpdbTokenVocabulary,
  KanjiApiEntry,
  JpdbParseResult,
  JpdbSentenceSegment,
  parseTextWithJpdb,
  translateJaToEn,
} from '@/renderer/services/jpdb';
import Header from './Header';
import DetectedText from './DetectedText';
import TokensList from './TokensList';
import DetailsPanel from './DetailsPanel';

export type Box = {
  id: string;
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
};

type Props = {
  selectedBoxes: Box[];
  analysisScrollKey?: string;
  onWordClick?: (word: string) => void;
  onClose?: () => void;
};

export default function JapaneseAnalyse({
  selectedBoxes,
  analysisScrollKey,
  onWordClick,
  onClose,
}: Props) {
  const [inputText, setInputText] = useState<string>('');
  const [manualText, setManualText] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<JpdbParseResult | null>(null);
  const [jpdbError, setJpdbError] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translationTruncated, setTranslationTruncated] = useState<boolean>(false);
  const [selectedTokenIndex, setSelectedTokenIndex] = useState<number | null>(null);
  const [analysisNonce, setAnalysisNonce] = useState<number>(0);
  const [kanjiEntriesByChar, setKanjiEntriesByChar] = useState<Record<string, KanjiApiEntry | null>>({});
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [kanjiFetchLoading, setKanjiFetchLoading] = useState<boolean>(false);
  const [analysisCompletedKey, setAnalysisCompletedKey] = useState<string | null>(null);
  const [kanjiCompletedKey, setKanjiCompletedKey] = useState<string | null>(null);
  const [shouldScrollToDetails, setShouldScrollToDetails] = useState<boolean>(false);
  const analysisRootRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const lastAnalysisScrollKeyRef = useRef<string | null>(null);

  const autoText = useMemo(() => selectedBoxes.map((box) => box.text).join('\n'), [selectedBoxes]);
  const text = manualText ?? autoText;
  const isUsingManualText = manualText !== null;
  const currentAnalysisKey = analysisScrollKey || text || autoText;

  useEffect(() => {
    setInputText(autoText);
    setManualText(null);
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
  }, [autoText]);

  useEffect(() => {
    if (text.length === 0) {
      setParseResult(null);
      setJpdbError(null);
      setTranslation(null);
      setTranslationTruncated(false);
      setSelectedTokenIndex(null);
      setKanjiEntriesByChar({});
      setAnalysisLoading(false);
      setKanjiFetchLoading(false);
      setAnalysisCompletedKey(null);
      setKanjiCompletedKey(null);
      return;
    }

    let cancelled = false;
    const requestKey = analysisScrollKey || text || autoText;

    setParseResult(null);
    setJpdbError(null);
    setTranslation(null);
    setTranslationTruncated(false);
    setSelectedTokenIndex(null);
    setKanjiEntriesByChar({});
    setAnalysisLoading(true);
    setKanjiFetchLoading(false);
    setAnalysisCompletedKey(null);
    setKanjiCompletedKey(null);

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
    const vocabulary = getJpdbTokenVocabulary(parseResult, token);
    return {
      surface: getJpdbTokenSurface(text, token),
      vocabulary,
      rubyParts: getJpdbTokenRubyParts(text, token, vocabulary),
    };
  }, [parseResult, selectedTokenIndex, text]);

  const selectedSurface = selectedToken?.surface ?? null;
  const selectedRubyParts = selectedToken?.rubyParts ?? [];
  const selectedVocabulary = selectedToken?.vocabulary ?? [];

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
        selectedTokenIndex={selectedTokenIndex}
        onTokenClick={(index) => {
          setSelectedTokenIndex(index);
          setShouldScrollToDetails(true);
        }}
      />

      <div ref={detailsRef}>
        <DetailsPanel
          jpdbError={jpdbError}
          selectedSurface={selectedSurface}
          selectedRubyParts={selectedRubyParts}
          selectedVocabulary={selectedVocabulary}
          kanjiDetails={enrichedKanjiDetails}
          kanjiMeaningsLoading={kanjiMeaningsLoading}
        />
      </div>
    </div>
  );
}
