import React from "react";
import { StarIcon } from "@/renderer/components/icons";
import type { QuickReviewSource } from "@/renderer/components/QuickReview/types";
import { useScraperAuthorFavorites } from "@/renderer/stores/scraperAuthorFavorites";
import { useScraperTagFavorites } from "@/renderer/stores/scraperTagFavorites";
import type { WorkspaceTarget } from "@/renderer/types/workspace";
import { getFavoriteScraperAuthors } from "@/renderer/utils/scraperAuthorFavorites";
import {
  getScraperFeature,
  isScraperFeatureConfigured,
} from "@/renderer/utils/scraperRuntime";
import {
  getFavoriteScraperTags,
  getScraperTagFavoriteSources,
  normalizeScraperTagFavoriteValue,
} from "@/renderer/utils/scraperTagFavorites";
import { buildScraperTemplateContextFromDetails } from "@/renderer/utils/scraperTemplateContext";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime";
import "@/renderer/components/QuickReview/favorites.scss";

type LinkValue = {
  label: string;
  query: string;
};

type Props = {
  primarySource: QuickReviewSource;
  availableSources: QuickReviewSource[];
  details: ScraperRuntimeDetailsResult | null;
  authors: string[];
  authorUrls: string[];
  tags: string[];
  tagUrls: string[];
  sourceNames: string[];
  sourceUrls: string[];
  showAuthors: boolean;
  showAvailableSources: boolean;
  showSourceWorks: boolean;
  showTags: boolean;
  onOpenError: (message: string | null) => void;
};

