import type { NormalizedBox, NormalizedPageBlock } from "./types";

type NormalizedBoundingBox = NormalizedBox["bbox"];

type EditedBoxMatchCandidate = {
  id: string;
  bbox: NormalizedBoundingBox;
};

type BoundingBoxOverlap = {
  intersectionOverUnion: number;
  overlapOnSmallerBox: number;
  areaRatio: number;
};

const EXACT_ID_MIN_INTERSECTION_OVER_UNION = 0.35;
const EXACT_ID_MIN_OVERLAP_ON_SMALLER_BOX = 0.7;
const GEOMETRY_MIN_INTERSECTION_OVER_UNION = 0.55;
const GEOMETRY_MIN_OVERLAP_ON_SMALLER_BOX = 0.85;
const GEOMETRY_MAX_AREA_RATIO = 2.5;
const EXACT_ID_MATCH_SCORE_BONUS = 0.25;

export const getEditedOcrTextLines = (text: string): string[] => (
  text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
);

const hasUsableBoundingBox = (bbox?: NormalizedBoundingBox | null): bbox is NormalizedBoundingBox => (
  !!bbox
  && Number.isFinite(bbox.x)
  && Number.isFinite(bbox.y)
  && Number.isFinite(bbox.w)
  && Number.isFinite(bbox.h)
  && bbox.w > 0
  && bbox.h > 0
);

const getBoundingBoxOverlap = (
  left: NormalizedBoundingBox,
  right: NormalizedBoundingBox,
): BoundingBoxOverlap => {
  const intersectionWidth = Math.max(
    0,
    Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y),
  );
  const intersectionArea = intersectionWidth * intersectionHeight;
  const leftArea = left.w * left.h;
  const rightArea = right.w * right.h;
  const unionArea = leftArea + rightArea - intersectionArea;
  const smallerArea = Math.min(leftArea, rightArea);

  return {
    intersectionOverUnion: unionArea > 0 ? intersectionArea / unionArea : 0,
    overlapOnSmallerBox: smallerArea > 0 ? intersectionArea / smallerArea : 0,
    areaRatio: smallerArea > 0 ? Math.max(leftArea, rightArea) / smallerArea : Number.POSITIVE_INFINITY,
  };
};

const isExactIdGeometryCompatible = (
  overlap: BoundingBoxOverlap,
): boolean => {
  return overlap.areaRatio <= GEOMETRY_MAX_AREA_RATIO
    && (
      overlap.intersectionOverUnion >= EXACT_ID_MIN_INTERSECTION_OVER_UNION
      || overlap.overlapOnSmallerBox >= EXACT_ID_MIN_OVERLAP_ON_SMALLER_BOX
    );
};

const isConservativeGeometryMatch = (overlap: BoundingBoxOverlap): boolean => (
  overlap.intersectionOverUnion >= GEOMETRY_MIN_INTERSECTION_OVER_UNION
  || (
    overlap.overlapOnSmallerBox >= GEOMETRY_MIN_OVERLAP_ON_SMALLER_BOX
    && overlap.areaRatio <= GEOMETRY_MAX_AREA_RATIO
  )
);

const getEditedBoxes = (boxes?: NormalizedBox[] | null): NormalizedBox[] => (
  Array.isArray(boxes)
    ? boxes.filter((box) => typeof box.id === "string" && box.id.length > 0 && !!box.textEditedAt)
    : []
);

const buildMatchCandidates = (
  boxes: NormalizedBox[],
  blocks: NormalizedPageBlock[],
): EditedBoxMatchCandidate[] => {
  const candidates: EditedBoxMatchCandidate[] = [];
  const knownIds = new Set<string>();

  for (const block of blocks) {
    if (!block.id || knownIds.has(block.id)) {
      continue;
    }
    knownIds.add(block.id);
    candidates.push({ id: block.id, bbox: block.bbox });
  }

  for (const box of boxes) {
    if (!box.id || knownIds.has(box.id)) {
      continue;
    }
    knownIds.add(box.id);
    candidates.push({ id: box.id, bbox: box.bbox });
  }

  return candidates;
};

const matchEditedBoxes = (
  editedBoxes: NormalizedBox[],
  candidates: EditedBoxMatchCandidate[],
): Map<string, NormalizedBox> => {
  const matches = new Map<string, NormalizedBox>();
  const matchedEditedIndexes = new Set<number>();
  const matchedCandidateIndexes = new Set<number>();

  const matchPairs: Array<{
    editedIndex: number;
    candidateIndex: number;
    overlap: BoundingBoxOverlap;
    exactId: boolean;
    score: number;
  }> = [];

  editedBoxes.forEach((editedBox, editedIndex) => {
    if (!hasUsableBoundingBox(editedBox.bbox)) {
      return;
    }

    candidates.forEach((candidate, candidateIndex) => {
      if (!hasUsableBoundingBox(candidate.bbox)) {
        return;
      }

      const overlap = getBoundingBoxOverlap(editedBox.bbox, candidate.bbox);
      const exactId = candidate.id === editedBox.id;
      const eligible = exactId
        ? isExactIdGeometryCompatible(overlap)
        : isConservativeGeometryMatch(overlap);
      if (eligible) {
        matchPairs.push({
          editedIndex,
          candidateIndex,
          overlap,
          exactId,
          score: (2 * overlap.intersectionOverUnion)
            + overlap.overlapOnSmallerBox
            + (exactId ? EXACT_ID_MATCH_SCORE_BONUS : 0),
        });
      }
    });
  });

  matchPairs.sort((left, right) => (
    right.score - left.score
    || right.overlap.intersectionOverUnion - left.overlap.intersectionOverUnion
    || right.overlap.overlapOnSmallerBox - left.overlap.overlapOnSmallerBox
    || left.overlap.areaRatio - right.overlap.areaRatio
    || Number(right.exactId) - Number(left.exactId)
  ));

  for (const pair of matchPairs) {
    if (
      matchedEditedIndexes.has(pair.editedIndex)
      || matchedCandidateIndexes.has(pair.candidateIndex)
    ) {
      continue;
    }

    const editedBox = editedBoxes[pair.editedIndex];
    const candidate = candidates[pair.candidateIndex];
    matchedEditedIndexes.add(pair.editedIndex);
    matchedCandidateIndexes.add(pair.candidateIndex);
    matches.set(candidate.id, editedBox);
  }

  return matches;
};

