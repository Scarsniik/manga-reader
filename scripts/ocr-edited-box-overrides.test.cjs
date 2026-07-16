const assert = require("node:assert/strict");
const test = require("node:test");
const {
  preserveEditedOcrText,
} = require("../dist/electron/handlers/ocr/edited-box-overrides.js");
const {
  createBlock,
  createBox,
  editedAt,
} = require("./ocr-test-fixtures.cjs");

test("preserves an edited text by exact id before considering geometry", () => {
  const previousBoxes = [createBox(
    "b0001",
    { x: 0.1, y: 0.1, w: 0.2, h: 0.3 },
    "texte corrigé",
    { textEditedAt: editedAt },
  )];
  const boxes = [
    createBox("b0001", { x: 0.11, y: 0.1, w: 0.2, h: 0.3 }, "id exact"),
    createBox("b0002", { x: 0.1, y: 0.1, w: 0.2, h: 0.3 }, "géométrie exacte"),
  ];
  const blocks = boxes.map((box) => createBlock(box.id, box.bbox, box.text));

  const result = preserveEditedOcrText(boxes, blocks, previousBoxes);

  assert.equal(result.boxes[0].text, "texte corrigé");
  assert.equal(result.boxes[0].textEditedAt, editedAt);
  assert.equal(result.blocks[0].text, "texte corrigé");
  assert.equal(result.boxes[1].text, "géométrie exacte");
});

test("does not let an exact id beat a much stronger geometry match", () => {
  const previousBoxes = [createBox(
    "b0001",
    { x: 0.1, y: 0.1, w: 0.2, h: 0.3 },
    "correction humaine",
    { textEditedAt: editedAt },
  )];
  const boxes = [
    createBox("b0001", { x: 0.16, y: 0.1, w: 0.2, h: 0.3 }, "id déplacé"),
    createBox("new-id", { x: 0.1, y: 0.1, w: 0.2, h: 0.3 }, "géométrie exacte"),
  ];
  const blocks = boxes.map((box) => createBlock(box.id, box.bbox, box.text));

  const result = preserveEditedOcrText(boxes, blocks, previousBoxes);

  assert.equal(result.boxes[0].text, "id déplacé");
  assert.equal(result.boxes[1].text, "correction humaine");
  assert.equal(result.blocks[1].textEditedAt, editedAt);
});

