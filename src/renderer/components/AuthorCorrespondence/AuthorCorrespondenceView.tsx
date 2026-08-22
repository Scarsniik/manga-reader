import React from "react";
import useBackgroundSearchJob from "@/renderer/backgroundSearch/useBackgroundSearchJob";
import type { AuthorCorrespondenceBackgroundResult } from "@/renderer/backgroundSearch/types";
import ScraperAuthorFavoritesView from "@/renderer/components/ScraperAuthorFavorites/ScraperAuthorFavoritesView";
import ScraperAuthorFavoriteButton from "@/renderer/components/ScraperAuthorFavoriteButton/ScraperAuthorFavoriteButton";
import AuthorCorrespondenceFavoriteButton from "@/renderer/components/AuthorCorrespondence/AuthorCorrespondenceFavoriteButton";
import AuthorCorrespondencePreviewImage from "@/renderer/components/AuthorCorrespondence/AuthorCorrespondencePreviewImage";
import AuthorCorrespondenceRevisionButton from "@/renderer/components/AuthorCorrespondence/AuthorCorrespondenceRevisionButton";
import AuthorCorrespondenceAdvancedButton from "@/renderer/components/AuthorCorrespondence/AuthorCorrespondenceAdvancedButton";
import AuthorCorrespondenceAdvancedStatus from "@/renderer/components/AuthorCorrespondence/AuthorCorrespondenceAdvancedStatus";
import useAuthorCorrespondenceNavigation from "@/renderer/components/AuthorCorrespondence/useAuthorCorrespondenceNavigation";
import useAuthorCorrespondenceSessionCache from "@/renderer/backgroundSearch/useAuthorCorrespondenceSessionCache";
import { OpenBookIcon } from "@/renderer/components/icons";
import type { ScraperAuthorWorkspaceTarget } from "@/renderer/types/workspace";
import {
  buildAuthorCorrespondenceMatchKey,
  normalizeAuthorCorrespondenceTarget,
} from "@/renderer/utils/authorCorrespondenceIdentity";
import type { AuthorCorrespondenceBackgroundInput } from "@/shared/backgroundSearch";
import type {
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
} from "@/shared/scraper";
import { filterAuthorCorrespondenceNameSearchSources } from "@/renderer/searchEngines/authorCorrespondenceNameSearchSources";
import {
  readAuthorCorrespondenceInvalidations,
  writeAuthorCorrespondenceInvalidations,
} from "@/renderer/components/AuthorCorrespondence/authorCorrespondenceInvalidations";
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
  const { job, loading, error, cancel, reload } = useBackgroundSearchJob(backgroundSearchJobId);
  const { openAuthor, openAuthorInWorkspace } = useAuthorCorrespondenceNavigation(onOpenAuthorTarget);
  const result = job?.result as AuthorCorrespondenceBackgroundResult | undefined;
  const input = job?.input as AuthorCorrespondenceBackgroundInput | undefined;
  const active = job?.metadata.status === "queued" || job?.metadata.status === "running";
  const sessionCache = useAuthorCorrespondenceSessionCache(job?.metadata.id);
  const [showCombinedView, setShowCombinedView] = React.useState(false);
  const [invalidatedMatchKeys, setInvalidatedMatchKeys] = React.useState<Set<string>>(() => new Set());
  const displayedMatches = React.useMemo(() => {
    const matchesByTarget = new Map<string, AuthorCorrespondenceBackgroundResult["matches"][number]>();
    result?.matches.forEach((match) => {
      const targetKey = `${match.scraperId}::${normalizeAuthorCorrespondenceTarget(match.authorUrl)}`;
      if (!matchesByTarget.has(targetKey)) {
        matchesByTarget.set(targetKey, match);
      }
    });
    return Array.from(matchesByTarget.values());
  }, [result?.matches]);
  const validMatches = React.useMemo(
    () => displayedMatches.filter((match) => !invalidatedMatchKeys.has(match.key)),
    [displayedMatches, invalidatedMatchKeys],
  );
  const advancedDiscoveredMatchKeys = React.useMemo(() => new Set([
    ...(result?.advancedSearch?.discoveredAuthorMatchKeys ?? []),
    ...sessionCache.discoveredAuthorMatchKeys,
  ]), [result?.advancedSearch?.discoveredAuthorMatchKeys, sessionCache.discoveredAuthorMatchKeys]);
  const newAuthorPageCount = React.useMemo(() => validMatches.filter((match) => (
    advancedDiscoveredMatchKeys.has(match.key)
  )).length, [advancedDiscoveredMatchKeys, validMatches]);
  const nameSearchSources = React.useMemo(() => filterAuthorCorrespondenceNameSearchSources({
    sources: result?.nameSearchSources ?? [],
    requestedNames: [
      result?.referenceName,
      input?.referenceName,
      ...(input?.names ?? []),
      ...(input?.referenceSources ?? []).map((source) => source.name),
    ],
    matches: displayedMatches,
    invalidatedMatchKeys,
  }), [
    displayedMatches,
    input?.names,
    input?.referenceName,
    input?.referenceSources,
    invalidatedMatchKeys,
    result?.nameSearchSources,
    result?.referenceName,
  ]);

  React.useEffect(() => {
    if (!job?.metadata.id) {
      setInvalidatedMatchKeys(new Set());
      return;
    }

    setInvalidatedMatchKeys(readAuthorCorrespondenceInvalidations(job.metadata.id));
  }, [job?.metadata.id]);

  const setMatchInvalidated = React.useCallback((matchKey: string, invalidated: boolean) => {
    if (!job?.metadata.id) {
      return;
    }

    setInvalidatedMatchKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (invalidated) {
        nextKeys.add(matchKey);
      } else {
        nextKeys.delete(matchKey);
      }
      writeAuthorCorrespondenceInvalidations(job.metadata.id, nextKeys);
      return nextKeys;
    });
  }, [job?.metadata.id]);

  const invalidateCombinedSource = React.useCallback((source: ScraperAuthorFavoriteSource) => {
    const match = result?.matches.find((candidate) => (
      candidate.scraperId === source.scraperId
      && candidate.authorUrl === source.authorUrl
    ));
    if (match) {
      setMatchInvalidated(match.key, true);
    }
  }, [result?.matches, setMatchInvalidated]);

  const combinedAuthor = React.useMemo<ScraperAuthorFavoriteRecord | null>(() => {
    if (!job || (!validMatches.length && !nameSearchSources.length)) {
      return null;
    }

    return {
      id: `author-correspondence:${job.metadata.id}`,
      name: result?.referenceName || job.metadata.primaryTerm,
      cover: validMatches
        .flatMap((match) => match.previewSources)
        .find((source) => source.result.thumbnailUrl)
        ?.result.thumbnailUrl
        ?? nameSearchSources.find((source) => source.result.thumbnailUrl)?.result.thumbnailUrl,
      sources: validMatches.map((match) => ({
        scraperId: match.scraperId,
        authorUrl: match.authorUrl,
        name: match.authorName,
        cover: match.previewSources.find((source) => source.result.thumbnailUrl)?.result.thumbnailUrl,
        templateContext: match.templateContext ?? undefined,
        createdAt: job.metadata.createdAt,
        updatedAt: job.metadata.updatedAt,
      })),
      createdAt: job.metadata.createdAt,
      updatedAt: job.metadata.updatedAt,
    };
  }, [job, nameSearchSources, result?.referenceName, validMatches]);

  if (loading) return <div className="app-route-loading" aria-busy="true" />;
  if (error || !job) return <div className="empty">{error || "Recherche introuvable."}</div>;
  const advancedStatus = (
    <AuthorCorrespondenceAdvancedStatus
      enabled={input?.advancedSearch?.enabled === true}
      status={job.metadata.status}
      progress={job.metadata.progress}
      summary={result?.advancedSearch}
      newAuthorPageCount={newAuthorPageCount}
    />
  );

  if (showCombinedView && combinedAuthor) {
    return (
      <ScraperAuthorFavoritesView
        scrapers={input?.scrapers ?? []}
        favoriteOverride={combinedAuthor}
        initialPageCountOverride={input?.authorPageCount}
        onBackFromFavoriteOverride={() => setShowCombinedView(false)}
        onInvalidateFavoriteOverrideSource={invalidateCombinedSource}
        onOpenAuthorTarget={onOpenAuthorTarget}
        favoriteOverrideRuns={sessionCache.runs}
        favoriteOverrideMangaEnrichments={sessionCache.mangaEnrichments}
        favoriteOverrideNameSearchSources={nameSearchSources}
        favoriteOverrideSearchNames={result?.searchedNames ?? input?.names ?? []}
        favoriteOverrideSessionCacheEnabled={Boolean(
          sessionCache.revision > 0
          || (result?.advancedSearch && !sessionCache.hydrated)
        )}
        favoriteOverrideStatus={advancedStatus}
        favoriteOverrideAction={(
          <>
            <AuthorCorrespondenceAdvancedButton
              active={active}
              backgroundSearchJobId={job.metadata.id}
              input={input}
              result={result}
              invalidatedMatchKeys={invalidatedMatchKeys}
              reload={reload}
            />
            <AuthorCorrespondenceFavoriteButton
              favorite={combinedAuthor}
              disabled={active}
            />
          </>
        )}
      />
    );
  }

  return (
    <section className="author-correspondence-view">
      {!resultOnly ? (
        <header className="author-correspondence-view__header">
          <div>
            <p>Correspondances auteur</p>
            <h2>{job.metadata.primaryTerm}</h2>
            <span>
              {validMatches.length} page(s) auteur conservée(s)
              {nameSearchSources.length ? ` · ${nameSearchSources.length} résultat(s) trouvé(s) par nom` : ""}
              {invalidatedMatchKeys.size ? ` · ${invalidatedMatchKeys.size} invalidée(s)` : ""}
              {" · "}
              {active ? "Recherche en cours" : "Recherche terminée"}
            </span>
          </div>
          {active ? <button type="button" onClick={() => void cancel()}>Arrêter</button> : null}
        </header>
      ) : null}

      <div className="author-correspondence-view__view-actions">
        <AuthorCorrespondenceRevisionButton
          active={active}
          backgroundSearchJobId={job.metadata.id}
          displayedMatches={displayedMatches}
          input={input}
          invalidatedMatchKeys={invalidatedMatchKeys}
          onInvalidatedMatchKeysChange={setInvalidatedMatchKeys}
          reload={reload}
          result={result}
        />
        <AuthorCorrespondenceAdvancedButton
          active={active}
          backgroundSearchJobId={job.metadata.id}
          input={input}
          result={result}
          invalidatedMatchKeys={invalidatedMatchKeys}
          reload={reload}
        />
        {combinedAuthor ? (
          <AuthorCorrespondenceFavoriteButton
            favorite={combinedAuthor}
            disabled={active}
          />
        ) : null}
        {combinedAuthor ? (
          <button
            type="button"
            className="author-correspondence-view__open-combined"
            onClick={() => setShowCombinedView(true)}
            disabled={active}
            title={active
              ? "Attends la fin de la recherche pour ouvrir la vue combinée"
              : "Afficher ensemble les pages auteur et les mangas trouvés par nom"}
          >
            <OpenBookIcon aria-hidden="true" focusable="false" />
            <span>Voir l’auteur combiné</span>
          </button>
        ) : null}
      </div>

      {advancedStatus}

      {displayedMatches.length ? (
        <div className="author-correspondence-view__list">
          {displayedMatches.map((match) => {
            const invalidated = invalidatedMatchKeys.has(match.key);
            const discoveredByAdvancedSearch = advancedDiscoveredMatchKeys.has(match.key);
            const referenceSource = input?.referenceSources.find((source) => (
              buildAuthorCorrespondenceMatchKey(source.scraperId, source.authorUrl) === match.key
            ));
            return (
              <article
                key={match.key}
                className={[
                  "author-correspondence-view__row",
                  discoveredByAdvancedSearch ? "is-advanced-discovery" : "",
                  invalidated ? "is-invalidated" : "",
                ].filter(Boolean).join(" ")}
              >
              <div className="author-correspondence-view__content">
                <div className="author-correspondence-view__identity">
                  <span className="author-correspondence-view__source">{match.scraperName}</span>
                  {discoveredByAdvancedSearch ? (
                    <span className="author-correspondence-view__advanced-badge">
                      Nouveau · recherche poussée
                    </span>
                  ) : null}
                  <h3>{match.authorName}</h3>
                  {match.authorName !== match.matchedName ? (
                    <p>Correspond à <strong>{match.matchedName}</strong></p>
                  ) : (
                    <p>Page auteur correspondante</p>
                  )}
                </div>
                <div className="author-correspondence-view__previews" aria-label="Aperçu des mangas de l’auteur">
                {match.previewSources.length ? match.previewSources.map((source, sourceIndex) => {
                  const sourceKey = `${source.scraper.id}::${source.result.detailUrl || source.result.title}::${sourceIndex}`;
                  return (
                    <div key={sourceKey} className="author-correspondence-view__preview" title={source.result.title}>
                      <AuthorCorrespondencePreviewImage
                        thumbnailUrl={source.result.thumbnailUrl}
                        thumbnailCandidates={source.result.thumbnailCandidates}
                        refererUrl={source.result.detailUrl || source.scraper.baseUrl}
                        fallbackText={source.result.title}
                      />
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
                  authorUrl={referenceSource?.authorUrl ?? match.authorUrl}
                  sourceName={referenceSource?.name ?? match.authorName}
                  cover={match.previewSources.find((source) => source.result.thumbnailUrl)?.result.thumbnailUrl}
                  templateContext={referenceSource?.templateContext ?? match.templateContext}
                  disabled={active}
                />
                <button
                  type="button"
                  className="author-correspondence-view__invalidate"
                  onClick={() => setMatchInvalidated(match.key, !invalidated)}
                >
                  {invalidated ? "Réintégrer" : "Invalider"}
                </button>
              </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty">{active
          ? "La recherche est en cours. Les auteurs apparaîtront ici dès qu’ils seront trouvés."
          : "Aucune page auteur correspondante n’a été trouvée."}</div>
      )}
    </section>
  );
}
