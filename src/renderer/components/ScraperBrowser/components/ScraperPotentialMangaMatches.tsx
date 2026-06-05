import React, { useEffect, useRef, useState } from "react";
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
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!matches.length && open) {
      setOpen(false);
    }
  }, [matches.length, open]);

  useEffect(() => {
    if (!open || !matches.length) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (rootRef.current && target instanceof Node && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
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
    <section ref={rootRef} className={`scraper-browser__potential-match is-${kind}`}>
      <button
        type="button"
        className="scraper-browser__potential-match-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="scraper-browser__potential-match-icon">{icon}</span>
        <span className="scraper-browser__potential-match-label">{noticeTitle}</span>
        <strong>{noticeSummary}</strong>
        {loading ? <span className="scraper-browser__potential-match-loading">Analyse</span> : null}
        <ChevronDownIcon aria-hidden="true" focusable="false" />
      </button>

      {open ? (
        <div className="scraper-browser__potential-match-menu">
          {matches.map((match) => (
            <button
              key={`${match.category}-${match.id}`}
              type="button"
              className="scraper-browser__potential-match-row"
              onClick={() => onOpenMatch(match)}
              onMouseDown={(event) => {
                if (event.button === MIDDLE_BUTTON) {
                  event.preventDefault();
                }
              }}
              onAuxClick={(event) => handleMatchAuxClick(event, match)}
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
        </div>
      ) : null}
    </section>
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