test("rejects an exact-id match with an incompatible area ratio", () => {
  const previousBoxes = [createBox(
    "b0001",
    { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
    "correction humaine",
    { textEditedAt: editedAt },
  )];
  const boxes = [createBox(
    "b0001",
    { x: 0.05, y: 0.05, w: 0.3, h: 0.3 },
    "grand bloc sans rapport",
  )];
  const blocks = [createBlock("b0001", boxes[0].bbox, boxes[0].text)];

  const result = preserveEditedOcrText(boxes, blocks, previousBoxes);

  assert.equal(result.boxes[0].text, "grand bloc sans rapport");
  assert.equal(result.boxes[0].textEditedAt, undefined);
  assert.equal(result.blocks[0].text, "grand bloc sans rapport");
});

test("falls back to conservative geometry when generated ids move", () => {
  const previousBoxes = [createBox(
    "b0001",
    { x: 0.1, y: 0.15, w: 0.2, h: 0.3 },
    "correction à conserver",
    { textEditedAt: editedAt },
  )];
  const boxes = [
    createBox("b0001", { x: 0.7, y: 0.15, w: 0.2, h: 0.3 }, "nouveau bloc sans rapport"),
    createBox("b0002", { x: 0.105, y: 0.155, w: 0.2, h: 0.3 }, "nouvel id"),
  ];
  const blocks = boxes.map((box) => createBlock(box.id, box.bbox, box.text));

  const result = preserveEditedOcrText(boxes, blocks, previousBoxes);

  assert.equal(result.boxes[0].text, "nouveau bloc sans rapport");
  assert.equal(result.boxes[1].text, "correction à conserver");
  assert.equal(result.blocks[1].text, "correction à conserver");
  assert.equal(result.blocks[1].textEditedAt, editedAt);
});

test("does not apply an edited text to a weakly overlapping neighbor", () => {
  const previousBoxes = [createBox(
    "old-id",
    { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    "correction",
    { textEditedAt: editedAt },
  )];
  const boxes = [createBox(
    "new-id",
    { x: 0.25, y: 0.1, w: 0.2, h: 0.2 },
    "voisin",
  )];
  const blocks = [createBlock("new-id", boxes[0].bbox, boxes[0].text)];

  const result = preserveEditedOcrText(boxes, blocks, previousBoxes);

  assert.equal(result.boxes[0].text, "voisin");
  assert.equal(result.blocks[0].text, "voisin");
  assert.equal(result.boxes[0].textEditedAt, undefined);
});

test("retains an unmatched edit as its own box when the source image is unchanged", () => {
  const previousBoxes = [createBox(
    "b0001",
    { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    "correction sans nouvelle détection",
    { textEditedAt: editedAt },
  )];
  const boxes = [createBox(
    "b0001",
    { x: 0.7, y: 0.7, w: 0.15, h: 0.15 },
    "bloc sans rapport",
  )];
  const blocks = [createBlock("b0001", boxes[0].bbox, boxes[0].text)];

  const result = preserveEditedOcrText(boxes, blocks, previousBoxes, { retainUnmatched: true });

  assert.equal(result.boxes[0].text, "bloc sans rapport");
  assert.deepEqual(result.boxes[1], createBox(
    "edited-b0001",
    previousBoxes[0].bbox,
    "correction sans nouvelle détection",
    { textEditedAt: editedAt },
  ));
  assert.equal(result.blocks[0].text, "bloc sans rapport");
});

test("restores a geometrically matched edited block filtered by a recalculation", () => {
  const bbox = { x: 0.35, y: 0.2, w: 0.12, h: 0.4 };
  const previousBoxes = [createBox(
    "old-id",
    bbox,
    "lecture humaine",
    { textEditedAt: editedAt, lines: ["lecture", "humaine"] },
  )];
  const blocks = [createBlock("new-id", bbox, "résultat filtré", {
    filteredOut: true,
    filterReason: "low-mask-coverage",
  })];

  const result = preserveEditedOcrText([], blocks, previousBoxes);

  assert.equal(result.blocks[0].text, "lecture humaine");
  assert.equal(result.blocks[0].filteredOut, false);
  assert.equal(result.blocks[0].filterReason, null);
  assert.deepEqual(result.blocks[0].lines.map(({ text }) => text), ["lecture", "humaine"]);
  assert.deepEqual(result.boxes, [createBox(
    "new-id",
    bbox,
    "lecture humaine",
    { textEditedAt: editedAt, lines: ["lecture", "humaine"] },
  )]);
});

test("uses each edited override at most once and chooses the strongest overlap", () => {
  const previousBoxes = [createBox(
    "old-id",
    { x: 0.1, y: 0.1, w: 0.2, h: 0.4 },
    "correction unique",
    { textEditedAt: editedAt },
  )];
  const boxes = [
    createBox("candidate-weaker", { x: 0.12, y: 0.1, w: 0.2, h: 0.4 }, "faible"),
    createBox("candidate-best", { x: 0.1, y: 0.1, w: 0.2, h: 0.4 }, "fort"),
  ];
  const blocks = boxes.map((box) => createBlock(box.id, box.bbox, box.text));

  const result = preserveEditedOcrText(boxes, blocks, previousBoxes);

  assert.equal(result.boxes[0].text, "faible");
  assert.equal(result.boxes[1].text, "correction unique");
  assert.equal(result.boxes.filter((box) => box.textEditedAt === editedAt).length, 1);
});

test("ignores previous OCR text that was never edited by the user", () => {
  const bbox = { x: 0.1, y: 0.1, w: 0.2, h: 0.3 };
  const previousBoxes = [createBox("old-id", bbox, "ancien OCR")];
  const boxes = [createBox("new-id", bbox, "nouvel OCR")];
  const blocks = [createBlock("new-id", bbox, "nouvel OCR")];

  const result = preserveEditedOcrText(boxes, blocks, previousBoxes);

  assert.equal(result.boxes, boxes);
  assert.equal(result.blocks, blocks);
});
