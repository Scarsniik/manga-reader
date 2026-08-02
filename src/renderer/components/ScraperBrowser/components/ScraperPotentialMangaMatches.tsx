import React, { useEffect, useRef, useState } from "react";
import AdaptiveDropdown from "@/renderer/components/AdaptiveDropdown/AdaptiveDropdown";
import {
  BookmarkRibbonIcon,
  ChevronDownIcon,
  DetailsCardIcon,
  OpenBookIcon,
} from "@/renderer/components/icons";
import type { ScraperPotentialMangaMatch } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";
import { toLocalImageUrl } from "@/renderer/utils/history";
import { buildRemoteThumbnailUrl } from "@/renderer/utils/remoteThumbnails";

const MIDDLE_BUTTON = 1;

type NoticeKind = "reading" | "bookmark";

type Props = {
  readingMatches: ScraperPotentialMangaMatch[];
  bookmarkMatches: ScraperPotentialMangaMatch[];
  fallbackCover?: string;
  fallbackCoverReferer?: string;
  loading?: boolean;
  onOpenMatch: (match: ScraperPotentialMangaMatch) => void;
  onOpenMatchInWorkspace: (match: ScraperPotentialMangaMatch) => void;
};

type NoticeProps = {
  kind: NoticeKind;
  matches: ScraperPotentialMangaMatch[];
  fallbackCover?: string;
  fallbackCoverReferer?: string;
  loading?: boolean;
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
  match.target.kind === "library" ? "Bibliotheque" : "Fiche"
);

const getNoticeTitle = (kind: NoticeKind): string => (
  kind === "reading" ? "Potentiellement deja lu" : "Potentiellement bookmarke"
);

const getNoticeSummary = (kind: NoticeKind, matches: ScraperPotentialMangaMatch[]): string => (
  kind === "reading" ? getReadingSummary(matches) : formatCount(matches.length, "correspondance")
);

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
  match: ScraperPotentialMangaMatch;
  fallbackCover?: string;
  fallbackCoverReferer?: string;
  onOpen: () => void;
  onOpenInWorkspace: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

function PotentialMatchCard({
  match,
  fallbackCover,
  fallbackCoverReferer,
  onOpen,
  onOpenInWorkspace,
}: PotentialMatchCardProps) {
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
      onClick={onOpen}
      onMouseDown={(event) => {
        if (event.button === MIDDLE_BUTTON) {
          event.preventDefault();
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
        <small>{match.sourceLabel} - {match.detailLabel}</small>
      </span>
    </button>
  );
}

function PotentialMatchNotice({
  kind,
  matches,
  fallbackCover,
  fallbackCoverReferer,
  loading = false,
  onOpenMatch,
  onOpenMatchInWorkspace,
}: NoticeProps) {
  const [open, setOpen] = useState(false);
  const matchListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!matches.length && open) {
      setOpen(false);
    }
  }, [matches.length, open]);

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
  }, [matches.length, open]);

  if (!matches.length) {
    return null;
  }

  const noticeTitle = getNoticeTitle(kind);
  const noticeSummary = getNoticeSummary(kind, matches);
  const icon = kind === "reading"
    ? <OpenBookIcon aria-hidden="true" focusable="false" />
    : <BookmarkRibbonIcon aria-hidden="true" focusable="false" />;

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
      className={`scraper-browser__potential-match is-${kind}`}
      contentClassName="scraper-browser__potential-match-menu"
      contentRole="menu"
      gap={6}
      horizontalBoundarySelector=".scraper-browser__details-body"
      maxHeight={280}
      renderTrigger={({ contentId, isOpen, setTriggerRef, toggle }) => (
        <button
          ref={setTriggerRef}
          type="button"
          className="scraper-browser__potential-match-toggle"
          onClick={toggle}
          aria-controls={contentId}
          aria-expanded={isOpen}
          aria-haspopup="menu"
        >
          <span className="scraper-browser__potential-match-icon">{icon}</span>
          <span className="scraper-browser__potential-match-label">{noticeTitle}</span>
          <strong>{noticeSummary}</strong>
          {loading ? <span className="scraper-browser__potential-match-loading">Analyse</span> : null}
          <ChevronDownIcon aria-hidden="true" focusable="false" />
        </button>
      )}
    >
      <div
        ref={matchListRef}
        className="scraper-browser__potential-match-list"
        role="none"
      >
        {matches.map((match) => (
          <PotentialMatchCard
            key={`${match.category}-${match.id}`}
            match={match}
            fallbackCover={fallbackCover}
            fallbackCoverReferer={fallbackCoverReferer}
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
        ))}
      </div>
    </AdaptiveDropdown>
  );
}

export default function ScraperPotentialMangaMatches({
  readingMatches,
  bookmarkMatches,
  fallbackCover,
  fallbackCoverReferer,
  loading = false,
  onOpenMatch,
  onOpenMatchInWorkspace,
}: Props) {
  if (!readingMatches.length && !bookmarkMatches.length) {
    return null;
  }

  return (
    <div className="scraper-browser__potential-matches">
      <PotentialMatchNotice
        kind="reading"
        matches={readingMatches}
        fallbackCover={fallbackCover}
        fallbackCoverReferer={fallbackCoverReferer}
        loading={loading}
        onOpenMatch={onOpenMatch}
        onOpenMatchInWorkspace={onOpenMatchInWorkspace}
      />
      <PotentialMatchNotice
        kind="bookmark"
        matches={bookmarkMatches}
        fallbackCover={fallbackCover}
        fallbackCoverReferer={fallbackCoverReferer}
        loading={loading}
        onOpenMatch={onOpenMatch}
        onOpenMatchInWorkspace={onOpenMatchInWorkspace}
      />
    </div>
  );
}
