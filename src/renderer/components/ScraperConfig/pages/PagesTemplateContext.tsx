import React from 'react';

type Props = {
  templateContext: Record<string, string | undefined>;
};

export default function PagesTemplateContext({ templateContext }: Props) {
  if (Object.keys(templateContext).length === 0) {
    return (
      <div className="scraper-config-placeholder">
        Aucune fiche validee n&apos;est disponible pour le moment. Tu peux enregistrer la
        configuration, mais la validation des pages restera indisponible tant que `Fiche`
        n&apos;aura pas ete validee.
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
