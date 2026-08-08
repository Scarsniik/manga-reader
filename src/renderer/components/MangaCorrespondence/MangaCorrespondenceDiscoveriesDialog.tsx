import React, { useMemo, useState } from "react";
import type { MangaCorrespondenceDiscovery } from "@/renderer/backgroundSearch/types";
import type { MangaCorrespondenceResultDecision } from "@/shared/backgroundSearch";

type Props = {
  discoveries: MangaCorrespondenceDiscovery[];
  resultDecisions: MangaCorrespondenceResultDecision[];
  disabled?: boolean;
  onCancel: () => void;
  onOpenAuthorPage: (discovery: MangaCorrespondenceDiscovery) => Promise<void>;
  onResolveManualDiscovery: (
    kind: MangaCorrespondenceDiscovery["kind"],
    value: string,
  ) => Promise<MangaCorrespondenceDiscovery>;
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
  manual: "Ajout manuel",
};

export default function MangaCorrespondenceDiscoveriesDialog({
  discoveries,
  resultDecisions,
  disabled = false,
  onCancel,
  onOpenAuthorPage,
  onResolveManualDiscovery,
  onSave,
}: Props) {
  const [tab, setTab] = useState<Tab>("result");
  const [draftDiscoveries, setDraftDiscoveries] = useState(discoveries);
  const [resultStatuses, setResultStatuses] = useState(() => new Map(
    resultDecisions.map((decision) => [decision.key, decision.status]),
  ));
  const [submitting, setSubmitting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const nextDiscoveries = draftDiscoveries;
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
    discovery.key !== discoveries[index]?.key
    || discovery.status !== discoveries[index]?.status
    || discovery.sourceUrl !== discoveries[index]?.sourceUrl
    || discovery.authorPageUrl !== discoveries[index]?.authorPageUrl
  )) || nextResultDecisions.some((decision, index) => (
    decision.status !== resultDecisions[index]?.status
  )) || nextDiscoveries.length !== discoveries.length;

  const addManualDiscovery = async () => {
    if (tab === "result" || !manualValue.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const discovery = await onResolveManualDiscovery(tab, manualValue);
      setDraftDiscoveries((current) => {
        const existingIndex = current.findIndex((entry) => entry.key === discovery.key);
        if (existingIndex < 0) return [...current, discovery];
        return current.map((entry, index) => index === existingIndex
          ? {
            ...entry,
            ...discovery,
            origin: entry.origin === "reference" ? "reference" : discovery.origin,
            propagationConfidence: entry.origin === "reference"
              ? entry.propagationConfidence
              : discovery.propagationConfidence,
            parentStepIds: Array.from(new Set([
              ...entry.parentStepIds,
              ...discovery.parentStepIds,
            ])),
            evidenceCount: Math.max(entry.evidenceCount, discovery.evidenceCount),
            status: "active",
          }
          : entry);
      });
      setManualValue("");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Cet ajout n’a pas pu être validé.");
    } finally {
      setAdding(false);
    }
  };

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
      {tab !== "result" ? (
        <div className="manga-correspondence-discoveries-dialog__manual-add">
          <input
            value={manualValue}
            disabled={disabled || submitting || adding}
            onChange={(event) => setManualValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void addManualDiscovery();
            }}
            placeholder={tab === "title"
              ? "Titre ou URL d’une fiche manga…"
              : "Nom d’auteur ou URL d’une page auteur…"}
          />
          <button
            type="button"
            disabled={disabled || submitting || adding || !manualValue.trim()}
            onClick={() => void addManualDiscovery()}
          >
            {adding ? "Vérification…" : "Ajouter"}
          </button>
        </div>
      ) : null}
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
              onChange={(event) => setDraftDiscoveries((current) => current.map((entry) => (
                entry.key === discovery.key
                  ? { ...entry, status: event.target.checked ? "active" : "invalidated" }
                  : entry
              )))}
            />
            <span>
              <strong>{discovery.value}</strong>
              <small>{discovery.scraperName} · {ORIGIN_LABELS[discovery.origin]}{discovery.evidenceCount > 1 ? ` · ${discovery.evidenceCount} preuves` : ""}</small>
            </span>
            {discovery.kind === "author" && discovery.authorPageUrl ? (
              <button
                type="button"
                className="manga-correspondence-discoveries-dialog__open-author"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setError(null);
                  void onOpenAuthorPage(discovery).catch((openError) => {
                    setError(openError instanceof Error
                      ? openError.message
                      : "La page auteur n’a pas pu être ouverte.");
                  });
                }}
                title={`Ouvrir la page auteur ${discovery.value} dans un nouvel onglet`}
              >
                Ouvrir
              </button>
            ) : null}
            <em>{discovery.status === "active" ? "Active" : "Invalidée"}</em>
          </label>
        )) : <div className="empty">Aucune découverte ne correspond à ce filtre.</div>}
      </div>
      {disabled ? <p className="manga-correspondence-discoveries-dialog__hint">Arrête ou termine la recherche avant de modifier ces choix.</p> : null}
      {activeTitleCount === 0 ? <p className="manga-correspondence-discoveries-dialog__error">Aucun titre actif : le rejeu est bloqué.</p> : null}
      {error ? <p className="manga-correspondence-discoveries-dialog__error">{error}</p> : null}
      <div className="manga-correspondence-discoveries-dialog__actions">
        <button type="button" className="secondary" disabled={submitting || adding} onClick={onCancel}>Annuler</button>
        <button type="button" disabled={disabled || submitting || adding || !changed} onClick={() => void submit(false)}>Enregistrer</button>
        <button type="button" disabled={disabled || submitting || adding || activeTitleCount === 0} onClick={() => void submit(true)}>
          {submitting ? "Préparation…" : "Enregistrer et rejouer"}
        </button>
      </div>
    </div>
  );
}
