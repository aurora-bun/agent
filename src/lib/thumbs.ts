import type { PDFDocumentProxy } from "pdfjs-dist";
import { AnnotationMode } from "./pdfjs";

/** Rendered thumbnails keyed by `${docKey}:${page}:${width}`. */
const cache = new Map<string, string>();
const MAX_CACHE = 600;

let running = 0;
const queue: Array<() => void> = [];
const MAX_CONCURRENT = 2;

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          running--;
          queue.shift()?.();
        });
    };
    if (running < MAX_CONCURRENT) run();
    else queue.push(run);
  });
}

export function thumbKey(docKey: string, pageNumber: number, width: number): string {
  return `${docKey}:${pageNumber}:${width}`;
}

export function cachedThumb(docKey: string, pageNumber: number, width: number): string | undefined {
  return cache.get(thumbKey(docKey, pageNumber, width));
}

export async function renderThumb(pdf: PDFDocumentProxy, pageNumber: number, width: number, docKey: string): Promise<string> {
  const key = thumbKey(docKey, pageNumber, width);
  const hit = cache.get(key);
  if (hit) return hit;
  return schedule(async () => {
    const again = cache.get(key);
    if (again) return again;
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (width / base.width) * dpr });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport, annotationMode: AnnotationMode.ENABLE_STORAGE }).promise;
    const url = canvas.toDataURL("image/jpeg", 0.82);
    canvas.width = canvas.height = 0;
    if (cache.size >= MAX_CACHE) {
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
    cache.set(key, url);
    return url;
  });
}

export function forgetThumbs(docKeyPrefix: string): void {
  for (const k of [...cache.keys()]) if (k.startsWith(docKeyPrefix)) cache.delete(k);
}
