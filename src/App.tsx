import { useEffect } from "react";
import { closeTab, openFileDialog, openPaths, printTab, saveTab } from "./app/actions";
import { setScaleValue, zoomIn, zoomOut } from "./app/viewers";
import { confirmDialog, launchArgs, onCloseRequested, onFileDrop, onOpenFiles, setWindowTitle } from "./lib/tauri";
import { CommandBar } from "./components/CommandBar";
import { DocumentArea } from "./components/DocumentArea";
import { BusyOverlay, Modals, Toasts } from "./components/Modals";
import { RightRail } from "./components/RightRail";
import { TopBar } from "./components/TopBar";
import { OutlinePanel, SearchPanel, ThumbnailsPanel } from "./panels/LeftPanels";
import { ToolPanelHost } from "./panels/ToolPanel";
import { useActiveTab, useApp } from "./store";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export default function App() {
  const theme = useApp((s) => s.theme);
  const navPanel = useApp((s) => s.navPanel);
  const view = useApp((s) => s.view);
  const tabCount = useApp((s) => s.tabs.length);
  const active = useActiveTab();
  const showHome = view === "home" || tabCount === 0;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  // Window title reflects the active document.
  useEffect(() => {
    setWindowTitle(active ? `${active.dirty ? "• " : ""}${active.name} — Folio PDF` : "Folio PDF");
  }, [active?.name, active?.dirty, active]);

  // Startup: files from the command line, second instances, drag & drop, close guard.
  useEffect(() => {
    launchArgs().then((paths) => {
      if (paths.length) openPaths(paths);
    });
    const offOpen = onOpenFiles((paths) => openPaths(paths));
    const offDrop = onFileDrop(
      (paths) => openPaths(paths),
      (hover) => useApp.getState().setDropHover(hover),
    );
    const offClose = onCloseRequested(async () => {
      const dirty = useApp.getState().tabs.filter((t) => t.dirty && t.pdf);
      if (!dirty.length) return true;
      return confirmDialog(
        dirty.length === 1 ? `"${dirty[0].name}" has unsaved changes.\n\nQuit without saving?` : `${dirty.length} documents have unsaved changes.\n\nQuit without saving?`,
      );
    });
    const noMenu = (e: MouseEvent) => e.preventDefault();
    if (!import.meta.env.DEV) document.addEventListener("contextmenu", noMenu);
    return () => {
      offOpen();
      offDrop();
      offClose();
      document.removeEventListener("contextmenu", noMenu);
    };
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const id = s.activeId;
      const key = e.key.toLowerCase();

      if (ctrl && !e.altKey) {
        // Shortcuts that are safe even while typing.
        if (key === "o" && !e.shiftKey) return void (e.preventDefault(), openFileDialog());
        if (key === "s") return void (e.preventDefault(), id && saveTab(id, e.shiftKey));
        if (key === "p" && !e.shiftKey) return void (e.preventDefault(), id && printTab(id));
        if (key === "w" && !e.shiftKey) return void (e.preventDefault(), id && closeTab(id));
        if (key === "f" && !e.shiftKey) return void (e.preventDefault(), id && (s.setView("doc"), s.setNavPanel("search")));
        if (key === "tab") {
          e.preventDefault();
          const i = s.tabs.findIndex((t) => t.id === id);
          if (s.tabs.length > 1) {
            const n = (i + (e.shiftKey ? -1 : 1) + s.tabs.length) % s.tabs.length;
            s.setActive(s.tabs[n].id);
          }
          return;
        }
        if (key === "r" || e.key === "F5") return void e.preventDefault();
        if (isTypingTarget(e.target)) return;
        if (key === "=" || key === "+") return void (e.preventDefault(), zoomIn());
        if (key === "-" || key === "_") return void (e.preventDefault(), zoomOut());
        if (key === "0") return void (e.preventDefault(), setScaleValue("page-fit"));
        if (key === "1") return void (e.preventDefault(), setScaleValue("1"));
        if (key === "2") return void (e.preventDefault(), setScaleValue("page-width"));
        return;
      }
      if (e.key === "F5") return void e.preventDefault();
      if (e.key === "Escape" && !isTypingTarget(e.target)) {
        if (s.modal) return;
        if (s.tool !== "select") s.setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <CommandBar />
      <div className={"main" + (showHome ? " main--home" : "")}>
        {!showHome && <ToolPanelHost />}
        <DocumentArea />
        {!showHome && navPanel && active?.pdf && (
          <aside className="navPanel">
            {navPanel === "thumbs" && <ThumbnailsPanel tab={active} />}
            {navPanel === "outline" && <OutlinePanel tab={active} />}
            {navPanel === "search" && <SearchPanel tab={active} />}
          </aside>
        )}
        {!showHome && <RightRail />}
      </div>
      <Modals />
      <BusyOverlay />
      <Toasts />
    </div>
  );
}
