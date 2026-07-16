const assert = require("node:assert/strict");
const test = require("node:test");
const {
  doesOcrPageEntryMatchSource,
  findOcrPageEntryBySource,
  getOcrPageErrorFallback,
  prepareOcrPagesForOverwrite,
  rebaseUserOwnedOcrPageFields,
  rekeyMangaOcrPagesForMutation,
} = require("../dist/electron/handlers/ocr/ocr-page-preservation.js");
const {
  withMangaOcrFileMutationLock,
} = require("../dist/electron/handlers/ocr/ocr-file-mutation-lock.js");
const {
  createBlock,
  createBox,
  editedAt,
} = require("./ocr-test-fixtures.cjs");

test("rekeys overwrite pages by image path while keeping completed pages readable", () => {
  const editedBox = createBox(
    "b0001",
    { x: 0.1, y: 0.1, w: 0.2, h: 0.3 },
    "texte corrigé",
    { textEditedAt: editedAt },
  );
  const manualBox = createBox(
    "manual-1",
    { x: 0.5, y: 0.2, w: 0.1, h: 0.2 },
    "sélection manuelle",
    { manual: true },
  );
  const pages = {
    "0001": {
      status: "done",
      pageIndex: 0,
      pageNumber: 1,
      fileName: "001.jpg",
      imagePath: "C:\\manga\\001.jpg",
      boxes: [editedBox],
      manualBoxes: [manualBox],
    },
    "0002": {
      status: "done",
      pageIndex: 1,
      pageNumber: 2,
      fileName: "002.jpg",
      imagePath: "C:\\manga\\002.jpg",
      width: 800,
      height: 1200,
    },
  };

  const preparedPages = prepareOcrPagesForOverwrite(pages, [
    { pageKey: "0001", imagePath: "C:\\manga\\002.jpg" },
    { pageKey: "0002", imagePath: "C:\\manga\\inserted.jpg" },
    { pageKey: "0003", imagePath: "C:\\manga\\001.jpg" },
  ]);

  assert.deepEqual(Object.keys(preparedPages), ["0001", "0003"]);
  assert.equal(preparedPages["0001"].imagePath, "C:\\manga\\002.jpg");
  assert.equal(preparedPages["0001"].pageIndex, 0);
  assert.equal(preparedPages["0001"].pageNumber, 1);
  assert.equal(preparedPages["0001"].status, "done");
  assert.equal(preparedPages["0003"].imagePath, "C:\\manga\\001.jpg");
  assert.equal(preparedPages["0003"].pageIndex, 2);
  assert.equal(preparedPages["0003"].pageNumber, 3);
  assert.equal(preparedPages["0003"].status, "done");
  assert.equal(preparedPages["0003"].boxes[0], editedBox);
  assert.equal(preparedPages["0003"].manualBoxes[0], manualBox);
  assert.equal(pages["0001"].status, "done");
  assert.equal(pages["0001"].pageIndex, 0);
});

test("finds a moved page by case-insensitive source identity, not the preferred key alone", () => {
  const preferredEntry = {
    status: "done",
    pageIndex: 0,
    pageNumber: 1,
    fileName: "001.jpg",
    imagePath: "C:\\manga\\001.jpg",
    sourceSize: 100,
    sourceMtimeMs: 200,
  };
  const movedEntry = {
    ...preferredEntry,
    pageIndex: 1,
    pageNumber: 2,
    fileName: "002.jpg",
    imagePath: "C:\\Manga\\002.JPG",
    sourceSize: 300,
    sourceMtimeMs: 400,
  };
  const pages = { "0001": preferredEntry, "0002": movedEntry };

  const match = findOcrPageEntryBySource(pages, "0001", {
    imagePath: "c:/manga/002.jpg",
    size: 300,
    mtimeMs: 400,
  });

  assert.equal(match.pageKey, "0002");
  assert.equal(match.entry, movedEntry);
  assert.equal(findOcrPageEntryBySource(pages, "0001", {
    imagePath: "c:/manga/002.jpg",
    size: 301,
    mtimeMs: 400,
  }), null);
});

test("rekeys all retained pages before a mutation and rebuilds progress", () => {
  const file = {
    version: "test",
    engine: "mokuro",
    manga: { id: "manga", title: "Manga", rootPath: "C:\\manga" },
    languageDetection: { status: "not_run", score: null, sampledPages: [] },
    progress: {
      totalPages: 2,
      completedPages: 2,
      failedPages: 0,
      lastProcessedPage: 2,
      mode: "on_demand",
    },
    pages: {
      "0001": {
        status: "done",
        pageIndex: 0,
        pageNumber: 1,
        fileName: "001.jpg",
        imagePath: "C:\\manga\\001.jpg",
      },
      "0002": {
        status: "done",
        pageIndex: 1,
        pageNumber: 2,
        fileName: "002.jpg",
        imagePath: "C:\\manga\\002.jpg",
      },
    },
  };

  rekeyMangaOcrPagesForMutation(file, [
    { pageKey: "0001", imagePath: "C:\\manga\\002.jpg" },
    { pageKey: "0002", imagePath: "C:\\manga\\inserted.jpg" },
    { pageKey: "0003", imagePath: "C:\\manga\\001.jpg" },
  ]);

  assert.equal(file.pages["0001"].imagePath, "C:\\manga\\002.jpg");
  assert.equal(file.pages["0002"], undefined);
  assert.equal(file.pages["0003"].imagePath, "C:\\manga\\001.jpg");
  assert.equal(file.progress.totalPages, 3);
  assert.equal(file.progress.completedPages, 2);
  assert.equal(file.progress.failedPages, 0);
  assert.equal(file.progress.lastProcessedPage, 3);
});

