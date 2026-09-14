/**
 * Structural PDF operations built on pdf-lib. Every function takes the
 * document bytes and returns new bytes; the caller reloads the viewer.
 */
import { PDFDocument, PDFFont, PDFHexString, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";

export type Bytes = Uint8Array;
export interface ImageInput {
  bytes: Bytes;
  mime: "image/png" | "image/jpeg";
}

async function load(bytes: Bytes): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
}

function save(doc: PDFDocument): Promise<Bytes> {
  return doc.save();
}

export function mimeFromName(name: string): ImageInput["mime"] | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return null;
}

/* ---------- page structure ---------- */

/** `order` lists the current page indices in their new sequence. */
export async function reorderPages(bytes: Bytes, order: number[]): Promise<Bytes> {
  const doc = await load(bytes);
  const pages = doc.getPages();
  if (order.length !== pages.length) throw new Error("Order must contain every page exactly once");
  // Detach all leaves then re-attach in the new order; this keeps every page
  // object (and the AcroForm that points at its widgets) intact.
  for (let i = pages.length - 1; i >= 0; i--) doc.removePage(i);
  for (const idx of order) doc.addPage(pages[idx]);
  return save(doc);
}

export async function deletePages(bytes: Bytes, indices: number[]): Promise<Bytes> {
  const doc = await load(bytes);
  const targets = [...new Set(indices)].sort((a, b) => b - a);
  if (targets.length >= doc.getPageCount()) throw new Error("A document must keep at least one page");
  for (const i of targets) doc.removePage(i);
  return save(doc);
}

export async function rotatePages(bytes: Bytes, indices: number[], delta: number): Promise<Bytes> {
  const doc = await load(bytes);
  for (const i of new Set(indices)) {
    const page = doc.getPage(i);
    const angle = (((page.getRotation().angle + delta) % 360) + 360) % 360;
    page.setRotation(degrees(angle));
  }
  return save(doc);
}

export async function extractPages(bytes: Bytes, indices: number[]): Promise<Bytes> {
  const src = await load(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return save(out);
}

export async function mergeDocuments(docs: Bytes[]): Promise<Bytes> {
  const out = await PDFDocument.create();
  for (const b of docs) {
    const src = await load(b);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return save(out);
}

/** Insert every page of `other` so that its first page lands at index `at`. */
export async function insertDocument(bytes: Bytes, other: Bytes, at: number): Promise<Bytes> {
  const doc = await load(bytes);
  const src = await load(other);
  const pages = await doc.copyPages(src, src.getPageIndices());
  pages.forEach((p, i) => doc.insertPage(at + i, p));
  return save(doc);
}

export async function insertBlankPage(bytes: Bytes, at: number): Promise<Bytes> {
  const doc = await load(bytes);
  const neighbour = doc.getPage(Math.min(Math.max(at - 1, 0), doc.getPageCount() - 1));
  const { width, height } = neighbour.getSize();
  const page = doc.insertPage(at, [width, height]);
  page.setRotation(neighbour.getRotation());
  return save(doc);
}

/* ---------- images ---------- */

const MAX_IMAGE_PAGE_SIDE = 1200; // points

async function addImagePage(doc: PDFDocument, img: ImageInput, at: number): Promise<void> {
  const image = img.mime === "image/png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
  let w = image.width * 0.75; // treat pixels as 96 dpi -> points
  let h = image.height * 0.75;
  const longest = Math.max(w, h);
  if (longest > MAX_IMAGE_PAGE_SIDE) {
    const f = MAX_IMAGE_PAGE_SIDE / longest;
    w *= f;
    h *= f;
  }
  const page = doc.insertPage(at, [w, h]);
  page.drawImage(image, { x: 0, y: 0, width: w, height: h });
}

export async function imagesToPdf(images: ImageInput[]): Promise<Bytes> {
  const doc = await PDFDocument.create();
  for (const img of images) await addImagePage(doc, img, doc.getPageCount());
  return save(doc);
}

export async function insertImagePages(bytes: Bytes, images: ImageInput[], at: number): Promise<Bytes> {
  const doc = await load(bytes);
  let i = at;
  for (const img of images) await addImagePage(doc, img, i++);
  return save(doc);
}

/* ---------- visual <-> user space ---------- */

function rotationOf(page: PDFPage): number {
  return ((page.getRotation().angle % 360) + 360) % 360;
}

/** Width/height of the page as displayed (rotation applied). */
export function visualSize(page: PDFPage): { vw: number; vh: number } {
  const box = page.getCropBox();
  return rotationOf(page) % 180 === 0 ? { vw: box.width, vh: box.height } : { vw: box.height, vh: box.width };
}

/**
 * Convert a point given in "visual" coordinates (origin at the bottom-left
 * of the page as displayed, y up) into PDF user-space coordinates.
 */
export function visualToUser(page: PDFPage, xv: number, yv: number): [number, number] {
  const box = page.getCropBox();
  switch (rotationOf(page)) {
    case 90:
      return [box.x + box.width - yv, box.y + xv];
    case 180:
      return [box.x + box.width - xv, box.y + box.height - yv];
    case 270:
      return [box.x + yv, box.y + box.height - xv];
    default:
      return [box.x + xv, box.y + yv];
  }
}

function drawVisualText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  size: number,
  xv: number,
  yv: number,
  extraRotation: number,
  color: [number, number, number],
  opacity = 1,
): void {
  const [x, y] = visualToUser(page, xv, yv);
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: rgb(color[0], color[1], color[2]),
    opacity,
    rotate: degrees(rotationOf(page) + extraRotation),
  });
}

