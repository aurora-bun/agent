/**
 * Document-level actions: open, save, close, print, export and the shared
 * "commit edits -> transform bytes -> reload" pipeline used by page tools.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AnnotationEditorType, AnnotationMode, hasPendingEdits, loadPdf, PasswordRequired } from "../lib/pdfjs";
import * as files from "../lib/tauri";
import * as ops from "../lib/pdfops";
import { askPassword, destroyLater, useApp, type DocTab } from "../store";
import { applyTool, currentEditorMode, getViewer, setEditorMode } from "./viewers";

let seq = 0;
const newId = () => `doc-${Date.now().toString(36)}-${++seq}`;

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function getTab(id: string): DocTab | undefined {
  return useApp.getState().tabs.find((t) => t.id === id);
}

/* ---------- opening ---------- */

export async function openPaths(paths: string[]): Promise<void> {
  const pdfs = paths.filter((p) => /\.pdf$/i.test(p));
  const images = paths.filter((p) => ops.mimeFromName(p));
  for (const p of pdfs) await openPath(p);
  if (images.length) await createPdfFromImages(images);
  if (!pdfs.length && !images.length && paths.length) {
    useApp.getState().toast("Only PDF, PNG and JPEG files can be opened", "error");
  }
}

export async function openPath(path: string): Promise<void> {
  const s = useApp.getState();
  const existing = s.tabs.find((t) => t.path === path);
  if (existing) {
    s.setActive(existing.id);
    return;
  }
  try {
    const bytes = await files.readBytes(path);
    const id = await openBytes(bytes, files.baseName(path), path);
    if (id) s.addRecent(path);
  } catch (err) {
    s.toast(`Could not open ${files.baseName(path)}: ${errorText(err)}`, "error");
    if (/not found|cannot find|No such file/i.test(errorText(err))) s.removeRecent(path);
  }
}

export async function openFileDialog(): Promise<void> {
  const paths = await files.pickPdfs(true);
  await openPaths(paths);
}

async function isEncrypted(pdf: PDFDocumentProxy): Promise<boolean> {
  try {
    const { info } = await pdf.getMetadata();
    return !!(info as { EncryptFilterName?: string | null }).EncryptFilterName;
  } catch {
    return false;
  }
}

async function loadWithPassword(
  bytes: Uint8Array,
  name: string,
  password: string | null,
): Promise<{ pdf: PDFDocumentProxy; password: string | null; encrypted: boolean } | null> {
  let pw = password ?? undefined;
  for (;;) {
    try {
      const pdf = await loadPdf(bytes, pw);
      return { pdf, password: pw ?? null, encrypted: await isEncrypted(pdf) };
    } catch (err) {
      if (err instanceof PasswordRequired) {
        const entered = await askPassword(name, err.wrong);
        if (entered === null) return null;
        pw = entered;
        continue;
      }
      throw err;
    }
  }
}

/** Open in-memory PDF bytes as a new tab. Returns the tab id, or null if cancelled. */
export async function openBytes(bytes: Uint8Array, name: string, path: string | null): Promise<string | null> {
  const s = useApp.getState();
  const id = newId();
  const tab: DocTab = {
    id,
    path,
    name,
    bytes,
    pdf: null,
    password: null,
    encrypted: false,
    version: 0,
    pageCount: 0,
    currentPage: 1,
    restorePage: null,
    scaleValue: "auto",
    scale: 1,
    rotation: 0,
    dirty: path === null,
    loading: true,
    error: null,
  };
  s.addTab(tab);
  s.setActive(id);
  try {
    const loaded = await loadWithPassword(bytes, name, null);
    if (!loaded) {
      s.removeTab(id);
      return null;
    }
    s.updateTab(id, {
      pdf: loaded.pdf,
      password: loaded.password,
      encrypted: loaded.encrypted,
      pageCount: loaded.pdf.numPages,
      loading: false,
    });
    return id;
  } catch (err) {
    s.updateTab(id, { loading: false, error: errorText(err) });
    return id;
  }
}

/* ---------- edit pipeline ---------- */

/** Replace a tab's bytes and reload its pdf.js document, keeping the page. */
export async function reloadTab(id: string, bytes: Uint8Array, opts: { dirty?: boolean; page?: number } = {}): Promise<void> {
  const t = getTab(id);
  if (!t) return;
  const loaded = await loadWithPassword(bytes, t.name, t.password);
  if (!loaded) return;
  if (t.pdf) destroyLater(t.pdf);
  useApp.getState().updateTab(id, {
    bytes,
    pdf: loaded.pdf,
    password: loaded.password,
    encrypted: loaded.encrypted,
    version: t.version + 1,
    pageCount: loaded.pdf.numPages,
    restorePage: Math.min(opts.page ?? t.currentPage, loaded.pdf.numPages),
    dirty: opts.dirty ?? true,
    error: null,
  });
}