const getOverrideLines = (override: NormalizedBox): string[] => (
  Array.isArray(override.lines) && override.lines.length > 0
    ? override.lines
    : getEditedOcrTextLines(override.text)
);

const applyOverrideToBox = (box: NormalizedBox, override: NormalizedBox): NormalizedBox => ({
  ...box,
  text: override.text,
  lines: getOverrideLines(override),
  textEditedAt: override.textEditedAt,
});

const applyOverrideToBlock = (
  block: NormalizedPageBlock,
  override: NormalizedBox,
): NormalizedPageBlock => {
  const lines = getOverrideLines(override);

  return {
    ...block,
    text: override.text,
    textEditedAt: override.textEditedAt,
    lines: lines.map((line, index) => ({
      ...(Array.isArray(block.lines) ? block.lines[index] : undefined),
      text: line,
    })),
    filteredOut: false,
    filterReason: null,
  };
};

const boxFromBlock = (block: NormalizedPageBlock): NormalizedBox => ({
  id: block.id,
  text: block.text,
  bbox: block.bbox,
  vertical: block.vertical,
  lines: block.lines.map((line) => line.text),
  textEditedAt: block.textEditedAt,
});

const appendUnmatchedEditedBoxes = (
  boxes: NormalizedBox[],
  editedBoxes: NormalizedBox[],
  matches: Map<string, NormalizedBox>,
  retainUnmatched: boolean,
): NormalizedBox[] => {
  if (!retainUnmatched) {
    return boxes;
  }

  const matchedOverrides = new Set(matches.values());
  const usedIds = new Set(boxes.map((box) => box.id));
  const retainedBoxes = [...boxes];

  for (const editedBox of editedBoxes) {
    if (matchedOverrides.has(editedBox)) {
      continue;
    }

    let retainedId = editedBox.id;
    if (usedIds.has(retainedId)) {
      const idBase = `edited-${editedBox.id}`;
      retainedId = idBase;
      let suffix = 2;
      while (usedIds.has(retainedId)) {
        retainedId = `${idBase}-${suffix}`;
        suffix += 1;
      }
    }

    usedIds.add(retainedId);
    retainedBoxes.push({
      ...editedBox,
      id: retainedId,
      lines: getOverrideLines(editedBox),
    });
  }

  return retainedBoxes;
};

export function preserveEditedOcrText(
  boxes: NormalizedBox[],
  blocks: NormalizedPageBlock[],
  previousBoxes?: NormalizedBox[] | null,
  options?: { retainUnmatched?: boolean },
): { boxes: NormalizedBox[]; blocks: NormalizedPageBlock[] } {
  const editedBoxes = getEditedBoxes(previousBoxes);
  if (editedBoxes.length === 0) {
    return { boxes, blocks };
  }

  const matches = matchEditedBoxes(editedBoxes, buildMatchCandidates(boxes, blocks));
  const updatedBlocks = blocks.map((block) => {
    const override = matches.get(block.id);
    return override ? applyOverrideToBlock(block, override) : block;
  });
  const updatedBoxById = new Map(boxes.map((box) => {
    const override = matches.get(box.id);
    return [box.id, override ? applyOverrideToBox(box, override) : box] as const;
  }));

  if (updatedBlocks.length === 0) {
    return {
      boxes: appendUnmatchedEditedBoxes(
        Array.from(updatedBoxById.values()),
        editedBoxes,
        matches,
        !!options?.retainUnmatched,
      ),
      blocks: updatedBlocks,
    };
  }

  const orderedBoxes: NormalizedBox[] = [];
  const addedBoxIds = new Set<string>();
  for (const block of updatedBlocks) {
    const existingBox = updatedBoxById.get(block.id);
    if (existingBox) {
      orderedBoxes.push(existingBox);
      addedBoxIds.add(existingBox.id);
    } else if (matches.has(block.id)) {
      orderedBoxes.push(boxFromBlock(block));
      addedBoxIds.add(block.id);
    }
  }

  for (const box of updatedBoxById.values()) {
    if (!addedBoxIds.has(box.id)) {
      orderedBoxes.push(box);
    }
  }

  return {
    boxes: appendUnmatchedEditedBoxes(
      orderedBoxes,
      editedBoxes,
      matches,
      !!options?.retainUnmatched,
    ),
    blocks: updatedBlocks,
  };
}
