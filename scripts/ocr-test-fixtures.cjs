const createBox = (id, bbox, text, options = {}) => ({
  id,
  bbox,
  text,
  vertical: true,
  lines: [text],
  ...options,
});

const createBlock = (id, bbox, text, options = {}) => ({
  id,
  bbox,
  bboxPx: {
    x1: bbox.x * 1000,
    y1: bbox.y * 1000,
    x2: (bbox.x + bbox.w) * 1000,
    y2: (bbox.y + bbox.h) * 1000,
  },
  text,
  vertical: true,
  lines: [{ text }],
  filteredOut: false,
  filterReason: null,
  ...options,
});

module.exports = {
  createBlock,
  createBox,
  editedAt: "2026-07-16T20:00:00.000Z",
};
