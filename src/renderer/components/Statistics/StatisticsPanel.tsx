import React from "react";
import type { ApplicationStatistics } from "@/shared/statistics";

import "@/renderer/components/Statistics/style.scss";

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

const formatNumber = (value: number): string => numberFormatter.format(value);

const formatBytes = (sizeBytes: number): string => {
  if (!sizeBytes) return "0 o";

  const units = ["o", "Ko", "Mo", "Go", "To"];
  const unitIndex = Math.min(
    Math.floor(Math.log(sizeBytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${formatNumber(sizeBytes / (1024 ** unitIndex))} ${units[unitIndex]}`;
};

type StatisticCardProps = {
  label: string;
  value: string;
  detail?: string;
};

function StatisticCard({ label, value, detail }: StatisticCardProps) {
  return (
    <article className="statistics-card">
      <span className="statistics-card__label">{label}</span>
      <strong className="statistics-card__value">{value}</strong>
      {detail ? <span className="statistics-card__detail">{detail}</span> : null}
    </article>
  );
}

type StatisticSectionProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

function StatisticSection({ title, description, children }: StatisticSectionProps) {
  return (
    <section className="statistics-section">
      <div className="statistics-section__heading">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

function UserDataBreakdown({ statistics }: { statistics: ApplicationStatistics["userData"] }) {
  return (
    <div className="statistics-files">
      {statistics.entries.length ? statistics.entries.map((entry) => {
        const width = statistics.totalSizeBytes
          ? Math.max(1, (entry.sizeBytes / statistics.totalSizeBytes) * 100)
          : 0;

        return (
          <div className="statistics-file" key={entry.name}>
            <div className="statistics-file__summary">
              <span title={entry.name}>{entry.name}</span>
              <strong>{formatBytes(entry.sizeBytes)}</strong>
            </div>
            <div className="statistics-file__track" aria-hidden="true">
              <span style={{ width: `${width}%` }} />
            </div>
            <small>{formatNumber(entry.fileCount)} fichier{entry.fileCount > 1 ? "s" : ""}</small>
          </div>
        );
      }) : (
        <p className="statistics-empty">Aucun fichier utilisateur trouvé.</p>
      )}
    </div>
  );
}

export default function StatisticsPanel() {
  const [statistics, setStatistics] = React.useState<ApplicationStatistics | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (!window.api || typeof window.api.getApplicationStatistics !== "function") {
          throw new Error("Les statistiques ne sont pas disponibles dans cette version.");
        }

        const nextStatistics = await window.api.getApplicationStatistics();
        if (!cancelled) setStatistics(nextStatistics);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <div className="statistics-status statistics-status--error">{error}</div>;
  }

  if (!statistics) {
    return <div className="statistics-status">Calcul des statistiques en lecture seule…</div>;
  }

  const inaccessibleDetail = statistics.library.inaccessibleMangaCount
    ? `${formatNumber(statistics.library.inaccessibleMangaCount)} dossier(s) inaccessible(s)`
    : "Tous les dossiers sont accessibles";

  return (
    <div className="statistics-panel">
      <div className="statistics-intro">
        <div>
          <span className="statistics-intro__eyebrow">Le coin des chiffres</span>
          <h2>Ta collection en quelques nombres</h2>
          <p>Instantané calculé uniquement en lecture. Aucun fichier n’est modifié depuis cet onglet.</p>
        </div>
        <div className="statistics-intro__total">
          <strong>{formatNumber(statistics.library.pageCount)}</strong>
          <span>pages prêtes à être dévorées</span>
        </div>
      </div>

      <StatisticSection
        title="Bibliothèque"
        description="Les mangas enregistrés localement et leur progression de lecture."
      >
        <div className="statistics-grid">
          <StatisticCard label="Mangas" value={formatNumber(statistics.library.mangaCount)} detail={inaccessibleDetail} />
          <StatisticCard label="Pages" value={formatNumber(statistics.library.pageCount)} detail={`${formatNumber(statistics.library.averagePagesPerManga)} en moyenne`} />
          <StatisticCard label="Lus" value={formatNumber(statistics.library.readCount)} detail="Arrivés à la dernière page" />
          <StatisticCard label="En cours" value={formatNumber(statistics.library.inProgressCount)} detail={`${formatNumber(statistics.library.unreadCount)} pas encore commencés`} />
          <StatisticCard label="Poids des images" value={formatBytes(statistics.library.imageSizeBytes)} detail={`${formatBytes(statistics.library.averagePageSizeBytes)} par page`} />
          <StatisticCard
            label="Le pavé de la collection"
            value={statistics.library.largestManga?.title ?? "—"}
            detail={statistics.library.largestManga ? `${formatNumber(statistics.library.largestManga.pageCount)} pages` : "Pas encore de candidat"}
          />
          <StatisticCard
            label="Langue reine"
            value={statistics.library.mostCommonLanguage?.languageCode.toUpperCase() ?? "—"}
            detail={statistics.library.mostCommonLanguage ? `${formatNumber(statistics.library.mostCommonLanguage.mangaCount)} mangas` : "Aucune langue renseignée"}
          />
        </div>
      </StatisticSection>

      <StatisticSection
        title="Scrapers et bookmarks"
        description="Ce que tu as gardé, lu ou simplement croisé pendant tes explorations."
      >
        <div className="statistics-grid">
          <StatisticCard label="Bookmarks" value={formatNumber(statistics.scraper.bookmarkCount)} detail="Mangas gardés sous le coude" />
          <StatisticCard label="Cards vues" value={formatNumber(statistics.scraper.seenCount)} detail={`${formatNumber(statistics.scraper.encounteredSourceCount)} sources rencontrées`} />
          <StatisticCard label="Lus via scraper" value={formatNumber(statistics.scraper.readCount)} detail="Lectures terminées détectées" />
          <StatisticCard label="Juste vus" value={formatNumber(statistics.scraper.seenOnlyCount)} detail="Ni lus, ni bookmarkés" />
          <StatisticCard label="Bookmark moyen" value={`${formatNumber(statistics.scraper.averageBookmarkPages)} pages`} detail="Pour ceux dont la taille est connue" />
        </div>
      </StatisticSection>

      <StatisticSection
        title="Petite ménagerie"
        description="Les autres habitants de ta collection."
      >
        <div className="statistics-grid">
          <StatisticCard label="Auteurs" value={formatNumber(statistics.collection.authorCount)} />
          <StatisticCard label="Tags" value={formatNumber(statistics.collection.tagCount)} />
          <StatisticCard label="Séries" value={formatNumber(statistics.collection.seriesCount)} />
          <StatisticCard label="Listes de lecture" value={formatNumber(statistics.collection.savedReadingListCount)} />
          <StatisticCard label="Historique lecture" value={formatNumber(statistics.collection.readingHistoryCount)} />
          <StatisticCard label="Fiches ouvertes" value={formatNumber(statistics.collection.detailsHistoryCount)} />
          <StatisticCard label="Recherches gardées" value={formatNumber(statistics.collection.searchHistoryCount)} />
        </div>
      </StatisticSection>

      <StatisticSection
        title="Place occupée par les données utilisateur"
        description={`${formatBytes(statistics.userData.totalSizeBytes)} dans ${formatNumber(statistics.userData.fileCount)} fichiers, hors images de la bibliothèque.`}
      >
        <UserDataBreakdown statistics={statistics.userData} />
      </StatisticSection>
    </div>
  );
}
