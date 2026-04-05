import React from 'react';
import type { ScraperTemplateContext as ScraperTemplateContextMap } from '@/renderer/utils/scraperTemplateContext';

type Props = {
  templateContext: ScraperTemplateContextMap;
  emptyMessage: React.ReactNode;
};

export default function ScraperTemplateContext({
  templateContext,
  emptyMessage,
}: Props) {
  if (Object.keys(templateContext).length === 0) {
    return (
      <div className="scraper-config-placeholder">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="scraper-template-context">
      {Object.entries(templateContext).map(([key, value]) => (
        value ? (
          <div key={key} className="scraper-template-context__item">
            <code>{`{{${key}}}`}</code>
            <span>{value}</span>
          </div>
        ) : null
      ))}
    </div>
  );
}
