import React, { useMemo, useState } from 'react';
import './JapaneseAnalyse.scss';
import { parseTextWithJpdb, JpdbParseResult, translateJaToEn } from '@/renderer/services/jpdb';
import { useEffect } from 'react';
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
  onWordClick?: (word: string) => void;
  onClose?: () => void;
};

// Very small mock: tokenizes by punctuation and small heuristics
function mockTokenize(text: string): string[] {
  if (!text) return [];
  // Tokenize into word-like tokens. For CJK (Japanese) we try to keep contiguous
  // Japanese/Kana/Kanji characters together as a token, and treat Latin words,
  // numbers and punctuation as separate tokens. This is still a mock/simple
  // heuristic but will produce tokens that can be rejoined to form the sentence.
  const tokens: string[] = [];

  // Normalize some punctuation by ensuring a space after sentence punctuation
  const normalized = text.replace(/。|！|!|、|\?|\?/g, (m) => m + ' ');

  // Regex groups: CJK unified (Kanji/Kana), latin words, numbers, individual punctuation
  const re = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|[A-Za-z0-9]+|[^\s]/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    const tok = match[0];
    if (tok.trim()) tokens.push(tok);
  }

  return tokens;
}

function mockJpdbLookup(word: string) {
  const map: Record<string, any> = {
  '私は日本人です。': { word, readings: ['わたしはにほんじんです'], senses: [{ gloss: 'I am Japanese', pos: 'phrase' }] },
  '私は': { word, readings: ['わたしは'], senses: [{ gloss: 'I (topic)', pos: 'phrase' }] },
  '私': { word, readings: ['わたし'], senses: [{ gloss: 'I, me', pos: 'pronoun' }] },
  'は': { word, readings: ['は'], senses: [{ gloss: 'topic particle', pos: 'particle' }] },
  '日本人': { word, readings: ['にほんじん'], senses: [{ gloss: 'Japanese (person)', pos: 'noun' }] },
  '日本': { word, readings: ['にほん'], senses: [{ gloss: 'Japan', pos: 'noun' }] },
  '人': { word, readings: ['ひと'], senses: [{ gloss: 'person', pos: 'noun' }] },
  'です': { word, readings: ['です'], senses: [{ gloss: 'copula', pos: 'aux' }] },
  'です。': { word, readings: ['です'], senses: [{ gloss: 'copula', pos: 'aux' }] },
  };
  return map[word] || { word, readings: [], senses: [{ gloss: '(mock) définition manquante' }] };
}

export default function JapaneseAnalyse({ selectedBoxes, onWordClick, onClose }: Props) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [manualText, setManualText] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<JpdbParseResult | null>(null);
  const [jpdbError, setJpdbError] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translationTruncated, setTranslationTruncated] = useState<boolean>(false);
  const [selectedTokenIndex, setSelectedTokenIndex] = useState<number | null>(null);

  const autoText = useMemo(() => selectedBoxes.map((b) => b.text).join(' '), [selectedBoxes]);
  // text to analyse is either the manualText (after Valider) or autoText
  const text = manualText ?? autoText;
  const tokens = useMemo(() => mockTokenize(text), [text]);

    // When selectedBoxes (autoText) changes, update the input and reset manual override.
    useEffect(() => {
      setInputText(autoText);
      setManualText(null);
      setSelectedTokenIndex(null);
      setSelectedWord(null);
      setParseResult(null);
      setJpdbError(null);
      setTranslation(null);
      setTranslationTruncated(false);
    }, [autoText]);

    // Whenever the text used for tokenization changes, run JPDB parse and translation in parallel.
    useEffect(() => {
      const toParse = text;
      if (!toParse) return;

      // reset transient state
      setParseResult(null);
      setJpdbError(null);
      setTranslation(null);
      setTranslationTruncated(false);
      setSelectedTokenIndex(null);
      setSelectedWord(null);

      (async () => {
        // Use allSettled so one failing request doesn't cancel the other
        const [parseRes, trRes] = await Promise.allSettled([
          parseTextWithJpdb(toParse),
          translateJaToEn(toParse),
        ]);

        if (parseRes.status === 'fulfilled') {
          const parsed = parseRes.value as JpdbParseResult;
          setParseResult(parsed);
          if (parsed.tokens && parsed.tokens.length > 0) {
            setSelectedTokenIndex(0);
            const firstTok = parsed.tokens[0];
            const pos = firstTok[1] as number;
            const len = firstTok[2] as number;
            const surface = text && typeof pos === 'number' && typeof len === 'number' ? text.slice(pos, pos + len) : undefined;
            if (surface) setSelectedWord(surface);
          }
        } else {
          const err = parseRes.reason;
          setJpdbError(err?.message || String(err));
        }

        if (trRes.status === 'fulfilled') {
          setTranslation(trRes.value.text);
          setTranslationTruncated(!!trRes.value.is_truncated);
        } else {
          // translation failure is non-fatal
          console.debug('translateJaToEn failed:', trRes.reason?.message || trRes.reason);
        }
      })();
    }, [text]);

  const details = selectedWord ? mockJpdbLookup(selectedWord) : null;

  console.log('JapaneseAnalyse render', { translation });

  return (
    <div className="jp-analyse">
      <Header onClose={onClose} />

      <DetectedText
        autoText={autoText}
        inputText={inputText}
        setInputText={setInputText}
        onValidate={async () => {
          setManualText(inputText || null);
          setSelectedWord(null);
          setParseResult(null);
          setJpdbError(null);
          try {
            const res = await parseTextWithJpdb(inputText || autoText);
            const parsed = res as JpdbParseResult;
            setParseResult(parsed);
            try {
              const tr = await translateJaToEn(inputText || autoText);
              setTranslation(tr.text);
              setTranslationTruncated(!!tr.is_truncated);
            } catch (e: any) {
              console.debug('translateJaToEn failed:', e?.message || e);
            }
            if (parsed.tokens && parsed.tokens.length > 0) {
              setSelectedTokenIndex(0);
              const firstTok = parsed.tokens[0];
              const pos = firstTok[1] as number;
              const len = firstTok[2] as number;
              const surface = (inputText || autoText) && typeof pos === 'number' && typeof len === 'number' ? (inputText || autoText).slice(pos, pos + len) : undefined;
              if (surface) setSelectedWord(surface);
            }
          } catch (err: any) {
            setJpdbError(err?.message || String(err));
          }
        }}
        onReset={() => {
          setInputText('');
          setManualText(null);
          setSelectedWord(null);
        }}
      />

      <div>
        {/* translation display */}
        {translation ? (
          <div className="translation">
            <strong>Traduction:</strong><br /> {translation} {translationTruncated ? <em className="translation-truncated">(truncated)</em> : null}
          </div>
        ) : null}

        <TokensList
          tokens={tokens}
          parseResult={parseResult}
          text={text}
          selectedTokenIndex={selectedTokenIndex}
          selectedWord={selectedWord}
          onTokenClick={(word, idx) => {
            setSelectedWord(word);
            setSelectedTokenIndex(typeof idx === 'number' ? idx : null);
            onWordClick?.(word);
          }}
        />
      </div>

      <DetailsPanel jpdbError={jpdbError} parseResult={parseResult} selectedWord={selectedWord} selectedTokenIndex={selectedTokenIndex} />
    </div>
  );
}
