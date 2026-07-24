import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useBackgroundSearchJob from "@/renderer/backgroundSearch/useBackgroundSearchJob";
import type { AuthorCorrespondenceBackgroundResult } from "@/renderer/backgroundSearch/types";
import ScraperAuthorFavoriteButton from "@/renderer/components/ScraperAuthorFavoriteButton/ScraperAuthorFavoriteButton";
import { OpenBookIcon } from "@/renderer/components/icons";
import type { ScraperAuthorWorkspaceTarget } from "@/renderer/types/workspace";
import { buildRemoteThumbnailUrl } from "@/renderer/utils/remoteThumbnails";
import { writeScraperRouteState } from "@/renderer/utils/scraperBrowserNavigation";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import "./style.scss";

type Props = {
  backgroundSearchJobId?: string;
  onOpenAuthorTarget?: (target: ScraperAuthorWorkspaceTarget) => void;
  resultOnly?: boolean;
};

export default function AuthorCorrespondenceView({
  backgroundSearchJobId,
  onOpenAuthorTarget,
  resultOnly = false,
}: Props) {
  const { job, loading, error, cancel } = useBackgroundSearchJob(backgroundSearchJobId);
  const location = useLocation();
  const navigate = useNavigate();
  const result = job?.result as AuthorCorrespondenceBackgroundResult | undefined;
  const active = job?.metadata.status === "queued" || job?.metadata.status === "running";

  const buildAuthorTarget = (
    scraperId: string,
    authorUrl: string,
    authorName: string,
    templateContext?: Record<string, string | undefined> | null,
  ): ScraperAuthorWorkspaceTarget => ({
    kind: "scraper.author",
    scraperId,
    query: authorUrl,
    title: authorName,
    templateContext: templateContext ?? undefined,
  });

  const openAuthor = (
    scraperId: string,
    authorUrl: string,
    authorName: string,
    templateContext?: Record<string, string | undefined> | null,
  ) => {
    const target = buildAuthorTarget(scraperId, authorUrl, authorName, templateContext);
    if (onOpenAuthorTarget) {
      onOpenAuthorTarget(target);
      return;
    }

    navigate({
      pathname: location.pathname,
      search: writeScraperRouteState(location.search, {
        scraperId,
        mode: "author",
        homepageActive: false,
        homepagePage: 1,
        searchActive: false,
        searchQuery: "",
        searchPage: 1,
        authorActive: true,
        authorQuery: authorUrl,
        authorPage: 1,
        mangaQuery: "",
        mangaUrl: "",
        bookmarksFilterScraperId: null,
      }),
    }, {
      state: {
        scraperBrowserAuthorTemplateContext: templateContext ?? null,
      },
    });
  };

  const openAuthorInWorkspace = (
    scraperId: string,
    authorUrl: string,
    authorName: string,
    templateContext?: Record<string, string | undefined> | null,
  ) => {
    void openWorkspaceTarget(buildAuthorTarget(scraperId, authorUrl, authorName, templateContext));
  };

  if (loading) return <div className="app-route-loading" aria-busy="true" />;
  if (error || !job) return <div className="empty">{error || "Recherche introuvable."}</div>;

  return (
    <section className="author-correspondence-view">
      {!resultOnly ? (
        <header className="author-correspondence-view__header">
          <div>
            <p>Correspondances auteur</p>
            <h2>{job.metadata.primaryTerm}</h2>
            <span>{result?.matches.length ?? 0} page(s) auteur · {active ? "Recherche en cours" : "Recherche terminée"}</span>
          </div>
          {active ? <button type="button" onClick={() => void cancel()}>Arrêter</button> : null}
        </header>
      ) : null}

      {result?.matches.length ? (
        <div className="author-correspondence-view__list">
          {result.matches.map((match) => (
            <article key={match.key} className="author-correspondence-view__row">
              <div className="author-correspondence-view__content">
                <div className="author-correspondence-view__identity">
                  <span className="author-correspondence-view__source">{match.scraperName}</span>
                  <h3>{match.authorName}</h3>
                  {match.authorName !== match.matchedName ? (
                    <p>Correspond à <strong>{match.matchedName}</strong></p>
                  ) : (
                    <p>Page auteur correspondante</p>
                  )}
                </div>
                <div className="author-correspondence-view__previews" aria-label="Aperçu des mangas de l’auteur">
                {match.previewSources.length ? match.previewSources.map((source, sourceIndex) => {
                  const thumbnailUrl = buildRemoteThumbnailUrl(source.result.thumbnailUrl, source.result.detailUrl);
                  const sourceKey = `${source.scraper.id}::${source.result.detailUrl || source.result.title}::${sourceIndex}`;
                  return (
                    <div key={sourceKey} className="author-correspondence-view__preview" title={source.result.title}>
                      {thumbnailUrl ? (
                        <img src={thumbnailUrl} alt="" />
                      ) : (
                        <span>{source.result.title.slice(0, 2)}</span>
                      )}
                      <small>{source.result.title}</small>
                    </div>
                  );
                }) : <em>Aucun aperçu disponible</em>}
                </div>
              </div>
              <div className="author-correspondence-view__actions">
                <button
                  type="button"
                  className="author-correspondence-view__open"
                  onClick={() => openAuthor(
                    match.scraperId,
                    match.authorUrl,
                    match.authorName,
                    match.templateContext,
                  )}
                  onMouseDown={(event) => {
                    if (event.button === 1) event.preventDefault();
                  }}
                  onAuxClick={(event) => {
                    if (event.button !== 1) return;
                    event.preventDefault();
                    event.stopPropagation();
                    openAuthorInWorkspace(
                      match.scraperId,
                      match.authorUrl,
                      match.authorName,
                      match.templateContext,
                    );
                  }}
                  title={`Ouvrir la page auteur dans ${match.scraperName}`}
                  data-prevent-middle-click-autoscroll="true"
                >
                  <OpenBookIcon aria-hidden="true" focusable="false" />
                  <span>Ouvrir l’auteur</span>
                </button>
                <ScraperAuthorFavoriteButton
                  scraperId={match.scraperId}
                  scraperName={match.scraperName}
                  authorUrl={match.authorUrl}
                  sourceName={match.authorName}
                  cover={match.previewSources.find((source) => source.result.thumbnailUrl)?.result.thumbnailUrl}
                  templateContext={match.templateContext}
                  disabled={active}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">{active
          ? "La recherche est en cours. Les auteurs apparaîtront ici dès qu’ils seront trouvés."
          : "Aucune page auteur correspondante n’a été trouvée."}</div>
      )}
    </section>
  );
}
