import React, { useMemo, useState } from "react";
import type { MangaCorrespondenceDiscovery } from "@/renderer/backgroundSearch/types";
import type { MangaCorrespondenceResultDecision } from "@/shared/backgroundSearch";

type Props = {
  discoveries: MangaCorrespondenceDiscovery[];
  resultDecisions: MangaCorrespondenceResultDecision[];
  disabled?: boolean;
  onCancel: () => void;
  onSave: (
    discoveries: MangaCorrespondenceDiscovery[],
    resultDecisions: MangaCorrespondenceResultDecision[],
    replay: boolean,
  ) => Promise<void>;
};

type Tab = "result" | MangaCorrespondenceDiscovery["kind"];

const ORIGIN_LABELS: Record<MangaCorrespondenceDiscovery["origin"], string> = {
  reference: "Référence",
  card: "Card",
  details: "Fiche",
  authorPage: "Page auteur",
};

export default function MangaCorrespondenceDiscoveriesDialog({
  discoveries,
  resultDecisions,
  disabled = false,
  onCancel,
  onSave,
}: Props) {
  const [tab, setTab] = useState<Tab>("result");
  const [statuses, setStatuses] = useState(() => new Map(
    discoveries.map((discovery) => [discovery.key, discovery.status]),
  ));
  const [resultStatuses, setResultStatuses] = useState(() => new Map(
    resultDecisions.map((decision) => [decision.key, decision.status]),
  ));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const nextDiscoveries = useMemo(() => discoveries.map((discovery) => ({
    ...discovery,
    status: statuses.get(discovery.key) ?? discovery.status,
  })), [discoveries, statuses]);
  const nextResultDecisions = useMemo(() => resultDecisions.map((decision) => ({
    ...decision,
    status: resultStatuses.get(decision.key) ?? decision.status,
  })), [resultDecisions, resultStatuses]);
  const filterKey = filter.trim().toLocaleLowerCase();
  const visibleDiscoveries = tab === "result"
    ? []
    : nextDiscoveries.filter((discovery) => (
      discovery.kind === tab
      && (!filterKey || `${discovery.value} ${discovery.scraperName}`.toLocaleLowerCase().includes(filterKey))
    ));
  const visibleResultDecisions = nextResultDecisions.filter((decision) => (
    !filterKey || `${decision.title} ${decision.scraperName}`.toLocaleLowerCase().includes(filterKey)
  ));
  const resultCount = nextResultDecisions.length;
  const titleCount = nextDiscoveries.filter((discovery) => discovery.kind === "title").length;
  const authorCount = nextDiscoveries.filter((discovery) => discovery.kind === "author").length;
  const activeTitleCount = nextDiscoveries.filter((discovery) => (
    discovery.kind === "title" && discovery.status === "active"
  )).length;
  const changed = nextDiscoveries.some((discovery, index) => (
    discovery.status !== discoveries[index]?.status
  )) || nextResultDecisions.some((decision, index) => (
    decision.status !== resultDecisions[index]?.status
  ));

  const submit = async (replay: boolean) => {
    if (replay && activeTitleCount === 0) {
      setError("Réactive au moins un titre avant de rejouer la recherche.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSave(nextDiscoveries, nextResultDecisions, replay);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Impossible d’enregistrer les découvertes.");
      setSubmitting(false);
    }
  };

  return (
    <div className="manga-correspondence-discoveries-dialog">
      <p>
        Chaque valeur reste séparée par scrapper. Un résultat invalidé sert aussi de contre-exemple :
        les cards qui lui ressemblent davantage qu’aux références actives restent dans les potentiels.
      </p>
      <div className="manga-correspondence-discoveries-dialog__tabs" role="tablist">
        <button type="button" className={tab === "result" ? "is-active" : ""} onClick={() => setTab("result")}>Résultats ({resultCount})</button>
        <button type="button" className={tab === "title" ? "is-active" : ""} onClick={() => setTab("title")}>Titres ({titleCount})</button>
        <button type="button" className={tab === "author" ? "is-active" : ""} onClick={() => setTab("author")}>Auteurs ({authorCount})</button>
      </div>
      <input
        className="manga-correspondence-discoveries-dialog__filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filtrer par titre, auteur ou scrapper…"
      />
      <div className="manga-correspondence-discoveries-dialog__list">
        {tab === "result" ? (visibleResultDecisions.length ? visibleResultDecisions.map((decision) => (
          <label
            key={decision.key}
            className={decision.status === "invalidated" ? "is-invalidated" : ""}
          >
            <input
              type="checkbox"
              checked={decision.status === "active"}
              disabled={disabled || submitting}
              onChange={(event) => setResultStatuses((current) => {
                const next = new Map(current);
                next.set(decision.key, event.target.checked ? "active" : "invalidated");
                return next;
              })}
            />
            <span>
              <strong>{decision.title}</strong>
              <small>{decision.scraperName} · {decision.origin === "match" ? "Correspondance" : "Potentiel"}</small>
            </span>
            <em>{decision.status === "active" ? "Actif" : "Invalidé"}</em>
          </label>
        )) : <div className="empty">Aucun résultat ne correspond à ce filtre.</div>) : visibleDiscoveries.length ? visibleDiscoveries.map((discovery) => (
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
        )) : <div className="empty">Aucune découverte ne correspond à ce filtre.</div>}
      </div>
      {disabled ? <p className="manga-correspondence-discoveries-dialog__hint">Arrête ou termine la recherche avant de modifier ces choix.</p> : null}
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
