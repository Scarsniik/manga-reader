const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");

async function loadShortcutBindings() {
  const result = await esbuild.build({
    absWorkingDir: rootDir,
    bundle: true,
    format: "cjs",
    platform: "node",
    stdin: {
      contents: `
        export {
          DEFAULT_SHORTCUT_BINDINGS,
          SHORTCUT_ACTION_GROUPS,
          normalizeShortcutSettings,
        } from "@/renderer/utils/shortcutBindings";
      `,
      loader: "ts",
      resolveDir: rootDir,
    },
    plugins: [
      {
        name: "src-alias",
        setup(build) {
          build.onResolve({ filter: /^@\// }, (args) => ({
            path: `${path.join(rootDir, "src", args.path.slice(2))}.ts`,
          }));
        },
      },
    ],
    write: false,
  });

  const module = { exports: {} };
  Function("module", "exports", "require", result.outputFiles[0].text)(
    module,
    module.exports,
    require,
  );
  return module.exports;
}

test("quick review exposes configurable shortcuts for card and series actions", async () => {
  const {
    DEFAULT_SHORTCUT_BINDINGS,
    SHORTCUT_ACTION_GROUPS,
  } = await loadShortcutBindings();
  const quickReviewGroup = SHORTCUT_ACTION_GROUPS.find(
    (group) => group.id === "quick-review",
  );

  assert.ok(quickReviewGroup);
  assert.ok(
    quickReviewGroup.actions.some(
      (action) => action.id === "quickReviewPotentialMatchesToggle",
    ),
  );
  assert.ok(
    quickReviewGroup.actions.some(
      (action) => action.id === "quickReviewMarkRead",
    ),
  );
  assert.ok(
    quickReviewGroup.actions.some(
      (action) => action.id === "quickReviewSeriesPrevious",
    ),
  );
  assert.ok(
    quickReviewGroup.actions.some(
      (action) => action.id === "quickReviewSeriesNext",
    ),
  );
  assert.ok(
    quickReviewGroup.actions.some(
      (action) => action.id === "quickReviewOpenSeries",
    ),
  );
  assert.deepEqual(
    DEFAULT_SHORTCUT_BINDINGS.quickReviewPotentialMatchesToggle,
    ["E", "", ""],
  );
  assert.deepEqual(DEFAULT_SHORTCUT_BINDINGS.quickReviewMarkRead, ["R", "", ""]);
  assert.deepEqual(
    DEFAULT_SHORTCUT_BINDINGS.quickReviewSeriesPrevious,
    ["Shift+ArrowLeft", "", ""],
  );
  assert.deepEqual(
    DEFAULT_SHORTCUT_BINDINGS.quickReviewSeriesNext,
    ["Shift+ArrowRight", "", ""],
  );
  assert.deepEqual(DEFAULT_SHORTCUT_BINDINGS.quickReviewOpenSeries, ["O", "", ""]);
});

test("quick review shortcut overrides are normalized", async () => {
  const { normalizeShortcutSettings } = await loadShortcutBindings();
  const settings = normalizeShortcutSettings({
    shortcuts: {
      quickReviewPotentialMatchesToggle: ["T", "", ""],
      quickReviewMarkRead: ["Ctrl+R", "", ""],
      quickReviewOpenSeries: ["Ctrl+O", "", ""],
    },
  });

  assert.deepEqual(settings.quickReviewPotentialMatchesToggle, ["T", "", ""]);
  assert.deepEqual(settings.quickReviewMarkRead, ["Ctrl+R", "", ""]);
  assert.deepEqual(settings.quickReviewOpenSeries, ["Ctrl+O", "", ""]);
});
