const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const originalLoad = Module._load;
Module._load = function loadWithElectronStub(request, parent, isMain) {
  if (request === "electron") {
    return {
      app: {
        getAppPath: () => path.join(__dirname, ".."),
        getPath: () => path.join(__dirname, ".ocr-unicode-test-user-data"),
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

const {
  countJapaneseChars,
  countLatinChars,
  countMeaningfulOcrChars,
  getOcrBlockFilterReason,
} = require("../dist/electron/handlers/ocr/helpers.js");

Module._load = originalLoad;

test("OCR analysis counts full-width Latin letters and digits", () => {
  assert.equal(countMeaningfulOcrChars("ＡｂＣ１２３"), 6);
  assert.equal(countLatinChars("ＡｂＣ１２３"), 3);
  assert.equal(countMeaningfulOcrChars("第１２話"), 4);
});

test("OCR analysis normalizes half-width Japanese characters", () => {
  assert.equal(countJapaneseChars("ﾃｽﾄ"), 3);
});

test("OCR filtering analyzes normalized text without changing displayed text", () => {
  const displayedText = "ＡＢＣ１２３";
  const block = {
    id: "b0001",
    text: displayedText,
    bboxPx: { x1: 0, y1: 0, x2: 600, y2: 100 },
    bbox: { x: 0, y: 0, w: 0.6, h: 0.1 },
    vertical: false,
    fontSize: 32,
    angle: 0,
    detectorConfidence: 1,
    language: "eng",
    aspectRatio: 0.16,
    maskScore: 0.5,
    lines: [{ text: displayedText }],
    confidence: null,
  };

  assert.equal(getOcrBlockFilterReason(block), null);
  assert.equal(block.text, displayedText);
  assert.equal(block.lines[0].text, displayedText);
});

const createFilterBlock = (text, overrides = {}) => ({
  id: "b0001",
  text,
  bboxPx: { x1: 0, y1: 0, x2: 200, y2: 200 },
  bbox: { x: 0, y: 0, w: 0.14, h: 0.15 },
  vertical: true,
  fontSize: undefined,
  angle: 0,
  detectorConfidence: 1,
  language: "jpn",
  aspectRatio: 1,
  maskScore: 0.07,
  lines: [{ text }],
  confidence: null,
  ...overrides,
});

test("OCR filtering keeps real multi-column bubbles with low mask coverage", () => {
  const page9Bubble = createFilterBlock(
    "い．．いや．．．それは元々苦手なとこだったし．．．",
    {
      bbox: { x: 0.7195, y: 0.3723, w: 0.1352, h: 0.1467 },
      maskScore: 0.102,
    },
  );
  const page10Bubble = createFilterBlock(
    "でも一緒にいるとイチャイチャしたくなっちゃうからだからしょうがなくて",
    {
      bbox: { x: 0.3141, y: 0.0498, w: 0.2258, h: 0.1288 },
      maskScore: 0.074,
    },
  );

  assert.equal(getOcrBlockFilterReason(page9Bubble), null);
  assert.equal(getOcrBlockFilterReason(page10Bubble), null);
});

test("OCR filtering still rejects obvious punctuation and repeated-character noise", () => {
  assert.equal(getOcrBlockFilterReason(createFilterBlock("．．．．．．")), "punctuation-only");
  assert.equal(getOcrBlockFilterReason(createFilterBlock("ああああああ")), "repeated-char-run");
});
