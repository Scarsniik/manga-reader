import React from 'react';
import './DetailsPanel.scss';

type Details = any | null;

type Props = {
  jpdbError: string | null;
  parseResult: any | null;
  selectedWord: string | null;
  selectedTokenIndex: number | null;
};

export default function DetailsPanel({ jpdbError, parseResult, selectedWord, selectedTokenIndex }: Props) {
  const details: Details = null; // placeholder for potential mock lookup
  return (
    <div className="details">
      <div className="label">Détails :</div>
      <div className="details-box">
        {jpdbError ? (
          <div className="details-error">{jpdbError}</div>
        ) : parseResult && selectedWord ? (
          <div>
            <div className="details-vocab-list">
              {parseResult.vocabulary.length === 0 && <>
              <div className="details-word">{selectedWord}</div>
              <i>— aucun vocabulaire —</i>
              </>}
              {(() => {
                if (selectedTokenIndex !== null && parseResult.tokens[selectedTokenIndex]) {
                  const token = parseResult.tokens[selectedTokenIndex];
                  const vocabIndex = token[0] as number | number[] | null;
                  const indexes: number[] = Array.isArray(vocabIndex) ? vocabIndex as number[] : (vocabIndex != null ? [vocabIndex as number] : []);
                  const matches = indexes.length > 0 ? indexes.map((i: number) => parseResult.vocabulary[i]).filter(Boolean) : null;
                  if (matches && matches.length > 0) {
                    return matches.map((v: any, i: number) => (
                      <div key={i} className="details-vocab-item">
                        <div className="spelling">{v[3]} <span className="reading">({v[4]})</span></div>
                        <div className="meanings">{(v[6] || []).slice(0,3).join('; ')}</div>
                      </div>
                    ));
                  }
                }

                return parseResult.vocabulary.map((v: any, i: number) => (
                  <div key={i} className="details-vocab-item">
                    <div className="spelling">{v[3]} <span className="reading">({v[4]})</span></div>
                    <div className="meanings">{(v[6] || []).slice(0,3).join('; ')}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        ) : details ? (
          <div>
            <div className="details-word">{(details as any).word}</div>
            <div className="details-sub">Readings: {(details as any).readings?.join(', ') || '—'}</div>
            <div className="details-senses">
              {((details as any).senses || []).map((s: any, i: number) => (
                <div key={i} className="details-sense">
                  • {s.gloss} {s.pos ? <em className="details-sense-pos">({s.pos})</em> : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <i>Sélectionner un token pour voir les détails</i>
        )}
      </div>
    </div>
  );
}
