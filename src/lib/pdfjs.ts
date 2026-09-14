import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const asset = (p: string) => new URL(p, document.baseURI).href;

/** Static pdf.js resources copied into /pdfjs by vite-plugin-static-copy. */
export const PDFJS_ASSETS = {
  cMapUrl: asset("pdfjs/cmaps/"),
  cMapPacked: true,
  standardFontDataUrl: asset("pdfjs/standard_fonts/"),
  wasmUrl: asset("pdfjs/wasm/"),
  iccUrl: asset("pdfjs/iccs/"),
};
export const IMAGE_RESOURCES_PATH = asset("pdfjs/images/");

export const { AnnotationEditorType, AnnotationEditorParamsType, AnnotationMode } = pdfjs;

export class PasswordRequired extends Error {
  constructor(public readonly wrong: boolean) {
    super(wrong ? "Incorrect password" : "Password required");
  }
}

/**
 * Load a PDF. The byte array is copied because pdf.js transfers the buffer
 * to its worker and would otherwise detach the caller's copy.
 */
export async function loadPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    password,
    ...PDFJS_ASSETS,
  });
  try {
    return await task.promise;
  } catch (err: any) {
    if (err?.name === "PasswordException") {
      throw new PasswordRequired(err.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
    }
    throw err;
  }
}

/**
 * True when pdf.js holds edits that would change the file: new or modified
 * annotations, or form field values. Entering an edit mode registers the
 * existing annotations in the storage too, but those serialize to nothing.
 */
export function hasPendingEdits(pdf: PDFDocumentProxy): boolean {
  const storage = pdf.annotationStorage;
  if (storage.size === 0) return false;
  const serializable = storage.serializable as unknown as { map: Map<string, unknown> | null };
  return serializable.map !== null && serializable.map.size > 0;
}

export { pdfjs };