test("rebases concurrent edited text and manual boxes by source identity", () => {
  const bbox = { x: 0.1, y: 0.1, w: 0.2, h: 0.3 };
  const workingPages = {
    "0002": {
      status: "done",
      pageIndex: 1,
      pageNumber: 2,
      fileName: "001.jpg",
      imagePath: "C:\\Manga\\001.jpg",
      sourceSize: 1234,
      sourceMtimeMs: 5678,
      width: 800,
      height: 1200,
      boxes: [createBox("new-id", bbox, "nouvel OCR")],
      blocks: [createBlock("new-id", bbox, "nouvel OCR")],
      manualBoxes: [createBox("stale-manual", bbox, "ancienne sélection", { manual: true })],
    },
  };
  const latestManualBox = createBox(
    "manual-new",
    { x: 0.6, y: 0.2, w: 0.1, h: 0.2 },
    "sélection récente",
    { manual: true, textEditedAt: editedAt },
  );
  const latestPages = {
    "0001": {
      ...workingPages["0002"],
      pageIndex: 0,
      pageNumber: 1,
      imagePath: "c:/manga/001.jpg",
      boxes: [createBox("old-id", bbox, "correction récente", { textEditedAt: editedAt })],
      manualBoxes: [latestManualBox],
    },
  };

  const rebasedPages = rebaseUserOwnedOcrPageFields(workingPages, latestPages);

  assert.equal(rebasedPages["0002"].boxes[0].text, "correction récente");
  assert.equal(rebasedPages["0002"].blocks[0].text, "correction récente");
  assert.deepEqual(rebasedPages["0002"].manualBoxes, [latestManualBox]);
  assert.equal(rebasedPages["0002"].status, "done");
  assert.equal(rebasedPages["0002"].pageIndex, 1);
});

test("rebases a concurrent manual-box deletion", () => {
  const page = {
    status: "done",
    pageIndex: 0,
    pageNumber: 1,
    fileName: "001.jpg",
    imagePath: "C:\\manga\\001.jpg",
    sourceSize: 1234,
    sourceMtimeMs: 5678,
    boxes: [],
    blocks: [],
    manualBoxes: [createBox("manual-1", { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, "à supprimer")],
  };

  const rebasedPages = rebaseUserOwnedOcrPageFields(
    { "0001": page },
    { "0001": { ...page, manualBoxes: [] } },
  );

  assert.deepEqual(rebasedPages["0001"].manualBoxes, []);
});

test("error fallback never carries stale OCR data across a source change", () => {
  const bbox = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
  const entry = {
    status: "done",
    pageIndex: 0,
    pageNumber: 1,
    fileName: "001.jpg",
    imagePath: "C:\\manga\\001.jpg",
    sourceSize: 100,
    sourceMtimeMs: 200,
    width: 800,
    height: 1200,
    boxes: [createBox("auto", bbox, "ancienne lecture", { textEditedAt: editedAt })],
    blocks: [createBlock("auto", bbox, "ancienne lecture")],
    manualBoxes: [createBox("manual", bbox, "ancienne sélection", { manual: true })],
  };
  const changedSource = {
    imagePath: "C:\\manga\\001.jpg",
    size: 101,
    mtimeMs: 201,
  };

  assert.equal(doesOcrPageEntryMatchSource(entry, changedSource), false);
  assert.deepEqual(getOcrPageErrorFallback(entry, changedSource), {
    width: undefined,
    height: undefined,
    boxes: [],
    blocks: [],
    manualBoxes: [],
  });
  assert.equal(getOcrPageErrorFallback(entry, {
    imagePath: "c:/MANGA/001.jpg",
    size: 100,
    mtimeMs: 200,
  }).boxes[0].text, "ancienne lecture");
});

test("serializes OCR file mutations for equivalent manga paths", async () => {
  const events = [];
  let releaseFirstMutation;
  let notifyFirstMutationStarted;
  const firstMutationStarted = new Promise((resolve) => {
    notifyFirstMutationStarted = resolve;
  });
  const firstMutationGate = new Promise((resolve) => {
    releaseFirstMutation = resolve;
  });

  const firstMutation = withMangaOcrFileMutationLock("C:\\Manga", async () => {
    events.push("first-start");
    notifyFirstMutationStarted();
    await firstMutationGate;
    events.push("first-end");
  });
  await firstMutationStarted;
  const secondMutation = withMangaOcrFileMutationLock("c:/manga/", async () => {
    events.push("second-start");
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(events, ["first-start"]);
  releaseFirstMutation();
  await Promise.all([firstMutation, secondMutation]);
  assert.deepEqual(events, ["first-start", "first-end", "second-start"]);
});
