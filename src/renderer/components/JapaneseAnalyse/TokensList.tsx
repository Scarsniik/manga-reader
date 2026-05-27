import React from 'react';
import { JpdbSentenceSegment } from '@/renderer/services/jpdb';
import RubyText from './RubyText';
import './TokensList.scss';

type Props = {
  text: string;
  sentenceSegments: JpdbSentenceSegment[];
  selectedTokenIndex: number | null;
  onTokenClick: (idx: number) => void;
};

export default function TokensList({
  text,
  sentenceSegments,
  selectedTokenIndex,
  onTokenClick,
}: Props) {
  const tokenCount = sentenceSegments.filter((segment) => segment.kind === 'token').length;

  const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()?.toString() || '';
    // Only override default copy when the selection contains newlines
    // (the problematic case where each token becomes a separate line).
    if (!selection.includes('\n')) {
      return;
    }
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
  };

  return (
    <div className="tokens">
      <div className="tokens-header">
        <div className="label">Phrase tokenisée</div>
        <span className="tokens-meta">
          {tokenCount > 0 ? `${tokenCount} token${tokenCount > 1 ? 's' : ''}` : 'Aucun token'}
        </span>
      </div>

      <div className="tokens-list" lang="ja" onCopy={handleCopy}>
        {text.length === 0 ? <i>— aucun texte —</i> : null}

        {sentenceSegments.map((segment, index) => {
          if (segment.kind === 'text') {
            return (
              <span key={`text-${index}`} className="token-static">
                {segment.text}
              </span>
            );
          }

          const isActive = selectedTokenIndex === segment.index;
          return (
            <button
              key={`token-${segment.index}-${segment.surface}-${index}`}
              className={`token-btn${isActive ? ' active' : ''}`}
              onClick={() => onTokenClick(segment.index)}
              type="button"
            >
              <RubyText parts={segment.rubyParts} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
