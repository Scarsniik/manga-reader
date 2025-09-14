import React from 'react';
import './TokensList.scss';

type Props = {
  tokens: string[];
  parseResult: any | null;
  text: string;
  selectedTokenIndex: number | null;
  selectedWord: string | null;
  onTokenClick: (word: string, idx?: number | null) => void;
};

export default function TokensList({ tokens, parseResult, text, selectedTokenIndex, selectedWord, onTokenClick }: Props) {
  return (
    <div className="tokens">
      <div className="label">Tokens :</div>
      <div className="tokens-list">
        {(!parseResult || (parseResult && parseResult.tokens.length === 0)) && tokens.length === 0 && <i>— aucun —</i>}

        {parseResult && parseResult.tokens && parseResult.tokens.length > 0 ? (
          parseResult.tokens.map((tok: any, idx: number) => {
            const pos = tok[1] as number;
            const len = tok[2] as number;
            const surface = text && typeof pos === 'number' && typeof len === 'number' ? text.slice(pos, pos + len) : `tok${idx}`;
            const isActive = selectedTokenIndex === idx;
            return (
              <React.Fragment key={idx}>
                <button className={"token-btn" + (isActive ? ' active' : '')} onClick={() => onTokenClick(surface, idx)}>{surface}</button>
                {idx < parseResult.tokens.length - 1 && <span className="token-spacer" />}
              </React.Fragment>
            );
          })
        ) : (
          tokens.map((t, idx) => (
            <React.Fragment key={idx}>
              <button className={"token-btn" + (selectedWord === t ? ' active' : '')} onClick={() => onTokenClick(t, null)}>{t}</button>
              {idx < tokens.length - 1 && <span className="token-spacer" />}
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}
