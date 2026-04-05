import React from 'react';
import { FakeDetailsPreview as FakeDetailsPreviewData } from '@/renderer/components/ScraperConfig/details/detailsFeatureEditor.utils';

type Props = {
  preview: FakeDetailsPreviewData | null;
};

export default function FakeDetailsPreview({ preview }: Props) {
  if (!preview) {
    return null;
  }

  return (
    <div className="scraper-fake-details">
      <div className="scraper-fake-details__media">
        {preview.cover ? (
          <img src={preview.cover} alt={preview.title || 'Couverture'} />
        ) : (
          <div className="scraper-fake-details__media-placeholder">Image</div>
        )}
      </div>

      <div className="scraper-fake-details__content">
        <h5>{preview.title || 'Titre non detecte'}</h5>

        <div className="scraper-fake-details__meta">
          {preview.status ? (
            <span className="scraper-feature-pill is-not-configured">{preview.status}</span>
          ) : null}
          {preview.authors ? (
            <span className="scraper-feature-pill is-configured">{preview.authors}</span>
          ) : null}
          {preview.tags ? (
            <span className="scraper-feature-pill is-validated">{preview.tags}</span>
          ) : null}
        </div>

        <p>{preview.description || 'Aucune description detectee sur cette page de test.'}</p>

        {preview.derivedValues.length ? (
          <div className="scraper-fake-details__variables">
            <span className="scraper-fake-details__variables-title">Variables extraites</span>
            <div className="scraper-fake-details__variables-list">
              {preview.derivedValues.map((derivedValue) => (
                <div key={derivedValue.key} className="scraper-fake-details__variable">
                  <code>{`{{${derivedValue.key}}}`}</code>
                  <strong>{derivedValue.value}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
