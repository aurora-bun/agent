import { open, save, ask, message } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** False when the UI runs in a plain browser (Vite dev server without Tauri). */
export const isTauri = "__TAURI_INTERNALS__" in window;

export const PDF_FILTER = [{ name: "PDF Document", extensions: ["pdf"] }];
export const IMAGE_FILTER = [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }];

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i >= 0 ? path.slice(0, i) : "";
}

export function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export async function pickPdfs(multiple = true): Promise<string[]> {
  const r = await open({ multiple, filters: PDF_FILTER, title: "Open PDF" });
  if (!r) return [];
  return Array.isArray(r) ? r : [r];
}

export async function pickImages(): Promise<string[]> {
  const r = await open({ multiple: true, filters: IMAGE_FILTER, title: "Select images" });
  if (!r) return [];
  return Array.isArray(r) ? r : [r];
}

export async function pickFolder(title = "Select folder"): Promise<string | null> {
  const r = await open({ directory: true, multiple: false, title });
  return typeof r === "string" ? r : null;
}

export async function pickSavePath(defaultPath: string, filters = PDF_FILTER): Promise<string | null> {
  return save({ defaultPath, filters, title: "Save as" });
}


export async function readBytes(path: string): Promise<Uint8Array> {
  if (import.meta.env.DEV && !isTauri) {
    // Plain-browser development (Vite only): serve project files through /@fs/.
    const res = await fetch("/@fs/" + path.replace(/\\/g, "/"));
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  return readFile(path);
}

export async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  await writeFile(path, bytes);
}

export async function ensureDir(path: string): Promise<void> {
  if (!(await exists(path))) await mkdir(path, { recursive: true });
}

export async function confirmDialog(text: string, title = "Folio PDF"): Promise<boolean> {
  return ask(text, { title, kind: "warning" });
}

export async function errorDialog(text: string, title = "Folio PDF"): Promise<void> {
  await message(text, { title, kind: "error" });
}

export async function launchArgs(): Promise<string[]> {
  try {
    return await invoke<string[]>("launch_args");
  } catch {
    return [];
  }
}

/** Files forwarded from a second app instance (single-instance plugin). */
export function onOpenFiles(cb: (paths: string[]) => void): () => void {
  if (!isTauri) return () => {};
  let unlisten: (() => void) | null = null;
  listen<string[]>("open-files", (e) => cb(e.payload)).then((u) => (unlisten = u));
  return () => unlisten?.();
}

/** Native drag-and-drop of files onto the window. */
export function onFileDrop(cb: (paths: string[]) => void, onHover?: (hovering: boolean) => void): () => void {
  if (!isTauri) return () => {};
  let unlisten: (() => void) | null = null;
  getCurrentWebview()
    .onDragDropEvent((e) => {
      if (e.payload.type === "drop") {
        onHover?.(false);
        cb(e.payload.paths);
      } else if (e.payload.type === "enter" || e.payload.type === "over") {
        onHover?.(true);
      } else {
        onHover?.(false);
      }
    })
    .then((u) => (unlisten = u));
  return () => unlisten?.();
}

export function setWindowTitle(title: string): void {
  document.title = title;
  if (isTauri) getCurrentWindow().setTitle(title).catch(() => {});
}

export function closeWindow(): void {
  if (isTauri) getCurrentWindow().close().catch(() => {});
  else window.close();
}

/* ---------- custom title bar ---------- */

export function minimizeWindow(): void {
  if (isTauri) getCurrentWindow().minimize().catch(() => {});
}

export function toggleMaximizeWindow(): void {
  if (isTauri) getCurrentWindow().toggleMaximize().catch(() => {});
}

/** Whether the OS draws the title bar (then the in-app window buttons are hidden). */
export async function windowIsDecorated(): Promise<boolean> {
  if (!isTauri) return true;
  try {
    return await getCurrentWindow().isDecorated();
  } catch {
    return true;
  }
}

/** Track the maximized state; returns an unsubscribe function. */
export function onMaximizedChange(cb: (maximized: boolean) => void): () => void {
  if (!isTauri) return () => {};
  const w = getCurrentWindow();
  let off: (() => void) | null = null;
  const refresh = () => w.isMaximized().then(cb).catch(() => {});
  refresh();
  w.onResized(refresh)
    .then((u) => (off = u))
    .catch(() => {});
  return () => off?.();
}

/** Ask before the window closes with unsaved work; returns an unsubscribe function. */
export function onCloseRequested(shouldClose: () => Promise<boolean>): () => void {
  if (!isTauri) return () => {};
  let off: (() => void) | null = null;
  getCurrentWindow()
    .onCloseRequested(async (e) => {
      if (!(await shouldClose())) e.preventDefault();
    })
    .then((u) => (off = u))
    .catch(() => {});
  return () => off?.();
}
