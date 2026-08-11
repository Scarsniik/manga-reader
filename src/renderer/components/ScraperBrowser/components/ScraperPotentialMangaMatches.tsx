import React, { useEffect, useRef, useState } from "react";
import AdaptiveDropdown from "@/renderer/components/AdaptiveDropdown/AdaptiveDropdown";
import {
  BookmarkRibbonIcon,
  ChevronDownIcon,
  DetailsCardIcon,
  FileSelectionIcon,
  OpenBookIcon,
} from "@/renderer/components/icons";
import type { ScraperPotentialMangaMatch } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";
import {
  buildPotentialMatchEntries,
  type PotentialMatchCategory as MatchCategory,
  type PotentialMatchEntry,
} from "@/renderer/components/ScraperBrowser/utils/potentialMatchDisplay";
import { toLocalImageUrl } from "@/renderer/utils/history";
import { buildRemoteThumbnailUrl } from "@/renderer/utils/remoteThumbnails";

const MIDDLE_BUTTON = 1;

type NoticeKind = MatchCategory | "combined";
type DisplayMode = "separate" | "combined";

type Props = {
  readingMatches: ScraperPotentialMangaMatch[];
  bookmarkMatches: ScraperPotentialMangaMatch[];
  readingListMatches: ScraperPotentialMangaMatch[];
  fallbackCover?: string;
  fallbackCoverReferer?: string;
  loading?: boolean;
  mode?: DisplayMode;
  showCategoryLabels?: boolean;
  portalMenus?: boolean;
  horizontalBoundarySelector?: string;
  onOpenMatch: (match: ScraperPotentialMangaMatch) => void;
  onOpenMatchInWorkspace: (match: ScraperPotentialMangaMatch) => void;
};

type NoticeProps = {
  kind: NoticeKind;
  entries: PotentialMatchEntry[];
  fallbackCover?: string;
  fallbackCoverReferer?: string;
  loading?: boolean;
  showCategoryLabels?: boolean;
  portalMenu?: boolean;
  horizontalBoundarySelector?: string;
  onOpenMatch: (match: ScraperPotentialMangaMatch) => void;
  onOpenMatchInWorkspace: (match: ScraperPotentialMangaMatch) => void;
};

const formatCount = (count: number, label: string): string => (
  count > 1 ? `${count} ${label}s` : `${count} ${label}`
);

const getReadingSummary = (matches: ScraperPotentialMangaMatch[]): string => {
  const readCount = matches.filter((match) => match.readingStatus === "read").length;
  const inProgressCount = matches.filter((match) => match.readingStatus === "inProgress").length;

  return [
    readCount ? formatCount(readCount, "lu") : "",
    inProgressCount ? `${inProgressCount} en cours` : "",
  ].filter(Boolean).join(", ");
};

const getTargetLabel = (match: ScraperPotentialMangaMatch): string => (
  match.category === "readingList"
    ? "Element d'une liste de lecture"
    : match.target.kind === "library" ? "Bibliotheque" : "Fiche"
);

const getNoticeTitle = (kind: NoticeKind): string => {
  if (kind === "combined") {
    return "Correspondance probable";
  }

  if (kind === "reading") {
    return "Potentiellement deja lu";
  }

  return kind === "bookmark"
    ? "Potentiellement bookmarke"
    : "Potentiellement dans une liste";
};

const getNoticeSummary = (kind: NoticeKind, matches: ScraperPotentialMangaMatch[]): string => {
  if (kind === "combined") {
    return formatCount(matches.length, "correspondance");
  }

  if (kind === "reading") {
    return getReadingSummary(matches);
  }

  return formatCount(matches.length, kind === "readingList" ? "manga" : "correspondance");
};

const getCategoryLabel = (
  category: MatchCategory,
  match: ScraperPotentialMangaMatch,
): string => {
  if (category === "bookmark") {
    return "Dans les bookmarks";
  }

  if (category === "readingList") {
    return "Dans une liste";
  }

  return match.readingStatus === "inProgress" ? "Lecture en cours" : "Déjà lu";
};

const buildPotentialMatchCoverUrls = (
  match: ScraperPotentialMangaMatch,
  fallbackCover?: string,
  fallbackCoverReferer?: string,
): string[] => [
  {
    cover: match.cover,
    referer: match.sourceUrl,
  },
  {
    cover: fallbackCover,
    referer: fallbackCoverReferer,
  },
].reduce<string[]>((urls, source) => {
  const cover = toLocalImageUrl(source.cover);
  if (!cover) {
    return urls;
  }

  [buildRemoteThumbnailUrl(cover, source.referer), cover].forEach((url) => {
    const normalizedUrl = String(url ?? "").trim();
    if (normalizedUrl && !urls.includes(normalizedUrl)) {
      urls.push(normalizedUrl);
    }
  });

  return urls;
}, []);

