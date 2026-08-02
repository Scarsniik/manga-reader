import React, { useEffect, useState } from "react";
import AdaptiveDropdown from "@/renderer/components/AdaptiveDropdown/AdaptiveDropdown";
import {
  BookmarkRibbonIcon,
  ChevronDownIcon,
  DetailsCardIcon,
  OpenBookIcon,
} from "@/renderer/components/icons";
import type { ScraperPotentialMangaMatch } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";

const MIDDLE_BUTTON = 1;

type NoticeKind = "reading" | "bookmark";

type Props = {
  readingMatches: ScraperPotentialMangaMatch[];
  bookmarkMatches: ScraperPotentialMangaMatch[];
  loading?: boolean;
  onOpenMatch: (match: ScraperPotentialMangaMatch) => void;
  onOpenMatchInWorkspace: (match: ScraperPotentialMangaMatch) => void;
};

type NoticeProps = {
  kind: NoticeKind;
  matches: ScraperPotentialMangaMatch[];
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

function PotentialMatchNotice({
  kind,
  matches,
  loading = false,
  onOpenMatch,
  onOpenMatchInWorkspace,
}: NoticeProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!matches.length && open) {
      setOpen(false);
    }
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
      {matches.map((match) => (
        <button
          key={`${match.category}-${match.id}`}
          type="button"
          className="scraper-browser__potential-match-row"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onOpenMatch(match);
          }}
          onMouseDown={(event) => {
            if (event.button === MIDDLE_BUTTON) {
              event.preventDefault();
            }
          }}
          onAuxClick={(event) => {
            if (event.button === MIDDLE_BUTTON) {
              setOpen(false);
            }
            handleMatchAuxClick(event, match);
          }}
          title={`${getTargetLabel(match)}. Clic molette : nouvel onglet workspace`}
          data-prevent-middle-click-autoscroll="true"
        >
          <span className="scraper-browser__potential-match-main">
            <span>{match.title}</span>
            <small>{match.sourceLabel} - {match.detailLabel}</small>
          </span>
          <span className="scraper-browser__potential-match-action">
            <DetailsCardIcon aria-hidden="true" focusable="false" />
            {getTargetLabel(match)}
          </span>
        </button>
      ))}
    </AdaptiveDropdown>
  );
}

export default function ScraperPotentialMangaMatches({
  readingMatches,
  bookmarkMatches,
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
        loading={loading}
        onOpenMatch={onOpenMatch}
        onOpenMatchInWorkspace={onOpenMatchInWorkspace}
      />
      <PotentialMatchNotice
        kind="bookmark"
        matches={bookmarkMatches}
        loading={loading}
        onOpenMatch={onOpenMatch}
        onOpenMatchInWorkspace={onOpenMatchInWorkspace}
      />
    </div>
  );
}
