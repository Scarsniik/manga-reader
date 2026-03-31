export type Box = {
  id: string;
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
};

export async function mockOcrRecognize(_src?: string, _options?: Record<string, any>): Promise<{ boxes: Box[] }> {
  // Return the sample from ORC-doc.md
  return {
    boxes: [
      { id: 'b1', text: '私は日本人です。', bbox: { x: 0.6, y: 0.2, w: 0.18, h: 0.25 } },
      { id: 'b2', text: '日本語を話す！', bbox: { x: 0.63, y: 0.5, w: 0.16, h: 0.18 } },
      { id: 'b3', text: 'こんにちは', bbox: { x: 0.2, y: 0.3, w: 0.2, h: 0.12 } },
    ],
  };
}

export function getOcrApi() {
  // If running inside Electron with preload exposing window.api.ocrRecognize, use it.
  // Otherwise return the mock function for front-end development.
  // Note: keep call signature simple: () => Promise<{ boxes: Box[] }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = typeof window !== 'undefined' ? window : {};
  if (w.api && typeof w.api.ocrRecognize === 'function') {
    return async (src?: string, options?: Record<string, any>) => w.api.ocrRecognize(src, options);
  }
  return mockOcrRecognize;
}
