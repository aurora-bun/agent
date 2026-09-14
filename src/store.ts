import { create } from "zustand";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { forgetThumbs } from "./lib/thumbs";

/** Navigation panels live on the right (next to the rail), like current Acrobat. */
export type NavPanel = "thumbs" | "outline" | "search" | null;
/** Tool panels live on the left; "tools" is the All tools list. */
export type ToolPanel = "tools" | "comment" | "organize" | "fillsign" | "combine" | "convert" | null;
/** "home" shows the Home page even while documents stay open in tabs. */
export type View = "home" | "doc";
export type Tool = "select" | "highlight" | "ink" | "text" | "note" | "image";
export type Theme = "light" | "dark";

export interface DocTab {
  id: string;
  path: string | null;
  name: string;
  bytes: Uint8Array;
  pdf: PDFDocumentProxy | null;
  /** Password the document was opened with, needed again on reload. */
  password: string | null;
  /** The file uses PDF encryption (with or without a user password). */
  encrypted: boolean;
  /** Incremented whenever `bytes` are replaced so dependants can refresh. */
  version: number;
  pageCount: number;
  currentPage: number;
  /** Page to jump to once the (re)loaded document is laid out. */
  restorePage: number | null;
  scaleValue: string;
  scale: number;
  rotation: number;
  dirty: boolean;
  loading: boolean;
  error: string | null;
}

export interface PasswordModal {
  kind: "password";
  name: string;
  wrong: boolean;
  resolve: (password: string | null) => void;
}
export interface TextModal {
  kind: "text";
  title: string;
  label: string;
  defaultValue: string;
  multiline: boolean;
  resolve: (value: string | null) => void;
}
export interface SignatureModal {
  kind: "signature";
  resolve: (dataUrl: string | null) => void;
}
export interface InfoModal {
  kind: "info";
  title: string;
  rows: Array<[string, string]>;
}
export interface AboutModal {
  kind: "about";
}
export type Modal = PasswordModal | TextModal | SignatureModal | InfoModal | AboutModal;

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

interface AppState {
  tabs: DocTab[];
  activeId: string | null;
  navPanel: NavPanel;
  toolPanel: ToolPanel;
  view: View;
  tool: Tool;
  theme: Theme;
  recent: string[];
  busy: string | null;
  modal: Modal | null;
  toasts: Toast[];
  dropHover: boolean;
  /** Which page is being targeted by a click-to-place tool (sticky note). */
  placing: "note" | null;
  /** Query typed in the command bar, picked up by the Find panel when it opens. */
  pendingFind: string | null;

  addTab: (tab: DocTab) => void;
  updateTab: (id: string, patch: Partial<DocTab> | ((t: DocTab) => Partial<DocTab>)) => void;
  removeTab: (id: string) => void;
  setActive: (id: string | null) => void;
  setNavPanel: (p: NavPanel) => void;
  setToolPanel: (p: ToolPanel) => void;
  setView: (v: View) => void;
  setTool: (t: Tool) => void;
  setTheme: (t: Theme) => void;
  addRecent: (path: string) => void;
  removeRecent: (path: string) => void;
  setBusy: (text: string | null) => void;
  setModal: (m: Modal | null) => void;
  toast: (text: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;
  setDropHover: (v: boolean) => void;
  setPlacing: (p: "note" | null) => void;
  setPendingFind: (q: string | null) => void;
}

const RECENT_KEY = "folio.recent";
const THEME_KEY = "folio.theme";
const MAX_RECENT = 12;

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    /* ignore */
  }
  return "light";
}

let toastSeq = 0;

/** Release a pdf.js document after the viewer has had a chance to unbind it. */
export function destroyLater(pdf: PDFDocumentProxy): void {
  setTimeout(() => pdf.loadingTask.destroy().catch(() => {}), 100);
}

export const useApp = create<AppState>((set, get) => ({
  tabs: [],
  activeId: null,
  navPanel: null,
  toolPanel: "tools",
  view: "home",
  tool: "select",
  theme: loadTheme(),
  recent: loadRecent(),
  busy: null,
  modal: null,
  toasts: [],
  dropHover: false,
  placing: null,
  pendingFind: null,

  addTab: (tab) => set((s) => ({ tabs: [...s.tabs, tab] })),
  updateTab: (id, patch) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t)),
    })),
  removeTab: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const gone = s.tabs[idx];
      if (gone?.pdf) destroyLater(gone.pdf);
      if (gone) forgetThumbs(`${gone.id}:`);
      const tabs = s.tabs.filter((t) => t.id !== id);
      let activeId = s.activeId;
      if (activeId === id) {
        const next = tabs[Math.min(idx, tabs.length - 1)];
        activeId = next ? next.id : null;
      }
      return { tabs, activeId };
    }),
  setActive: (id) => set({ activeId: id, placing: null, view: "doc" }),
  setNavPanel: (navPanel) => set({ navPanel }),
  setToolPanel: (toolPanel) => set(toolPanel ? { toolPanel, view: "doc" } : { toolPanel }),
  setView: (view) => set({ view }),
  setTool: (tool) => set({ tool, placing: tool === "note" ? "note" : null }),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
  addRecent: (path) => {
    const recent = [path, ...get().recent.filter((p) => p !== path)].slice(0, MAX_RECENT);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      /* ignore */
    }
    set({ recent });
  },
  removeRecent: (path) => {
    const recent = get().recent.filter((p) => p !== path);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      /* ignore */
    }
    set({ recent });
  },
  setBusy: (busy) => set({ busy }),
  setModal: (modal) => set({ modal }),
  toast: (text, kind = "info") => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => get().dismissToast(id), kind === "error" ? 6000 : 3000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setDropHover: (dropHover) => set({ dropHover }),
  setPlacing: (placing) => set({ placing }),
  setPendingFind: (pendingFind) => set({ pendingFind }),
}));

export function activeTab(): DocTab | undefined {
  const s = useApp.getState();
  return s.tabs.find((t) => t.id === s.activeId);
}

export function useActiveTab(): DocTab | undefined {
  return useApp((s) => s.tabs.find((t) => t.id === s.activeId));
}

/* ---------- promise-based modals ---------- */

export function askPassword(name: string, wrong: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    useApp.getState().setModal({
      kind: "password",
      name,
      wrong,
      resolve: (v) => {
        useApp.getState().setModal(null);
        resolve(v);
      },
    });
  });
}

export function askText(title: string, label: string, defaultValue = "", multiline = false): Promise<string | null> {
  return new Promise((resolve) => {
    useApp.getState().setModal({
      kind: "text",
      title,
      label,
      defaultValue,
      multiline,
      resolve: (v) => {
        useApp.getState().setModal(null);
        resolve(v);
      },
    });
  });
}

export function askSignature(): Promise<string | null> {
  return new Promise((resolve) => {
    useApp.getState().setModal({
      kind: "signature",
      resolve: (v) => {
        useApp.getState().setModal(null);
        resolve(v);
      },
    });
  });
}