const buildLinkValues = (
  labels: string[],
  urls: string[],
  fallbackLabel: string,
): LinkValue[] => {
  const itemCount = Math.max(labels.length, urls.length);
  const seen = new Set<string>();

  return Array.from({ length: itemCount }, (_, index) => {
    const label = labels[index]?.trim() || `${fallbackLabel} ${index + 1}`;
    const query = urls[index]?.trim() || labels[index]?.trim() || "";
    return { label, query };
  }).filter((item) => {
    const key = item.query.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const isListingFeatureAvailable = (
  source: QuickReviewSource,
  kind: "author" | "tag" | "source",
): boolean => isScraperFeatureConfigured(getScraperFeature(source.scraper, kind));

const normalizeAuthorFavoriteKey = (value: unknown): string => (
  String(value ?? "").trim().toLocaleLowerCase()
);

export default function QuickReviewLinks({
  primarySource,
  availableSources,
  details,
  authors,
  authorUrls,
  tags,
  tagUrls,
  sourceNames,
  sourceUrls,
  showAuthors,
  showAvailableSources,
  showSourceWorks,
  showTags,
  onOpenError,
}: Props) {
  const authorLinks = buildLinkValues(authors, authorUrls, "Auteur");
  const tagLinks = buildLinkValues(tags, tagUrls, "Tag");
  const sourceLinks = buildLinkValues(sourceNames, sourceUrls, "Source");
  const { favorites: authorFavorites } = useScraperAuthorFavorites();
  const { favorites: tagFavorites } = useScraperTagFavorites();
  const favoriteAuthorMatches = React.useMemo(() => getFavoriteScraperAuthors(
    authorFavorites,
    primarySource.scraper.id,
    authors,
    authorUrls,
  ), [authorFavorites, authorUrls, authors, primarySource.scraper.id]);
  const favoriteAuthorKeys = React.useMemo(() => new Set(
    favoriteAuthorMatches.map((match) => normalizeAuthorFavoriteKey(match.name)),
  ), [favoriteAuthorMatches]);
  const favoriteTagSources = React.useMemo(() => getScraperTagFavoriteSources(
    tagFavorites,
    primarySource.scraper.id,
  ), [primarySource.scraper.id, tagFavorites]);
  const favoriteTagMatches = React.useMemo(() => getFavoriteScraperTags(
    favoriteTagSources,
    tags,
    tagUrls,
  ), [favoriteTagSources, tagUrls, tags]);
  const favoriteTagKeys = React.useMemo(() => new Set(
    favoriteTagMatches.flatMap((match) => [match.tag, match.tagUrl]
      .map(normalizeScraperTagFavoriteValue)
      .filter(Boolean)),
  ), [favoriteTagMatches]);
  const authorAvailable = isListingFeatureAvailable(primarySource, "author");
  const tagAvailable = isListingFeatureAvailable(primarySource, "tag");
  const sourceAvailable = isListingFeatureAvailable(primarySource, "source");
  const hasVisibleGroup = showAvailableSources || showAuthors || showTags || showSourceWorks;

  const openTarget = async (target: WorkspaceTarget) => {
    onOpenError(null);
    try {
      const opened = await openWorkspaceTarget(target, { activate: false });
      if (!opened) onOpenError("Impossible d'ouvrir cette cible dans un nouvel onglet workspace.");
    } catch (error) {
      onOpenError(error instanceof Error ? error.message : "Impossible d'ouvrir cette cible.");
    }
  };

  const renderLinks = (
    label: string,
    items: LinkValue[],
    available: boolean,
    buildTarget: (item: LinkValue) => WorkspaceTarget,
    favoriteKind?: "author" | "tag",
  ) => items.length ? (
    <div className="quick-review__link-group">
      <span className="quick-review__link-label">{label}</span>
      <div className="quick-review__chips">
        {items.map((item) => {
          const isFavorite = favoriteKind === "author"
            ? favoriteAuthorKeys.has(normalizeAuthorFavoriteKey(item.label))
            : favoriteKind === "tag"
              ? [item.label, item.query].some((value) => (
                favoriteTagKeys.has(normalizeScraperTagFavoriteValue(value))
              ))
              : false;
          const className = [
            "quick-review__chip",
            available ? "is-clickable" : "",
            isFavorite ? `is-favorite is-favorite-${favoriteKind}` : "",
          ].filter(Boolean).join(" ");
          const content = (
            <>
              {isFavorite ? <StarIcon aria-hidden="true" focusable="false" /> : null}
              {item.label}
            </>
          );
          const favoriteTitle = isFavorite
            ? `${favoriteKind === "author" ? "Auteur" : "Tag"} favori. `
            : "";

          return available ? (
            <button
              key={item.query}
              type="button"
              className={className}
              onClick={() => void openTarget(buildTarget(item))}
              title={`${favoriteTitle}Ouvrir ${item.label} dans un nouvel onglet`}
            >
              {content}
            </button>
          ) : (
            <span
              key={item.query}
              className={className}
              title={`${favoriteTitle}Composant non configure`}
            >
              {content}
            </span>
          );
        })}
      </div>
    </div>
  ) : null;

  return hasVisibleGroup ? (
    <div className="quick-review__links">
      {showAvailableSources && availableSources.length ? (
        <div className="quick-review__link-group">
          <span className="quick-review__link-label">Fiches</span>
          <div className="quick-review__chips">
            {availableSources.map((source, index) => {
              const sourceUrl = source.result.detailsSourceUrl || source.result.detailUrl;
              const isPrimary = source.scraper.id === primarySource.scraper.id
                && sourceUrl === (primarySource.result.detailsSourceUrl || primarySource.result.detailUrl);
              return sourceUrl ? (
                <button
                  key={`${source.scraper.id}:${sourceUrl}:${index}`}
                  type="button"
                  className={["quick-review__chip", "is-clickable", isPrimary ? "is-primary" : ""].join(" ").trim()}
                  onClick={() => void openTarget({
                    kind: "scraper.details",
                    scraperId: source.scraper.id,
                    sourceUrl,
                    title: source.result.title,
                  })}
                  title={`Ouvrir la fiche ${source.scraper.name} dans un nouvel onglet`}
                >
                  {source.scraper.name}{isPrimary ? " · principale" : ""}
                </button>
              ) : null;
            })}
          </div>
        </div>
      ) : null}

      {showAuthors ? renderLinks("Auteurs", authorLinks, authorAvailable, (item) => ({
        kind: "scraper.author",
        scraperId: primarySource.scraper.id,
        query: item.query,
        title: item.label,
        templateContext: details ? buildScraperTemplateContextFromDetails(details) : undefined,
      }), "author") : null}
      {showTags ? renderLinks("Tags", tagLinks, tagAvailable, (item) => ({
        kind: "scraper.tag",
        scraperId: primarySource.scraper.id,
        query: item.query,
        title: item.label,
      }), "tag") : null}
      {showSourceWorks ? renderLinks("Sources", sourceLinks, sourceAvailable, (item) => ({
        kind: "scraper.source",
        scraperId: primarySource.scraper.id,
        query: item.query,
        title: item.label,
      })) : null}
    </div>
  ) : null;
}
