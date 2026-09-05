import React from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import { useModal } from "@/renderer/hooks/useModal";
import {
  getScraperLatestCheckpoints,
  resetScraperLatestCheckpoints,
} from "@/renderer/utils/scraperLatestCheckpoints";
import type {
  ResetScraperLatestCheckpointTarget,
  ScraperLatestCheckpointRecord,
  ScraperRecord,
  ScraperTagFavoriteRecord,
} from "@/shared/scraper";
import {
  buildScraperCheckpointEntries,
  buildTagCheckpointEntries,
  getScraperLatestCheckpointCount,
  type ScraperLatestCheckpointEntry,
} from "@/renderer/components/ScraperLatest/scraperLatestCheckpointManagement";
import "@/renderer/components/ScraperLatest/ScraperLatestCheckpointModal.scss";

type Props = {
  scrapers: ScraperRecord[];
  tagFavorites: ScraperTagFavoriteRecord[];
};

type CheckpointTab = "scrapers" | "tags";

const formatDate = (value: string | undefined): string => {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(timestamp)
    : "Inconnue";
};

const getLanguageLabel = (checkpoint: ScraperLatestCheckpointRecord): string => (
  checkpoint.includedLanguageCodes.length
    ? checkpoint.includedLanguageCodes.join(" + ").toUpperCase()
    : "Toutes les langues"
);

const getCheckpointPageLabel = (checkpoint: ScraperLatestCheckpointRecord): string => {
  const lastPage = Math.max(0, checkpoint.pageIndex) + 1;
  if (checkpoint.reachedEnd === true) {
    return `Page ${lastPage} · fin atteinte`;
  }

  if (checkpoint.cursorVersion === 2 && Number.isFinite(checkpoint.nextPageIndex)) {
    return `Page ${lastPage} traitée · reprise page ${Math.max(0, checkpoint.nextPageIndex ?? 0) + 1}`;
  }

  return `Page ${lastPage} traitée · reprise héritée`;
};

const getQuotaStatus = (checkpoint: ScraperLatestCheckpointRecord): string | null => {
  if (checkpoint.quotaUnavailableReason === "languageRejectLimit") {
    return `Suspendu après trop de refus de langue jusqu'au ${formatDate(checkpoint.quotaUnavailableUntil)}`;
  }

  if (checkpoint.quotaUnavailableReason === "pageLimitWithoutResults") {
    return `Suspendu après la limite de pages sans résultat jusqu'au ${formatDate(checkpoint.quotaUnavailableUntil)}`;
  }

  return null;
};

const getEntrySummary = (entry: ScraperLatestCheckpointEntry): string => {
  const checkpoints = entry.sections.flatMap((section) => section.checkpoints);
  if (!checkpoints.length) return "Pas encore parcouru";
  const reachedEndCount = checkpoints.filter((checkpoint) => checkpoint.reachedEnd === true).length;
  const endSummary = reachedEndCount > 0 ? ` · ${reachedEndCount} au bout` : "";
  return `${checkpoints.length} progression(s)${endSummary}`;
};

