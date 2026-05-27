import {
  type ScraperTitleSequenceKind,
  type ScraperTitleSequenceMarker,
} from "@/shared/scraper";
import { normalizeTitleAnalysisText } from "@/renderer/utils/scraperTitleAnalysis/text";

const SEQUENCE_PATTERNS: Array<{
  kind: ScraperTitleSequenceKind;
  pattern: RegExp;
}> = [
  {
    kind: "chapter",
    pattern: /(?:^|[\s()[\]{}_\-–—:;,.])(?<label>chap(?:it(?:re)?)?|chapter|ch|cap(?:itulo)?|episode|ep)\s*\.?\s*(?<value>[0-9]+(?:[.,][0-9]+)?(?:\s*-\s*[0-9]+(?:[.,][0-9]+)?)?|[ivxlcdm]+)\s*[\])}.]*$/i,
  },
  {
    kind: "volume",
    pattern: /(?:^|[\s()[\]{}_\-–—:;,.])(?<label>vol(?:ume)?|tome|book)\s*\.?\s*(?<value>[0-9]+(?:[.,][0-9]+)?(?:\s*-\s*[0-9]+(?:[.,][0-9]+)?)?|[ivxlcdm]+)\s*[\])}.]*$/i,
  },
  {
    kind: "part",
    pattern: /(?:^|[\s()[\]{}_\-–—:;,.])(?<label>part(?:ie)?|pt)\s*\.?\s*(?<value>[0-9]+(?:[.,][0-9]+)?(?:\s*-\s*[0-9]+(?:[.,][0-9]+)?)?|[ivxlcdm]+)\s*[\])}.]*$/i,
  },
];

export const appendTitleSequenceMarkers = (
  currentMarkers: ScraperTitleSequenceMarker[],
  nextMarkers: ScraperTitleSequenceMarker[],
): ScraperTitleSequenceMarker[] => {
  const seen = new Set(currentMarkers.map((marker) => `${marker.kind}:${marker.label}:${marker.value}`));
  const merged = [...currentMarkers];

  nextMarkers.forEach((marker) => {
    const key = `${marker.kind}:${marker.label}:${marker.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(marker);
    }
  });

  return merged;
};

export const extractTitleSequenceMarkers = (
  value: string,
): {
  title: string;
  sequenceMarkers: ScraperTitleSequenceMarker[];
} => {
  const originalTitle = normalizeTitleAnalysisText(value);
  let remainingTitle = originalTitle;
  const markers: ScraperTitleSequenceMarker[] = [];

  for (let guard = 0; guard < 6; guard += 1) {
    const matchedPattern = SEQUENCE_PATTERNS
      .map((entry) => ({ ...entry, match: remainingTitle.match(entry.pattern) }))
      .find((entry) => Boolean(entry.match));
    const match = matchedPattern?.match;

    if (!matchedPattern || !match?.groups) {
      break;
    }

    markers.unshift({
      kind: matchedPattern.kind,
      label: normalizeTitleAnalysisText(match.groups.label),
      value: normalizeTitleAnalysisText(match.groups.value).replace(/\s*-\s*/g, "-"),
    });
    remainingTitle = normalizeTitleAnalysisText(remainingTitle.slice(0, match.index));
  }

  return {
    title: remainingTitle || originalTitle,
    sequenceMarkers: markers,
  };
};

