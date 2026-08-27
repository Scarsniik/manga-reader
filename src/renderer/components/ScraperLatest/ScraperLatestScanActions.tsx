import React from "react";

type Props = {
  loading: boolean;
  disabled: boolean;
  quickLabel: string;
  continuousLabel: string;
  deepLabel: string;
  onQuick: () => void;
  onContinuous: () => void;
  onDeep: () => void;
};

type ScanActionProps = {
  className: string;
  eyebrow: string;
  title: string;
  description: string;
  buttonLabel: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
};

function ScanAction({
  className,
  eyebrow,
  title,
  description,
  buttonLabel,
  loading,
  disabled,
  onClick,
}: ScanActionProps) {
  return (
    <article className={`scraper-latest-scan-actions__option ${className}`}>
      <div>
        <span className="scraper-latest-scan-actions__eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button type="button" onClick={onClick} disabled={loading || disabled}>
        {loading ? "Scan en cours..." : buttonLabel}
      </button>
    </article>
  );
}

export default function ScraperLatestScanActions({
  loading,
  disabled,
  quickLabel,
  continuousLabel,
  deepLabel,
  onQuick,
  onContinuous,
  onDeep,
}: Props) {
  return (
    <div className="scraper-latest-scan-actions" aria-label="Modes de scan des nouveautés">
      <div className="scraper-latest-scan-actions__intro">
        <div>
          <span>Collecte des sources</span>
          <strong>Choisis la portée du scan</strong>
        </div>
        <p>Les résultats déjà affichés sont remplacés au lancement d’un nouveau scan.</p>
      </div>
      <div className="scraper-latest-scan-actions__grid">
        <ScanAction
          className="is-quick"
          eyebrow="Recommandé"
          title="Les dernières sorties"
          description="Respecte le quota de session et s’arrête dès que les résultats redeviennent connus."
          buttonLabel={quickLabel}
          loading={loading}
          disabled={disabled}
          onClick={onQuick}
        />
        <ScanAction
          className="is-continuous"
          eyebrow="Sans quota"
          title="Toutes les nouveautés"
          description="Continue tant qu’il reste des cards inédites. Un garde-fou protège les sources encore jamais scannées."
          buttonLabel={continuousLabel}
          loading={loading}
          disabled={disabled}
          onClick={onContinuous}
        />
        <ScanAction
          className="is-deep"
          eyebrow="Historique"
          title="Explorer plus loin"
          description="Cherche d’abord les sorties récentes, puis utilise les checkpoints si le quota n’est pas rempli."
          buttonLabel={deepLabel}
          loading={loading}
          disabled={disabled}
          onClick={onDeep}
        />
      </div>
    </div>
  );
}
