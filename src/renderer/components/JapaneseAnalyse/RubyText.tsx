import React from 'react';
import { JpdbRubyPart } from '@/renderer/services/jpdb';

type Props = {
  parts: JpdbRubyPart[];
  className?: string;
};

export default function RubyText({ parts, className }: Props) {
  if (parts.length === 0) {
    return null;
  }

  return (
    <span className={className}>
      {parts.map((part, index) => (
        part.reading ? (
          <ruby key={`${part.text}-${part.reading}-${index}`} className="jp-ruby">
            {part.text}
            <rt>{part.reading}</rt>
          </ruby>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        )
      ))}
    </span>
  );
}
