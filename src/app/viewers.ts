/**
 * Registry of the live pdf.js viewer instances, one per document tab.
 * They live outside the store because they are big, mutable objects.
 */
import type { EventBus, PDFFindController, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import { AnnotationEditorType } from "../lib/pdfjs";
import { useApp, type Tool } from "../store";

export interface ViewerHandle {
  viewer: PDFViewer;
  eventBus: EventBus;
  linkService: PDFLinkService;
  findController: PDFFindController;
  container: HTMLDivElement;
  /** pdf.js AnnotationEditorUIManager, available once a document is set. */
  uiManager: EditorUIManager | null;
}

/** The subset of pdf.js's (untyped) AnnotationEditorUIManager we call. */
export interface EditorUIManager {
  undo(): void;
  redo(): void;
  delete(): void;
  selectAll(): void;
  unselectAll(): void;
  hasSelection: boolean;
  currentLayer: EditorLayer | null;
}

/** The subset of pdf.js's AnnotationEditorLayer we call. */
export interface EditorLayer {
  div: HTMLDivElement;
  /** Unrotated page size in PDF points. */
  pageDimensions: [number, number];
  createAndAddNewEditor(
    event: { offsetX: number; offsetY: number },
    isCentered: boolean,
    data: Record<string, unknown>,
  ): { width: number | null; height: number | null } | null;
}

const handles = new Map<string, ViewerHandle>();

export function registerViewer(id: string, h: ViewerHandle): void {
  handles.set(id, h);
}

export function unregisterViewer(id: string): void {
  handles.delete(id);
}

export function getViewer(id: string | null | undefined): ViewerHandle | undefined {
  return id ? handles.get(id) : undefined;
}

export function activeViewer(): ViewerHandle | undefined {
  return getViewer(useApp.getState().activeId);
}

/* ---------- navigation & zoom ---------- */

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8];

export function goToPage(n: number): void {
  const h = activeViewer();
  if (!h) return;
  const clamped = Math.max(1, Math.min(h.viewer.pagesCount, Math.round(n)));
  h.viewer.currentPageNumber = clamped;
}

export function nextPage(): void {
  activeViewer()?.viewer.nextPage();
}

export function previousPage(): void {
  activeViewer()?.viewer.previousPage();
}

export function setScaleValue(value: string): void {
  const h = activeViewer();
  if (!h) return;
  h.viewer.currentScaleValue = value;
}

export function zoomIn(): void {
  const h = activeViewer();
  if (!h) return;
  const cur = h.viewer.currentScale;
  const next = ZOOM_STEPS.find((s) => s > cur + 0.001);
  h.viewer.currentScale = next ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
}

export function zoomOut(): void {
  const h = activeViewer();
  if (!h) return;
  const cur = h.viewer.currentScale;
  const prev = [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.001);
  h.viewer.currentScale = prev ?? ZOOM_STEPS[0];
}

export function rotateView(delta: number): void {
  const h = activeViewer();
  if (!h) return;
  h.viewer.pagesRotation = (h.viewer.pagesRotation + delta + 360) % 360;
}

/* ---------- annotation editing ---------- */

const TOOL_MODES: Record<Tool, number> = {
  select: AnnotationEditorType.NONE,
  highlight: AnnotationEditorType.HIGHLIGHT,
  ink: AnnotationEditorType.INK,
  text: AnnotationEditorType.FREETEXT,
  note: AnnotationEditorType.NONE,
  image: AnnotationEditorType.STAMP,
};

/**
 * Switch the pdf.js editor mode. The editor manager only exists once pdf.js
 * has loaded the first page of the current document (the Viewer re-applies
 * the tool on "pagesinit" for that case), so this is a best-effort call.
 */
/** Current pdf.js editor mode (the getter returns a bare number despite its typings). */
export function currentEditorMode(h: ViewerHandle | undefined): number {
  if (!h) return AnnotationEditorType.DISABLE;
  const cur = h.viewer.annotationEditorMode as unknown as number | { mode: number };
  return typeof cur === "number" ? cur : cur.mode;
}

export function setEditorMode(h: ViewerHandle | undefined, mode: number): boolean {
  if (!h || !h.viewer.pdfDocument || !h.uiManager) return false;
  if (currentEditorMode(h) === mode) return true;
  try {
    h.viewer.annotationEditorMode = { mode };
    return true;
  } catch {
    return false;
  }
}

export function applyTool(id: string | null | undefined, tool: Tool): void {
  setEditorMode(getViewer(id), TOOL_MODES[tool]);
}

export function setEditorParam(type: number, value: unknown): void {
  const h = activeViewer();
  if (!h) return;
  h.eventBus.dispatch("switchannotationeditorparams", { source: null, type, value });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

/**
 * Drop an image (data URL) onto the visible part of the current page as a
 * movable, resizable stamp, `targetWidthPt` points wide.
 */
export async function addImageStamp(dataUrl: string, targetWidthPt = 180): Promise<boolean> {
  const h = activeViewer();
  if (!h || !setEditorMode(h, AnnotationEditorType.STAMP)) return false;
  // The mode switch is applied asynchronously inside pdf.js; give it a tick.
  await new Promise((r) => setTimeout(r, 60));
  const layer = h.uiManager?.currentLayer;
  if (!layer) return false;
  const img = await loadImage(dataUrl);
  const [pageW, pageH] = layer.pageDimensions;
  const width = Math.min(targetWidthPt, pageW * 0.6);
  const height = (width * img.naturalHeight) / img.naturalWidth;
  // Centre of the part of the page that is currently on screen.
  const lr = layer.div.getBoundingClientRect();
  const cr = h.container.getBoundingClientRect();
  const cx = (Math.max(lr.left, cr.left) + Math.min(lr.right, cr.right)) / 2 - lr.left;
  const cy = (Math.max(lr.top, cr.top) + Math.min(lr.bottom, cr.bottom)) / 2 - lr.top;
  const editor = layer.createAndAddNewEditor({ offsetX: cx, offsetY: cy }, true, { bitmapUrl: dataUrl });
  if (!editor) return false;
  // pdf.js sizes a stamp from its bitmap unless a size is already set.
  editor.width = width / pageW;
  editor.height = height / pageH;
  return true;
}

export function editorUndo(): void {
  activeViewer()?.uiManager?.undo();
}

export function editorRedo(): void {
  activeViewer()?.uiManager?.redo();
}

export function editorDeleteSelection(): void {
  activeViewer()?.uiManager?.delete();
}

/* ---------- find ---------- */

export interface FindOptions {
  caseSensitive: boolean;
  entireWord: boolean;
  highlightAll: boolean;
}

export function find(query: string, opts: FindOptions, type: "" | "again" = "", findPrevious = false): void {
  const h = activeViewer();
  if (!h) return;
  h.eventBus.dispatch("find", {
    source: null,
    type,
    query,
    caseSensitive: opts.caseSensitive,
    entireWord: opts.entireWord,
    highlightAll: opts.highlightAll,
    findPrevious,
    matchDiacritics: false,
  });
}

export function clearFind(): void {
  const h = activeViewer();
  if (!h) return;
  h.eventBus.dispatch("findbarclose", { source: null });
}
