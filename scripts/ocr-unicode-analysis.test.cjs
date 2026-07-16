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