/**
 * Bake pending pdf.js edits (annotations, form values) into the document
 * bytes. Returns the up-to-date bytes; reloads the viewer when needed.
 */
export async function commitEdits(id: string): Promise<Uint8Array> {
  const t = getTab(id);
  if (!t || !t.pdf) throw new Error("Document is not loaded");
  // Leaving edit mode commits any editor that is still being typed/drawn.
  const h = getViewer(id);
  const left = currentEditorMode(h) > AnnotationEditorType.NONE && setEditorMode(h, AnnotationEditorType.NONE);
  if (left) await new Promise((r) => setTimeout(r, 30));
  if (!hasPendingEdits(t.pdf)) {
    // Nothing to bake: put the viewer back into the tool the user had.
    if (left) applyTool(id, useApp.getState().tool);
    return t.bytes;
  }
  const bytes = await t.pdf.saveDocument();
  await reloadTab(id, bytes, { dirty: true }); // the reload re-applies the tool
  return bytes;
}

export const ENCRYPTED_MESSAGE =
  "This document is encrypted, so its pages cannot be rebuilt. Comments and form filling still work; to edit pages, remove the password in the application that set it.";

/** pdf-lib cannot re-encrypt, so structural edits are refused on encrypted files. */
export function guardEncrypted(id: string): boolean {
  const t = getTab(id);
  if (t?.encrypted) {
    useApp.getState().toast(ENCRYPTED_MESSAGE, "error");
    return false;
  }
  return true;
}

/** Run a bytes -> bytes transformation on a tab with a busy overlay. */
export async function applyPageOp(
  id: string,
  label: string,
  op: (bytes: Uint8Array) => Promise<Uint8Array>,
  page?: number,
): Promise<boolean> {
  if (!guardEncrypted(id)) return false;
  const s = useApp.getState();
  s.setBusy(label);
  try {
    const bytes = await commitEdits(id);
    const out = await op(bytes);
    await reloadTab(id, out, { dirty: true, page });
    return true;
  } catch (err) {
    s.toast(errorText(err), "error");
    return false;
  } finally {
    useApp.getState().setBusy(null);
  }
}

/* ---------- save / close ---------- */

export async function saveTab(id: string, saveAs = false): Promise<boolean> {
  const t = getTab(id);
  if (!t || !t.pdf) return false;
  const s = useApp.getState();
  let path = t.path;
  if (saveAs || !path) {
    path = await files.pickSavePath(t.path ?? t.name);
    if (!path) return false;
    if (!/\.pdf$/i.test(path)) path += ".pdf";
  }
  s.setBusy("Saving…");
  try {
    const bytes = await commitEdits(id);
    await files.writeBytes(path, bytes);
    s.updateTab(id, { path, name: files.baseName(path), dirty: false });
    s.addRecent(path);
    s.toast(`Saved ${files.baseName(path)}`);
    return true;
  } catch (err) {
    s.toast(`Save failed: ${errorText(err)}`, "error");
    return false;
  } finally {
    useApp.getState().setBusy(null);
  }
}

export async function closeTab(id: string): Promise<boolean> {
  const t = getTab(id);
  if (!t) return true;
  if (t.dirty && t.pdf) {
    const ok = await files.confirmDialog(`"${t.name}" has unsaved changes.\n\nClose without saving?`);
    if (!ok) return false;
  }
  useApp.getState().removeTab(id);
  return true;
}

/** Save a copy of the given bytes through a save dialog. */
export async function saveBytesAs(bytes: Uint8Array, suggestedName: string): Promise<string | null> {
  let path = await files.pickSavePath(suggestedName);
  if (!path) return null;
  if (!/\.pdf$/i.test(path)) path += ".pdf";
  await files.writeBytes(path, bytes);
  useApp.getState().addRecent(path);
  return path;
}

/* ---------- rendering helpers ---------- */

export async function renderPageToCanvas(pdf: PDFDocumentProxy, pageNumber: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({
    canvas,
    viewport,
    intent: "print",
    annotationMode: AnnotationMode.ENABLE_STORAGE,
  }).promise;
  page.cleanup();
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), mime, quality);
  });
}

/* ---------- print ---------- */

/**
 * Render every page into a hidden ".printSheet" element at the end of the
 * body. Print CSS hides the application and shows only the sheet, so the
 * platform's own `window.print()` prints the document on every engine.
 */
