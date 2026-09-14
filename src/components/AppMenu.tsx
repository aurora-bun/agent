import { useEffect, useRef, useState } from "react";
import { ChevronRight, Menu as MenuIcon } from "lucide-react";
import {
  closeTab,
  createPdfFromImages,
  exportPagesAsImages,
  openFileDialog,
  openPath,
  printTab,
  saveTab,
  showDocumentProperties,
} from "../app/actions";
import { editorRedo, editorUndo, rotateView, setScaleValue, zoomIn, zoomOut } from "../app/viewers";
import { isMac, shortcut } from "../lib/platform";
import { baseName, closeWindow } from "../lib/tauri";
import { useActiveTab, useApp } from "../store";

interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  submenu?: MenuItem[];
}

interface Menu {
  label: string;
  items: MenuItem[];
}

function useMenus(): Menu[] {
  const tab = useActiveTab();
  const s = useApp();
  const ready = !!tab?.pdf;
  const id = tab?.id;
  const recentItems: MenuItem[] = s.recent.length
    ? [
        ...s.recent.map((p) => ({ label: baseName(p), action: () => openPath(p) })),
        { separator: true },
        {
          label: "Clear recent files",
          action: () => s.recent.forEach((p) => s.removeRecent(p)),
        },
      ]
    : [{ label: "No recent files", disabled: true }];

  return [
    {
      label: "File",
      items: [
        { label: "Open…", shortcut: "Ctrl+O", action: openFileDialog },
        { label: "Open recent", submenu: recentItems },
        { label: "Create PDF from images…", action: () => createPdfFromImages() },
        { separator: true },
        { label: "Save", shortcut: "Ctrl+S", disabled: !ready, action: () => id && saveTab(id) },
        { label: "Save as…", shortcut: "Ctrl+Shift+S", disabled: !ready, action: () => id && saveTab(id, true) },
        { label: "Export pages as images…", disabled: !ready, action: () => id && exportPagesAsImages(id, "png", 150) },
        { separator: true },
        { label: "Print…", shortcut: "Ctrl+P", disabled: !ready, action: () => id && printTab(id) },
        { label: "Document properties…", disabled: !ready, action: () => id && showDocumentProperties(id) },
        { separator: true },
        { label: "Close document", shortcut: "Ctrl+W", disabled: !tab, action: () => id && closeTab(id) },
        { label: isMac ? "Quit" : "Exit", shortcut: isMac ? "Ctrl+Q" : undefined, action: closeWindow },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo annotation", shortcut: "Ctrl+Z", disabled: !ready, action: editorUndo },
        { label: "Redo annotation", shortcut: "Ctrl+Y", disabled: !ready, action: editorRedo },
        { separator: true },
        { label: "Find…", shortcut: "Ctrl+F", disabled: !ready, action: () => s.setNavPanel("search") },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Zoom in", shortcut: "Ctrl++", disabled: !ready, action: zoomIn },
        { label: "Zoom out", shortcut: "Ctrl+-", disabled: !ready, action: zoomOut },
        { label: "Actual size", shortcut: "Ctrl+1", disabled: !ready, action: () => setScaleValue("1") },
        { label: "Fit page", shortcut: "Ctrl+0", disabled: !ready, action: () => setScaleValue("page-fit") },
        { label: "Fit width", shortcut: "Ctrl+2", disabled: !ready, action: () => setScaleValue("page-width") },
        { separator: true },
        { label: "Rotate view clockwise", disabled: !ready, action: () => rotateView(90) },
        { label: "Rotate view anticlockwise", disabled: !ready, action: () => rotateView(-90) },
        { separator: true },
        { label: "Page thumbnails", checked: s.navPanel === "thumbs", disabled: !ready, action: () => s.setNavPanel(s.navPanel === "thumbs" ? null : "thumbs") },
        { label: "Bookmarks", checked: s.navPanel === "outline", disabled: !ready, action: () => s.setNavPanel(s.navPanel === "outline" ? null : "outline") },
        { label: "Tools panel", checked: !!s.toolPanel, action: () => s.setToolPanel(s.toolPanel ? null : "tools") },
        { separator: true },
        { label: "Dark theme", checked: s.theme === "dark", action: () => s.setTheme(s.theme === "dark" ? "light" : "dark") },
      ],
    },
    {
      label: "Tools",
      items: [
        { label: "Comment", disabled: !ready, action: () => s.setToolPanel("comment") },
        { label: "Organize pages", disabled: !ready, action: () => s.setToolPanel("organize") },
        { label: "Fill & Sign", disabled: !ready, action: () => s.setToolPanel("fillsign") },
        { label: "Combine files", action: () => s.setToolPanel("combine") },
        { label: "Export & convert", action: () => s.setToolPanel("convert") },
      ],
    },
    {
      label: "Help",
      items: [{ label: "About Folio PDF", action: () => s.setModal({ kind: "about" }) }],
    },
  ];
}

/** Acrobat-style single "Menu" button: each classic menu becomes a submenu. */
export function AppMenu() {
  const menus = useMenus();
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (item: MenuItem) => {
    if (item.disabled || !item.action) return;
    setOpen(false);
    setSub(null);
    item.action();
  };

  const renderItems = (items: MenuItem[], allowSub: boolean, key: string) =>
    items.map((item, i) => {
      if (item.separator) return <div key={key + i} className="menu__sep" />;
      if (item.submenu && allowSub) {
        return (
          <div key={key + i} className={"menu__item menu__item--parent" + (sub === i ? " is-open" : "")} onMouseEnter={() => setSub(i)}>
            <span className="menu__check" />
            <span className="menu__label">{item.label}</span>
            <ChevronRight size={14} />
            {sub === i && <div className="menu menu--sub">{renderItems(item.submenu, false, key + i + ".")}</div>}
          </div>
        );
      }
      return (
        <button key={key + i} className="menu__item" disabled={item.disabled} onClick={() => run(item)} onMouseEnter={() => allowSub && setSub(null)}>
          <span className="menu__check">{item.checked ? "✓" : ""}</span>
          <span className="menu__label">{item.label}</span>
          {item.shortcut && <span className="menu__shortcut">{shortcut(item.shortcut)}</span>}
        </button>
      );
    });

  // Top level: one entry per classic menu (File, Edit, View, Tools, Help).
  // Nested submenus (Open recent) are flattened into a labelled section.
  const flatten = (items: MenuItem[]): MenuItem[] =>
    items.flatMap((it) =>
      it.submenu
        ? [{ label: it.label, disabled: true }, ...it.submenu.filter((r) => !r.separator).slice(0, 6).map((r) => ({ ...r, label: `   ${r.label}` }))]
        : [it],
    );
  const top: MenuItem[] = menus.map((m) => ({ label: m.label, submenu: flatten(m.items) }));

  return (
    <div className="appMenu" ref={rootRef}>
      <button
        className={"topbar__btn" + (open ? " is-active" : "")}
        onClick={() => {
          setOpen(!open);
          setSub(null);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MenuIcon size={16} />
        <span>Menu</span>
      </button>
      {open && <div className="menu menu--root">{renderItems(top, true, "m")}</div>}
    </div>
  );
}
