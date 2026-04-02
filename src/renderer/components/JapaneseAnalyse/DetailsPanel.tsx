import React from 'react';
import {
  JpdbKanjiDetail,
  JpdbRubyPart,
  JpdbVocabularyEntry,
  isKanjiText,
} from '@/renderer/services/jpdb';
import RubyText from './RubyText';
import './DetailsPanel.scss';

type DisplayKanjiDetail = JpdbKanjiDetail & {
  meanings?: string[];
  dictionaryKunReadings?: string[];
  dictionaryOnReadings?: string[];
};

type Props = {
  jpdbError: string | null;
  selectedSurface: string | null;
  selectedRubyParts: JpdbRubyPart[];
  selectedVocabulary: JpdbVocabularyEntry[];
  kanjiDetails: DisplayKanjiDetail[];
  kanjiMeaningsLoading?: boolean;
};

const formatFrequencyRank = (rank: number): string => {
  if (!Number.isFinite(rank) || rank <= 0) {
    return 'Fréquence inconnue';
  }

  return `Fréquence JPDB #${rank}`;
};

const CARD_STATE_LABELS: Record<string, string> = {
  new: 'Nouveau',
  learning: 'Apprentissage',
  known: 'Connu',
  due: 'À revoir',
  failed: 'Raté',
  locked: 'Verrouillé',
  'never-forget': 'Jamais oublier',
  suspended: 'Suspendu',
  blacklisted: 'Blacklisté',
  redundant: 'Redondant',
};

const formatCardStatus = (entry: JpdbVocabularyEntry | null): string | null => {
  if (!entry) {
    return null;
  }

  const stateLabel = entry.cardStates
    .map((state) => CARD_STATE_LABELS[state] || state)
    .filter((value) => value.length > 0)
    .join(' / ');

  if (stateLabel && typeof entry.cardLevel === 'number' && Number.isFinite(entry.cardLevel)) {
    return `JPDB : ${stateLabel} · niv. ${entry.cardLevel}`;
  }

  if (stateLabel) {
    return `JPDB : ${stateLabel}`;
  }

  if (typeof entry.cardLevel === 'number' && Number.isFinite(entry.cardLevel)) {
    return `JPDB : niv. ${entry.cardLevel}`;
  }

  return null;
};

export default function DetailsPanel({
  jpdbError,
  selectedSurface,
  selectedRubyParts,
  selectedVocabulary,
  kanjiDetails,
  kanjiMeaningsLoading = false,
}: Props) {
  const hasVocabulary = selectedVocabulary.length > 0;
  const hasSingleVocabulary = selectedVocabulary.length === 1;
  const hasKanji = kanjiDetails.length > 0;
  const primaryVocabulary = selectedVocabulary[0] ?? null;
  const primaryMeanings = (primaryVocabulary?.meanings || []).slice(0, 4);
  const primaryCardStatus = formatCardStatus(primaryVocabulary);

  return (
    <div className="details">
      <div className="label">Détails du token</div>
      <div className="details-box">
        {jpdbError ? (
          <div className="details-error">{jpdbError}</div>
        ) : selectedSurface ? (
          <div className="details-content">
            <div className="details-token-hero" lang="ja">
              <div className="details-token-hero__header">
                <RubyText
                  parts={selectedRubyParts.length > 0 ? selectedRubyParts : [{ text: selectedSurface, reading: null, hasKanji: isKanjiText(selectedSurface) }]}
                  className="details-token-hero__surface"
                />
                {primaryCardStatus ? (
                  <span className="details-meta-pill details-meta-pill--status">{primaryCardStatus}</span>
                ) : null}
              </div>
              <div className="details-token-hero__meta">
                {primaryVocabulary?.reading ? (
                  <span>Lecture principale : {primaryVocabulary.reading}</span>
                ) : null}
                {primaryVocabulary ? (
                  <span className="details-meta-pill">{formatFrequencyRank(primaryVocabulary.frequencyRank)}</span>
                ) : null}
              </div>
              {hasSingleVocabulary && primaryMeanings.length > 0 ? (
                <ol className="details-token-hero__meanings">
                  {primaryMeanings.map((meaning, index) => (
                    <li key={`primary-meaning-${index}`} className="details-token-hero__meaning">
                      {meaning}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>

            {hasVocabulary && !hasSingleVocabulary ? (
              <div className="details-section">
                <div className="details-section__title">Vocabulaire JPDB</div>
                <div className="details-vocab-list">
                  {selectedVocabulary.map((entry) => {
                    const cardStatus = formatCardStatus(entry);

                    return (
                      <div key={`${entry.vid}-${entry.spelling}-${entry.reading}`} className="details-vocab-item">
                        <div className="details-vocab-item__top" lang="ja">
                          <RubyText
                            parts={[{
                              text: entry.spelling,
                              reading: entry.reading && entry.reading !== entry.spelling ? entry.reading : null,
                              hasKanji: isKanjiText(entry.spelling),
                            }]}
                            className="details-vocab-item__spelling"
                          />
                          <div className="details-vocab-item__badges">
                            <span className="details-vocab-item__badge">{formatFrequencyRank(entry.frequencyRank)}</span>
                            {cardStatus ? (
                              <span className="details-vocab-item__badge details-vocab-item__badge--status">
                                {cardStatus}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <ol className="details-vocab-item__meanings">
                          {(entry.meanings || []).slice(0, 4).map((meaning, index) => (
                            <li key={`${entry.vid}-${index}`} className="details-meaning-line">{meaning}</li>
                          ))}
                        </ol>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {hasKanji ? (
              <div className="details-section">
                <div className="details-section__title">Kanji du mot</div>
                <div className="details-kanji-grid">
                  {kanjiDetails.map((detail, index) => (
                    <div
                      key={`${detail.kanji}-${detail.segmentText}-${index}`}
                      className="details-kanji-card"
                    >
                      <div className="details-kanji-card__char" lang="ja">{detail.kanji}</div>
                      <div className="details-kanji-card__meaning">
                        {detail.meanings && detail.meanings.length > 0
                          ? detail.meanings.slice(0, 3).join(', ')
                          : kanjiMeaningsLoading
                            ? 'Chargement du sens...'
                            : 'Sens indisponible'}
                      </div>
                      <div className="details-kanji-card__reading">
                        {detail.reading
                          ? `Lecture : ${detail.reading}`
                          : detail.segmentReading
                            ? `Lecture du groupe : ${detail.segmentReading}`
                            : 'Lecture indisponible'}
                      </div>
                      {detail.dictionaryKunReadings && detail.dictionaryKunReadings.length > 0 ? (
                        <div className="details-kanji-card__dictionary-reading">
                          Kun : {detail.dictionaryKunReadings.slice(0, 3).join(', ')}
                        </div>
                      ) : null}
                      {detail.dictionaryOnReadings && detail.dictionaryOnReadings.length > 0 ? (
                        <div className="details-kanji-card__dictionary-reading">
                          On : {detail.dictionaryOnReadings.slice(0, 3).join(', ')}
                        </div>
                      ) : null}
                      <div className="details-kanji-card__context" lang="ja">
                        Segment : {detail.segmentText}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <i>Sélectionne un token dans la phrase pour afficher son détail.</i>
        )}
      </div>
    </div>
  );
}