type PotentialMatchCardProps = {
  entry: PotentialMatchEntry;
  fallbackCover?: string;
  fallbackCoverReferer?: string;
  showCategoryLabels?: boolean;
  onOpen: () => void;
  onOpenInWorkspace: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

function PotentialMatchCard({
  entry,
  fallbackCover,
  fallbackCoverReferer,
  showCategoryLabels = false,
  onOpen,
  onOpenInWorkspace,
}: PotentialMatchCardProps) {
  const { match } = entry;
  const [failedCovers, setFailedCovers] = useState<string[]>([]);
  const coverUrls = buildPotentialMatchCoverUrls(
    match,
    fallbackCover,
    fallbackCoverReferer,
  );
  const activeCover = coverUrls.find((coverUrl) => !failedCovers.includes(coverUrl));
  const authorLabel = match.authorNames?.filter(Boolean).join(", ");

  return (
    <button
      type="button"
      className="scraper-browser__potential-match-card"
      role="menuitem"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }}
      onMouseDown={(event) => {
        if (event.button === MIDDLE_BUTTON) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onAuxClick={onOpenInWorkspace}
      title={`${getTargetLabel(match)}. Clic molette : nouvel onglet workspace`}
      data-prevent-middle-click-autoscroll="true"
    >
      <span className="scraper-browser__potential-match-cover">
        {activeCover ? (
          <img
            src={activeCover}
            alt=""
            aria-hidden="true"
            onError={() => setFailedCovers((currentCovers) => (
              currentCovers.includes(activeCover)
                ? currentCovers
                : [...currentCovers, activeCover]
            ))}
          />
        ) : (
          <span className="scraper-browser__potential-match-placeholder" aria-hidden="true">
            <DetailsCardIcon focusable="false" />
          </span>
        )}
      </span>
      <span className="scraper-browser__potential-match-card-body">
        <strong>{match.title}</strong>
        {authorLabel ? (
          <span className="scraper-browser__potential-match-author">{authorLabel}</span>
        ) : null}
        {showCategoryLabels ? (
          <span className="scraper-browser__potential-match-categories">
            {entry.categories.map((category) => (
              <span key={category} className={`is-${category}`}>
                {getCategoryLabel(category, match)}
              </span>
            ))}
          </span>
        ) : null}
        <small>{match.sourceLabel} - {match.detailLabel}</small>
      </span>
    </button>
  );
}

function PotentialMatchNotice({
  kind,
  entries,
  fallbackCover,
  fallbackCoverReferer,
  loading = false,
  showCategoryLabels = false,
  portalMenu = false,
  horizontalBoundarySelector = ".scraper-browser__details-body",
  onOpenMatch,
  onOpenMatchInWorkspace,
}: NoticeProps) {
  const [open, setOpen] = useState(false);
  const matchListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!entries.length && open) {
      setOpen(false);
    }
  }, [entries.length, open]);

  useEffect(() => {
    const matchList = matchListRef.current;
    if (!open || !matchList) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => {
      if (matchList.scrollWidth <= matchList.clientWidth) {
        return;
      }

      const scrollDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
      if (!scrollDelta) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      matchList.scrollLeft += scrollDelta;
    };

    matchList.addEventListener("wheel", handleWheel, { passive: false });
    return () => matchList.removeEventListener("wheel", handleWheel);
  }, [entries.length, open]);

  if (!entries.length) {
    return null;
  }

  const matches = entries.map((entry) => entry.match);
  const noticeTitle = getNoticeTitle(kind);
  const noticeSummary = getNoticeSummary(kind, matches);
  const icon = kind === "reading"
    ? <OpenBookIcon aria-hidden="true" focusable="false" />
    : kind === "bookmark"
      ? <BookmarkRibbonIcon aria-hidden="true" focusable="false" />
      : kind === "readingList"
        ? <FileSelectionIcon aria-hidden="true" focusable="false" />
        : <DetailsCardIcon aria-hidden="true" focusable="false" />;
  const noticeClassName = kind === "readingList" ? "reading-list" : kind;

  const handleMatchAuxClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    match: ScraperPotentialMangaMatch,
  ) => {
    if (event.button !== MIDDLE_BUTTON) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onOpenMatchInWorkspace(match);
  };

  return (
    <AdaptiveDropdown
      open={open}
      onOpenChange={setOpen}
      className={`scraper-browser__potential-match is-${noticeClassName}`}
      contentClassName="scraper-browser__potential-match-menu"
      contentRole="menu"
      gap={6}
      horizontalBoundarySelector={horizontalBoundarySelector}
      maxHeight={kind === "combined" ? 320 : 280}
      portal={portalMenu}
      renderTrigger={({ contentId, isOpen, setTriggerRef, toggle }) => (
        <button
          ref={setTriggerRef}
          type="button"
          className="scraper-browser__potential-match-toggle"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggle();
          }}
          aria-controls={contentId}
          aria-expanded={isOpen}
          aria-haspopup="menu"
        >
          <span className="scraper-browser__potential-match-icon">{icon}</span>
          <span className="scraper-browser__potential-match-label">{noticeTitle}</span>
          <strong>{noticeSummary}</strong>
          <span
            className={[
              "scraper-browser__potential-match-loading",
              loading ? "is-visible" : "",
            ].filter(Boolean).join(" ")}
            aria-hidden={!loading}
          >
            Analyse
          </span>
          <ChevronDownIcon aria-hidden="true" focusable="false" />
        </button>
      )}
    >
      <div
        ref={matchListRef}
        className="scraper-browser__potential-match-list"
        role="none"
      >
        {entries.map((entry) => {
          const { match } = entry;
          return (
            <PotentialMatchCard
              key={`${match.category}-${match.id}`}
              entry={entry}
              fallbackCover={fallbackCover}
              fallbackCoverReferer={fallbackCoverReferer}
              showCategoryLabels={showCategoryLabels}
              onOpen={() => {
                setOpen(false);
                onOpenMatch(match);
              }}
              onOpenInWorkspace={(event) => {
                if (event.button === MIDDLE_BUTTON) {
                  setOpen(false);
                }
                handleMatchAuxClick(event, match);
              }}
            />
          );
        })}
      </div>
    </AdaptiveDropdown>
  );
}