function CheckpointVariant({
  checkpoint,
  scraperUpdatedAt,
}: {
  checkpoint: ScraperLatestCheckpointRecord;
  scraperUpdatedAt?: string;
}) {
  const quotaStatus = getQuotaStatus(checkpoint);
  const usesCurrentScraperConfig = !checkpoint.scraperUpdatedAt
    || !scraperUpdatedAt
    || checkpoint.scraperUpdatedAt === scraperUpdatedAt;
  return (
    <div className="scraper-latest-checkpoints-modal__variant">
      <div className="scraper-latest-checkpoints-modal__variant-head">
        <strong>{getLanguageLabel(checkpoint)}</strong>
        <span className={checkpoint.reachedEnd === true ? "is-complete" : ""}>
          {getCheckpointPageLabel(checkpoint)}
        </span>
      </div>
      <dl>
        <div><dt>Mis à jour</dt><dd>{formatDate(checkpoint.updatedAt)}</dd></div>
        <div><dt>Fin du catalogue</dt><dd>{checkpoint.reachedEnd === undefined ? "Inconnue" : checkpoint.reachedEnd ? "Oui" : "Non"}</dd></div>
        <div><dt>Configuration</dt><dd>{usesCurrentScraperConfig ? "Actuelle" : "Ancienne · ignorée à la reprise"}</dd></div>
        {checkpoint.currentPageUrl ? <div><dt>Dernière page</dt><dd title={checkpoint.currentPageUrl}>{checkpoint.currentPageUrl}</dd></div> : null}
        {checkpoint.nextPageUrl ? <div><dt>Page suivante</dt><dd title={checkpoint.nextPageUrl}>{checkpoint.nextPageUrl}</dd></div> : null}
        {checkpoint.anchorIdentity?.title ? <div><dt>Card d'ancrage</dt><dd>{checkpoint.anchorIdentity.title}</dd></div> : null}
      </dl>
      {quotaStatus ? <p className="scraper-latest-checkpoints-modal__warning">{quotaStatus}</p> : null}
    </div>
  );
}

function CheckpointEntry({
  entry,
  resettingKey,
  confirmationKey,
  onRequestReset,
  onConfirmReset,
  onCancelReset,
}: {
  entry: ScraperLatestCheckpointEntry;
  resettingKey: string | null;
  confirmationKey: string | null;
  onRequestReset: (key: string) => void;
  onConfirmReset: (key: string, name: string, target: ResetScraperLatestCheckpointTarget) => void;
  onCancelReset: () => void;
}) {
  const checkpointCount = getScraperLatestCheckpointCount(entry);
  const resetting = resettingKey === entry.key;
  const confirmationPending = confirmationKey === entry.key;
  return (
    <details className="scraper-latest-checkpoints-modal__entry">
      <summary>
        <span><strong>{entry.name}</strong><small>{entry.detail}</small></span>
        <em>{getEntrySummary(entry)}</em>
      </summary>
      <div className="scraper-latest-checkpoints-modal__entry-body">
        <div className="scraper-latest-checkpoints-modal__sections">
          {entry.sections.map((section) => {
            const sectionResetting = resettingKey === section.key;
            const sectionConfirmationPending = confirmationKey === section.key;
            return (
              <details key={section.key} className="scraper-latest-checkpoints-modal__section">
                <summary>
                  <span><strong>{section.name}</strong><small>{section.detail}</small></span>
                  <em>{section.checkpoints.length ? `${section.checkpoints.length} variante(s)` : "Aucune progression"}</em>
                </summary>
                <div className="scraper-latest-checkpoints-modal__variants">
                  {section.checkpoints.length
                    ? section.checkpoints.map((checkpoint) => (
                      <CheckpointVariant
                        key={checkpoint.id}
                        checkpoint={checkpoint}
                        scraperUpdatedAt={section.scraperUpdatedAt}
                      />
                    ))
                    : <p className="scraper-latest-checkpoints-modal__empty">Aucun point de reprise enregistré pour cette section.</p>}
                  {sectionConfirmationPending ? (
                    <div className="scraper-latest-checkpoints-modal__confirm is-section" role="alert">
                      <p>Seule cette sous-section repartira du début, pour toutes ses langues.</p>
                      <div>
                        <button type="button" onClick={onCancelReset} disabled={sectionResetting}>Annuler</button>
                        <button type="button" className="danger" onClick={() => onConfirmReset(section.key, section.name, section.target)} disabled={sectionResetting}>
                          {sectionResetting ? "Reset en cours..." : "Confirmer"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="scraper-latest-checkpoints-modal__reset is-section"
                      disabled={section.checkpoints.length === 0 || resettingKey !== null}
                      onClick={() => onRequestReset(section.key)}
                    >
                      Reset cette sous-section
                    </button>
                  )}
                </div>
              </details>
            );
          })}
        </div>
        {confirmationPending ? (
          <div className="scraper-latest-checkpoints-modal__confirm" role="alert">
            <p>Le prochain scan profond repartira du début pour toutes les langues de cet élément.</p>
            <div>
              <button type="button" onClick={onCancelReset} disabled={resetting}>Annuler</button>
              <button type="button" className="danger" onClick={() => onConfirmReset(entry.key, entry.name, entry.target)} disabled={resetting}>
                {resetting ? "Reset en cours..." : "Confirmer le reset"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="scraper-latest-checkpoints-modal__reset"
            disabled={checkpointCount === 0 || resettingKey !== null}
            onClick={() => onRequestReset(entry.key)}
          >
            Reset le scan profond
          </button>
        )}
      </div>
    </details>
  );
}

function ScraperLatestCheckpointModalContent({ scrapers, tagFavorites }: Props) {
  const { closeModal } = useModal();
  const [activeTab, setActiveTab] = React.useState<CheckpointTab>("tags");
  const [checkpoints, setCheckpoints] = React.useState<ScraperLatestCheckpointRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [confirmationKey, setConfirmationKey] = React.useState<string | null>(null);
  const [resettingKey, setResettingKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    void getScraperLatestCheckpoints()
      .then((records) => {
        if (active) setCheckpoints(records);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Impossible de charger les progressions.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const scraperEntries = React.useMemo(
    () => buildScraperCheckpointEntries(scrapers, checkpoints),
    [checkpoints, scrapers],
  );
  const tagEntries = React.useMemo(
    () => buildTagCheckpointEntries(tagFavorites, scrapers, checkpoints),
    [checkpoints, scrapers, tagFavorites],
  );
  const entries = activeTab === "tags" ? tagEntries : scraperEntries;

  const handleReset = async (
    key: string,
    name: string,
    target: ResetScraperLatestCheckpointTarget,
  ) => {
    setResettingKey(key);
    setError(null);
    setMessage(null);
    try {
      const result = await resetScraperLatestCheckpoints({ target });
      setCheckpoints(result.checkpoints);
      setConfirmationKey(null);
      setMessage(`${name} : ${result.removedCount} point(s) de reprise supprimé(s).`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Le reset a échoué.");
    } finally {
      setResettingKey(null);
    }
  };

  return (
    <div className="scraper-latest-checkpoints-modal">
      <p className="scraper-latest-checkpoints-modal__intro">
        Consulte les points de reprise persistants. Le reset ne touche ni aux cards vues ni aux favoris.
      </p>
      <div className="scraper-latest-checkpoints-modal__tabs" role="tablist" aria-label="Types de progression">
        <button type="button" role="tab" aria-selected={activeTab === "tags"} className={activeTab === "tags" ? "is-active" : ""} onClick={() => setActiveTab("tags")}>Tags ({tagEntries.length})</button>
        <button type="button" role="tab" aria-selected={activeTab === "scrapers"} className={activeTab === "scrapers" ? "is-active" : ""} onClick={() => setActiveTab("scrapers")}>Scrapers ({scraperEntries.length})</button>
      </div>
      {error ? <div className="scraper-latest-checkpoints-modal__feedback is-error">{error}</div> : null}
      {message ? <div className="scraper-latest-checkpoints-modal__feedback is-success">{message}</div> : null}
      {loading ? <p className="scraper-latest-checkpoints-modal__empty">Chargement des progressions...</p> : null}
      {!loading && entries.length === 0 ? <p className="scraper-latest-checkpoints-modal__empty">Aucun élément configuré dans cette section.</p> : null}
      {!loading ? (
        <div className="scraper-latest-checkpoints-modal__list">
          {entries.map((entry) => (
            <CheckpointEntry
              key={entry.key}
              entry={entry}
              resettingKey={resettingKey}
              confirmationKey={confirmationKey}
              onRequestReset={setConfirmationKey}
              onCancelReset={() => setConfirmationKey(null)}
              onConfirmReset={(key, name, target) => void handleReset(key, name, target)}
            />
          ))}
        </div>
      ) : null}
      <div className="scraper-latest-checkpoints-modal__footer">
        <button type="button" onClick={() => closeModal()} disabled={resettingKey !== null}>Fermer</button>
      </div>
    </div>
  );
}

export default function buildScraperLatestCheckpointModal(props: Props): ModalOptions {
  return {
    title: "Progression des scans profonds",
    content: <ScraperLatestCheckpointModalContent {...props} />,
    className: "scraper-latest-checkpoints-modal-shell",
    bodyClassName: "scraper-latest-checkpoints-modal-body",
  };
}
