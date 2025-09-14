import { IpcMainInvokeEvent } from "electron";

// OCR handler stub — tesseract removed. Replace with manga-ocr integration.

export async function ocrRecognize(_event: IpcMainInvokeEvent, _imagePathOrDataUrl: string, _opts?: Record<string, any>) {
  console.warn('[ocr] ocrRecognize called but OCR integration has been removed.');
  return [] as any[];
}

export async function processOcrResult(_res: any, _originalPathOrDataUrl: string, _options?: Record<string, any>) {
  return [] as any[];
}

export async function ocrTerminate() { return true; }
