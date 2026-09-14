import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import { AnnotationEditorType, IMAGE_RESOURCES_PATH, hasPendingEdits } from "../lib/pdfjs";
import { addStickyNote } from "../lib/pdfops";
import { applyPageOp } from "../app/actions";
import { applyTool, getViewer, registerViewer, unregisterViewer, zoomIn, zoomOut, type EditorUIManager } from "../app/viewers";
import { askText, useApp, type DocTab } from "../store";

export const HIGHLIGHT_COLORS = "yellow=#FFFF98,green=#53FFBC,blue=#80EBFF,pink=#FFCBE6,red=#FF4F5F";

const AUTHOR_KEY = "folio.author";
export function noteAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) || "Folio user";
  } catch {
    return "Folio user";
  }
}

interface Props {
  tab: DocTab;
  active: boolean;
}

export function Viewer({ tab, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabId = tab.id;
  const pdf = tab.pdf;

  // Create the pdf.js viewer once per tab.
  useEffect(() => {
    const container = containerRef.current!;
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus, externalLinkTarget: 2 });
    const findController = new PDFFindController({ eventBus, linkService, updateMatchesCountOnProgress: true });
    // `enableHighlightFloatingButton` is honoured by the viewer but missing
    // from its type definitions, hence the non-literal options object.
    const options: ConstructorParameters<typeof PDFViewer>[0] & { enableHighlightFloatingButton: boolean } = {
      container,
      eventBus,
      linkService,
      findController,
      annotationEditorMode: AnnotationEditorType.NONE,
      annotationEditorHighlightColors: HIGHLIGHT_COLORS,
      enableHighlightFloatingButton: true,
      imageResourcesPath: IMAGE_RESOURCES_PATH,
    };
    const viewer = new PDFViewer(options);
    linkService.setViewer(viewer);

    const { updateTab } = useApp.getState();
    eventBus.on("pagechanging", (e: { pageNumber: number }) => updateTab(tabId, { currentPage: e.pageNumber }));
    eventBus.on("scalechanging", (e: { scale: number; presetValue?: string }) =>
      updateTab(tabId, { scale: e.scale, scaleValue: e.presetValue ?? String(e.scale) }),
    );
    eventBus.on("rotationchanging", (e: { pagesRotation: number }) => updateTab(tabId, { rotation: e.pagesRotation }));
    // Only a user action (something undoable) makes the document dirty;
    // entering an edit mode also reports existing annotations as editors.
    eventBus.on("editingstateschanged", (e: { details: { hasSomethingToUndo?: boolean } }) => {
      if (e.details.hasSomethingToUndo === true) updateTab(tabId, { dirty: true });
    });

    const handle = { viewer, eventBus, linkService, findController, container, uiManager: null as EditorUIManager | null };
    eventBus.on("annotationeditoruimanager", (e: { uiManager: EditorUIManager }) => {
      handle.uiManager = e.uiManager;
    });
    registerViewer(tabId, handle);

    // Ctrl+wheel zooms the document instead of the WebView.
    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheel < 60 || useApp.getState().activeId !== tabId) return;
      lastWheel = now;
      if (e.deltaY < 0) zoomIn();
      else if (e.deltaY > 0) zoomOut();
    };
    container.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", onWheel);
      unregisterViewer(tabId);
      viewer.setDocument(null as unknown as PDFDocumentProxy);
    };
  }, [tabId]);

  // Bind (or re-bind after an edit) the loaded document.
  useEffect(() => {
    const h = getViewer(tabId);
    if (!h || !pdf) return;
    h.uiManager = null; // pdf.js creates a fresh manager for every document
    h.viewer.setDocument(pdf);
    h.linkService.setDocument(pdf, null);
    h.findController.setDocument(pdf);
    (pdf.annotationStorage as unknown as { onSetModified: (() => void) | null }).onSetModified = () => {
      if (hasPendingEdits(pdf)) useApp.getState().updateTab(tabId, { dirty: true });
    };

    const onInit = () => {
      const s = useApp.getState();
      const t = s.tabs.find((x) => x.id === tabId);
      if (!t) return;
      h.viewer.currentScaleValue = t.scaleValue || "auto";
      if (t.rotation) h.viewer.pagesRotation = t.rotation;
      if (t.restorePage) {
        h.viewer.currentPageNumber = t.restorePage;
        s.updateTab(tabId, { restorePage: null });
      }
      if (s.activeId === tabId) applyTool(tabId, s.tool);
    };
    h.eventBus.on("pagesinit", onInit, { once: true });
    return () => {
      h.eventBus.off("pagesinit", onInit);
      h.viewer.setDocument(null as unknown as PDFDocumentProxy);
    };
  }, [tabId, pdf]);

  // Click-to-place sticky notes.
  useEffect(() => {
    const container = containerRef.current!;
    const onClick = async (e: MouseEvent) => {
      const s = useApp.getState();
      if (s.placing !== "note" || s.activeId !== tabId) return;
      const pageEl = (e.target as HTMLElement).closest(".page") as HTMLElement | null;
      if (!pageEl) return;
      const pageNumber = Number(pageEl.dataset.pageNumber);
      const h = getViewer(tabId);
      const pv = h?.viewer.getPageView(pageNumber - 1);
      if (!pv) return;
      const inner = (pageEl.querySelector(".canvasWrapper") as HTMLElement | null) ?? pageEl;
      const rect = inner.getBoundingClientRect();
      const [px, py] = pv.viewport.convertToPdfPoint(e.clientX - rect.left, e.clientY - rect.top) as [number, number];
      const text = await askText("Add sticky note", "Note text", "", true);
      if (!text || !text.trim()) return;
      await applyPageOp(
        tabId,
        "Adding note…",
        (b) => addStickyNote(b, pageNumber - 1, px, py, text.trim(), noteAuthor()),
        pageNumber,
      );
      useApp.getState().setTool("select");
    };
    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [tabId]);

  return (
    <div className={"viewerHost" + (active ? "" : " viewerHost--hidden")}>
      <div ref={containerRef} className="pdfViewerContainer" tabIndex={-1}>
        <div className="pdfViewer" />
      </div>
      {tab.loading && (
        <div className="viewerOverlay">
          <div className="spinner" />
          <span>Opening {tab.name}…</span>
        </div>
      )}
      {tab.error && (
        <div className="viewerOverlay viewerOverlay--error">
          <strong>Could not open this file</strong>
          <span>{tab.error}</span>
        </div>
      )}
    </div>
  );
}