/* ---------- page numbers & watermark ---------- */

export type NumberPosition =
  | "bottom-center"
  | "bottom-right"
  | "bottom-left"
  | "top-center"
  | "top-right"
  | "top-left";

export interface PageNumberOptions {
  position: NumberPosition;
  format: string; // "{n}" and "{total}" placeholders
  start: number;
  fontSize: number;
}

export async function addPageNumbers(bytes: Bytes, opts: PageNumberOptions): Promise<Bytes> {
  const doc = await load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const total = doc.getPageCount();
  const margin = 28;
  doc.getPages().forEach((page, i) => {
    const text = opts.format.replace(/\{n\}/g, String(i + opts.start)).replace(/\{total\}/g, String(total));
    const tw = font.widthOfTextAtSize(text, opts.fontSize);
    const { vw, vh } = visualSize(page);
    const [vAlign, hAlign] = opts.position.split("-");
    const xv = hAlign === "left" ? margin : hAlign === "right" ? vw - margin - tw : (vw - tw) / 2;
    const yv = vAlign === "top" ? vh - margin - opts.fontSize : margin;
    drawVisualText(page, font, text, opts.fontSize, xv, yv, 0, [0.2, 0.2, 0.2]);
  });
  return save(doc);
}

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  opacity: number;
  color: [number, number, number];
  diagonal: boolean;
}

export async function addWatermark(bytes: Bytes, opts: WatermarkOptions): Promise<Bytes> {
  const doc = await load(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const angle = opts.diagonal ? 45 : 0;
  const rad = (angle * Math.PI) / 180;
  for (const page of doc.getPages()) {
    const { vw, vh } = visualSize(page);
    let size = opts.fontSize;
    let tw = font.widthOfTextAtSize(opts.text, size);
    const maxWidth = (opts.diagonal ? Math.hypot(vw, vh) : vw) * 0.85;
    if (tw > maxWidth) {
      size = (size * maxWidth) / tw;
      tw = maxWidth;
    }
    // Centre the rotated text box on the page centre.
    const hx = tw / 2;
    const hy = size * 0.35;
    const xv = vw / 2 - (hx * Math.cos(rad) - hy * Math.sin(rad));
    const yv = vh / 2 - (hx * Math.sin(rad) + hy * Math.cos(rad));
    drawVisualText(page, font, opts.text, size, xv, yv, angle, opts.color, opts.opacity);
  }
  return save(doc);
}

/* ---------- sticky notes ---------- */

function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Add a classic "sticky note" (Text annotation with a popup) whose icon's
 * top-left corner sits at user-space (x, y).
 */
export async function addStickyNote(
  bytes: Bytes,
  pageIndex: number,
  x: number,
  y: number,
  text: string,
  author: string,
  color: [number, number, number] = [1, 0.82, 0.2],
): Promise<Bytes> {
  const doc = await load(bytes);
  const page = doc.getPage(pageIndex);
  const ctx = doc.context;
  const size = 20;
  const noteRef = ctx.nextRef();
  const popupRef = ctx.nextRef();
  const date = PDFHexString.fromText(pdfDate(new Date()));
  const note = ctx.obj({
    Type: "Annot",
    Subtype: "Text",
    Rect: [x, y - size, x + size, y],
    Contents: PDFHexString.fromText(text),
    T: PDFHexString.fromText(author),
    NM: PDFHexString.fromText(`folio-${Date.now().toString(36)}`),
    Name: "Comment",
    C: color,
    CA: 1,
    F: 4,
    M: date,
    CreationDate: date,
    Open: false,
    Popup: popupRef,
  });
  const popup = ctx.obj({
    Type: "Annot",
    Subtype: "Popup",
    Rect: [x + size + 4, y - 140, x + size + 204, y],
    Parent: noteRef,
    Open: false,
    F: 28,
  });
  ctx.assign(noteRef, note);
  ctx.assign(popupRef, popup);
  page.node.addAnnot(noteRef);
  page.node.addAnnot(popupRef);
  return save(doc);
}

/* ---------- info ---------- */

export async function pageSizes(bytes: Bytes): Promise<Array<{ width: number; height: number; rotation: number }>> {
  const doc = await load(bytes);
  return doc.getPages().map((p) => {
    const { vw, vh } = visualSize(p);
    return { width: vw, height: vh, rotation: rotationOf(p) };
  });
}