export async function preparePrintSheet(id: string): Promise<HTMLElement> {
  const t = getTab(id);
  if (!t?.pdf) throw new Error("Document is not loaded");
  const pdf = t.pdf;
  const sheet = document.createElement("div");
  sheet.className = "printSheet";
  sheet.setAttribute("aria-hidden", "true");
  const images: HTMLImageElement[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    useApp.getState().setBusy(`Preparing page ${i} of ${pdf.numPages}…`);
    const canvas = await renderPageToCanvas(pdf, i, 150 / 72);
    const img = new Image();
    img.src = canvas.toDataURL("image/jpeg", 0.92);
    canvas.width = canvas.height = 0;
    const page = document.createElement("div");
    page.className = "printSheet__page" + (img.naturalWidth > img.naturalHeight ? " printSheet__page--landscape" : "");
    page.append(img);
    sheet.append(page);
    images.push(img);
  }
  await Promise.all(images.map((img) => img.decode().catch(() => {})));
  for (const img of images) {
    if (img.naturalWidth > img.naturalHeight) img.parentElement?.classList.add("printSheet__page--landscape");
  }
  document.querySelector(".printSheet")?.remove();
  document.body.append(sheet);
  return sheet;
}

export async function printTab(id: string): Promise<void> {
  const s = useApp.getState();
  if (!getTab(id)?.pdf) return;
  s.setBusy("Preparing to print…");
  try {
    await commitEdits(id);
    const sheet = await preparePrintSheet(id);
    useApp.getState().setBusy(null);
    const cleanup = () => {
      sheet.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(cleanup, 5 * 60 * 1000); // engines that never fire afterprint
  } catch (err) {
    s.toast(`Print failed: ${errorText(err)}`, "error");
  } finally {
    useApp.getState().setBusy(null);
  }
}

/* ---------- convert ---------- */

export async function exportPagesAsImages(id: string, format: "png" | "jpeg", dpi: number): Promise<void> {
  const s = useApp.getState();
  const t0 = getTab(id);
  if (!t0?.pdf) return;
  const folder = await files.pickFolder("Choose a folder for the images");
  if (!folder) return;
  s.setBusy("Exporting pages…");
  try {
    await commitEdits(id);
    const t = getTab(id)!;
    const pdf = t.pdf!;
    const stem = files.stripExt(t.name);
    const pad = String(pdf.numPages).length;
    for (let i = 1; i <= pdf.numPages; i++) {
      useApp.getState().setBusy(`Exporting page ${i} of ${pdf.numPages}…`);
      const canvas = await renderPageToCanvas(pdf, i, dpi / 72);
      const blob = await canvasToBlob(canvas, format === "png" ? "image/png" : "image/jpeg", 0.92);
      canvas.width = canvas.height = 0;
      const name = `${stem}-${String(i).padStart(pad, "0")}.${format === "png" ? "png" : "jpg"}`;
      await files.writeBytes(files.joinPath(folder, name), new Uint8Array(await blob.arrayBuffer()));
    }
    s.toast(`Exported ${pdf.numPages} image${pdf.numPages === 1 ? "" : "s"}`);
  } catch (err) {
    s.toast(`Export failed: ${errorText(err)}`, "error");
  } finally {
    useApp.getState().setBusy(null);
  }
}

async function readImages(paths: string[]): Promise<ops.ImageInput[]> {
  const out: ops.ImageInput[] = [];
  for (const p of paths) {
    const mime = ops.mimeFromName(p);
    if (!mime) continue;
    out.push({ bytes: await files.readBytes(p), mime });
  }
  return out;
}

export async function createPdfFromImages(paths?: string[]): Promise<void> {
  const s = useApp.getState();
  const chosen = paths ?? (await files.pickImages());
  if (!chosen.length) return;
  s.setBusy("Creating PDF…");
  try {
    const images = await readImages(chosen);
    if (!images.length) throw new Error("No PNG or JPEG images selected");
    const bytes = await ops.imagesToPdf(images);
    const name = chosen.length === 1 ? files.stripExt(files.baseName(chosen[0])) + ".pdf" : "Images.pdf";
    await openBytes(bytes, name, null);
  } catch (err) {
    s.toast(`Could not create PDF: ${errorText(err)}`, "error");
  } finally {
    useApp.getState().setBusy(null);
  }
}

export async function insertImagesIntoTab(id: string, at: number): Promise<void> {
  const chosen = await files.pickImages();
  if (!chosen.length) return;
  const images = await readImages(chosen);
  if (!images.length) return;
  await applyPageOp(id, "Inserting images…", (b) => ops.insertImagePages(b, images, at), at + 1);
}

export async function insertPdfIntoTab(id: string, at: number): Promise<void> {
  const [path] = await files.pickPdfs(false);
  if (!path) return;
  const other = await files.readBytes(path);
  await applyPageOp(id, "Inserting pages…", (b) => ops.insertDocument(b, other, at), at + 1);
}

export async function combinePaths(paths: string[]): Promise<void> {
  const s = useApp.getState();
  if (paths.length < 1) return;
  s.setBusy("Combining files…");
  try {
    const docs: Uint8Array[] = [];
    for (const p of paths) docs.push(await files.readBytes(p));
    const bytes = await ops.mergeDocuments(docs);
    await openBytes(bytes, "Combined.pdf", null);
  } catch (err) {
    s.toast(`Combine failed: ${errorText(err)}. Encrypted files cannot be combined.`, "error");
  } finally {
    useApp.getState().setBusy(null);
  }
}

export async function extractPagesToFile(id: string, indices: number[]): Promise<void> {
  const s = useApp.getState();
  const t0 = getTab(id);
  if (!t0?.pdf || !indices.length || !guardEncrypted(id)) return;
  s.setBusy("Extracting pages…");
  try {
    const bytes = await commitEdits(id);
    const t = getTab(id)!;
    const out = await ops.extractPages(bytes, indices);
    useApp.getState().setBusy(null);
    const suggested = `${files.stripExt(t.name)}-pages.pdf`;
    const path = await saveBytesAs(out, suggested);
    if (path) s.toast(`Saved ${files.baseName(path)}`);
  } catch (err) {
    s.toast(`Extract failed: ${errorText(err)}`, "error");
  } finally {
    useApp.getState().setBusy(null);
  }
}

/** Split the document into one file per page range chunk of `every` pages. */
export async function splitToFiles(id: string, every: number): Promise<void> {
  const s = useApp.getState();
  const t0 = getTab(id);
  if (!t0?.pdf || !guardEncrypted(id)) return;
  const folder = await files.pickFolder("Choose a folder for the split files");
  if (!folder) return;
  s.setBusy("Splitting…");
  try {
    const bytes = await commitEdits(id);
    const t = getTab(id)!;
    const count = t.pdf!.numPages;
    const stem = files.stripExt(t.name);
    let part = 1;
    for (let start = 0; start < count; start += every, part++) {
      const indices = Array.from({ length: Math.min(every, count - start) }, (_, k) => start + k);
      const out = await ops.extractPages(bytes, indices);
      await files.writeBytes(files.joinPath(folder, `${stem}-part${part}.pdf`), out);
    }
    s.toast(`Split into ${part - 1} files`);
  } catch (err) {
    s.toast(`Split failed: ${errorText(err)}`, "error");
  } finally {
    useApp.getState().setBusy(null);
  }
}

/* ---------- document info ---------- */

export async function showDocumentProperties(id: string): Promise<void> {
  const t = getTab(id);
  if (!t?.pdf) return;
  const s = useApp.getState();
  try {
    const meta = await t.pdf.getMetadata();
    const info = (meta.info ?? {}) as Record<string, unknown>;
    const page = await t.pdf.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const fmt = (v: unknown) => (v == null || v === "" ? "—" : String(v));
    const mm = (pt: number) => `${(pt * 0.3528).toFixed(0)} mm`;
    const inch = (pt: number) => `${(pt / 72).toFixed(2)} in`;
    s.setModal({
      kind: "info",
      title: "Document properties",
      rows: [
        ["File name", t.name],
        ["Location", t.path ?? "(unsaved)"],
        ["File size", `${(t.bytes.length / 1024).toFixed(1)} KB`],
        ["Title", fmt(info.Title)],
        ["Author", fmt(info.Author)],
        ["Subject", fmt(info.Subject)],
        ["Creator", fmt(info.Creator)],
        ["Producer", fmt(info.Producer)],
        ["Created", fmt(info.CreationDate)],
        ["Modified", fmt(info.ModDate)],
        ["PDF version", fmt(info.PDFFormatVersion)],
        ["Pages", String(t.pdf.numPages)],
        ["Page size", `${mm(vp.width)} × ${mm(vp.height)} (${inch(vp.width)} × ${inch(vp.height)})`],
        ["Encrypted", t.encrypted ? (t.password ? "Yes (password)" : "Yes") : "No"],
      ],
    });
  } catch (err) {
    s.toast(errorText(err), "error");
  }
}