export default function ScraperPotentialMangaMatches({
  readingMatches,
  bookmarkMatches,
  readingListMatches,
  fallbackCover,
  fallbackCoverReferer,
  loading = false,
  mode = "separate",
  showCategoryLabels = false,
  portalMenus = false,
  horizontalBoundarySelector,
  onOpenMatch,
  onOpenMatchInWorkspace,
}: Props) {
  if (!readingMatches.length && !bookmarkMatches.length && !readingListMatches.length) {
    return null;
  }

  if (mode === "combined") {
    const entries = buildPotentialMatchEntries([
      { category: "reading", matches: readingMatches },
      { category: "bookmark", matches: bookmarkMatches },
      { category: "readingList", matches: readingListMatches },
    ]);

    return (
      <div className="scraper-browser__potential-matches is-combined">
        <PotentialMatchNotice
          kind="combined"
          entries={entries}
          fallbackCover={fallbackCover}
          fallbackCoverReferer={fallbackCoverReferer}
          loading={loading}
          showCategoryLabels={showCategoryLabels}
          portalMenu={portalMenus}
          horizontalBoundarySelector={horizontalBoundarySelector ?? ".scraper-browser"}
          onOpenMatch={onOpenMatch}
          onOpenMatchInWorkspace={onOpenMatchInWorkspace}
        />
      </div>
    );
  }

  return (
    <div className="scraper-browser__potential-matches">
      <PotentialMatchNotice
        kind="reading"
        entries={buildPotentialMatchEntries([{ category: "reading", matches: readingMatches }])}
        fallbackCover={fallbackCover}
        fallbackCoverReferer={fallbackCoverReferer}
        loading={loading}
        onOpenMatch={onOpenMatch}
        onOpenMatchInWorkspace={onOpenMatchInWorkspace}
      />
      <PotentialMatchNotice
        kind="bookmark"
        entries={buildPotentialMatchEntries([{ category: "bookmark", matches: bookmarkMatches }])}
        fallbackCover={fallbackCover}
        fallbackCoverReferer={fallbackCoverReferer}
        loading={loading}
        onOpenMatch={onOpenMatch}
        onOpenMatchInWorkspace={onOpenMatchInWorkspace}
      />
      <PotentialMatchNotice
        kind="readingList"
        entries={buildPotentialMatchEntries([{ category: "readingList", matches: readingListMatches }])}
        fallbackCover={fallbackCover}
        fallbackCoverReferer={fallbackCoverReferer}
        loading={loading}
        onOpenMatch={onOpenMatch}
        onOpenMatchInWorkspace={onOpenMatchInWorkspace}
      />
    </div>
  );
}
