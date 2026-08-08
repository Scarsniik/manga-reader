import React, { useMemo, useState } from "react";
import type { MangaCorrespondenceDiscovery } from "@/renderer/backgroundSearch/types";

type Props = {
  discoveries: MangaCorrespondenceDiscovery[];
  disabled?: boolean;
  onCancel: () => void;
  onSave: (discoveries: MangaCorrespondenceDiscovery[], replay: boolean) => Promise<void>;
};

type Tab = MangaCorrespondenceDiscovery["kind"];

const ORIGIN_LABELS: Record<MangaCorrespondenceDiscovery["origin"], string> = {
  reference: "Référence",
  card: "Card",
  details: "Fiche",
  authorPage: "Page auteur",
};

export default function MangaCorrespondenceDiscoveriesDialog({
  discoveries,
  disabled = false,
  onCancel,
  onSave,
}: Props) {
  const [tab, setTab] = useState<Tab>("title");
  const [statuses, setStatuses] = useState(() => new Map(
    discoveries.map((discovery) => [discovery.key, discovery.status]),
  ));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextDiscoveries = useMemo(() => discoveries.map((discovery) => ({
    ...discovery,
    status: statuses.get(discovery.key) ?? discovery.status,
  })), [discoveries, statuses]);
  const visibleDiscoveries = nextDiscoveries.filter((discovery) => discovery.kind === tab);
  const titleCount = nextDiscoveries.filter((discovery) => discovery.kind === "title").length;
  const authorCount = nextDiscoveries.filter((discovery) => discovery.kind === "author").length;
  const activeTitleCount = nextDiscoveries.filter((discovery) => (
    discovery.kind === "title" && discovery.status === "active"
  )).length;
  const changed = nextDiscoveries.some((discovery, index) => (
    discovery.status !== discoveries[index]?.status
  ));

  const submit = async (replay: boolean) => {
    if (replay && activeTitleCount === 0) {
      setError("Réactive au moins un titre avant de rejouer la recherche.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSave(nextDiscoveries, replay);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Impossible d’enregistrer les découvertes.");
      setSubmitting(false);
    }
  };

  return (
    <div className="manga-correspondence-discoveries-dialog">
      <p>
        Chaque valeur reste séparée par scrapper. Désactiver une occurrence n’affecte pas la même valeur
        découverte sur un autre scrapper.
      </p>
      <div className="manga-correspondence-discoveries-dialog__tabs" role="tablist">
        <button type="button" className={tab === "title" ? "is-active" : ""} onClick={() => setTab("title")}>Titres ({titleCount})</button>
        <button type="button" className={tab === "author" ? "is-active" : ""} onClick={() => setTab("author")}>Auteurs ({authorCount})</button>
      </div>
      <div className="manga-correspondence-discoveries-dialog__list">
        {visibleDiscoveries.length ? visibleDiscoveries.map((discovery) => (
          <label
            key={discovery.key}
            className={discovery.status === "invalidated" ? "is-invalidated" : ""}
          >
            <input
              type="checkbox"
              checked={discovery.status === "active"}
              disabled={disabled || submitting}
              onChange={(event) => setStatuses((current) => {
                const next = new Map(current);
                next.set(discovery.key, event.target.checked ? "active" : "invalidated");
                return next;
              })}
            />
            <span>
              <strong>{discovery.value}</strong>
              <small>{discovery.scraperName} · {ORIGIN_LABELS[discovery.origin]}{discovery.evidenceCount > 1 ? ` · ${discovery.evidenceCount} preuves` : ""}</small>
            </span>
            <em>{discovery.status === "active" ? "Active" : "Invalidée"}</em>
          </label>
        )) : <div className="empty">Aucune découverte dans cette catégorie.</div>}
      </div>
      {disabled ? <p className="manga-correspondence-discoveries-dialog__hint">La recherche doit être terminée avant de modifier les découvertes.</p> : null}
      {activeTitleCount === 0 ? <p className="manga-correspondence-discoveries-dialog__error">Aucun titre actif : le rejeu est bloqué.</p> : null}
      {error ? <p className="manga-correspondence-discoveries-dialog__error">{error}</p> : null}
      <div className="manga-correspondence-discoveries-dialog__actions">
        <button type="button" className="secondary" disabled={submitting} onClick={onCancel}>Annuler</button>
        <button type="button" disabled={disabled || submitting || !changed} onClick={() => void submit(false)}>Enregistrer</button>
        <button type="button" disabled={disabled || submitting || activeTitleCount === 0} onClick={() => void submit(true)}>
          {submitting ? "Préparation…" : "Enregistrer et rejouer"}
        </button>
      </div>
    </div>
  );
}
