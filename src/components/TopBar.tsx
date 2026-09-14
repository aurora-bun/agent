import { useEffect, useRef, useState } from "react";
import { CircleHelp, Copy, FileText, Home as HomeIcon, Minus, Moon, Plus, Square, Sun, X } from "lucide-react";
import { closeTab, combinePaths, createPdfFromImages, openFileDialog } from "../app/actions";
import { isMac, shortcut } from "../lib/platform";
import { closeWindow, minimizeWindow, onMaximizedChange, pickPdfs, toggleMaximizeWindow, windowIsDecorated } from "../lib/tauri";
import { useApp } from "../store";
import { AppMenu } from "./AppMenu";

function CreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setToolPanel = useApp((s) => s.setToolPanel);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="createMenu" ref={ref}>
      <button className="doctab doctab--create" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <Plus size={14} /> Create
      </button>
      {open && (
        <div className="menu menu--root">
          <button className="menu__item" onClick={run(openFileDialog)}>
            <span className="menu__check" />
            <span className="menu__label">Open PDF…</span>
            <span className="menu__shortcut">{shortcut("Ctrl+O")}</span>
          </button>
          <button className="menu__item" onClick={run(() => createPdfFromImages())}>
            <span className="menu__check" />
            <span className="menu__label">PDF from images…</span>
          </button>
          <button
            className="menu__item"
            onClick={run(async () => {
              const paths = await pickPdfs(true);
              if (paths.length > 1) await combinePaths(paths);
              else setToolPanel("combine");
            })}
          >
            <span className="menu__check" />
            <span className="menu__label">Combine files…</span>
          </button>
        </div>
      )}
    </div>
  );
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => onMaximizedChange(setMaximized), []);
  return (
    <div className="winctl">
      <button className="winctl__btn" onClick={minimizeWindow} aria-label="Minimize" title="Minimize">
        <Minus size={14} />
      </button>
      <button className="winctl__btn" onClick={toggleMaximizeWindow} aria-label={maximized ? "Restore" : "Maximize"} title={maximized ? "Restore" : "Maximize"}>
        {maximized ? <Copy size={12} /> : <Square size={12} />}
      </button>
      <button className="winctl__btn winctl__btn--close" onClick={closeWindow} aria-label="Close" title="Close">
        <X size={15} />
      </button>
    </div>
  );
}

export function TopBar() {
  const tabs = useApp((s) => s.tabs);
  const activeId = useApp((s) => s.activeId);
  const view = useApp((s) => s.view);
  const setActive = useApp((s) => s.setActive);
  const setView = useApp((s) => s.setView);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const setModal = useApp((s) => s.setModal);
  const [decorated, setDecorated] = useState(true);
  useEffect(() => {
    windowIsDecorated().then(setDecorated);
  }, []);

  return (
    <header className={"topbar" + (isMac ? " topbar--mac" : "")} data-tauri-drag-region>
      <div className="topbar__left">
        <AppMenu />
        <button className={"topbar__icon" + (view === "home" ? " is-active" : "")} onClick={() => setView("home")} title="Home" aria-label="Home">
          <HomeIcon size={17} />
        </button>
        <div className="doctabs" data-tauri-drag-region>
          {tabs.map((t) => (
            <div
              key={t.id}
              role="tab"
              aria-selected={view === "doc" && t.id === activeId}
              className={"doctab" + (view === "doc" && t.id === activeId ? " is-active" : "")}
              onClick={() => setActive(t.id)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  closeTab(t.id);
                }
              }}
              title={t.path ?? t.name}
            >
              <FileText size={14} className="doctab__icon" />
              <span className="doctab__name">{t.name}</span>
              {t.dirty && <span className="doctab__dirty" title="Unsaved changes" />}
              <button
                className="doctab__close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                aria-label={`Close ${t.name}`}
                title={`Close (${shortcut("Ctrl+W")})`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
        <CreateMenu />
        <div className="topbar__drag" data-tauri-drag-region />
      </div>
      <div className="topbar__right">
        <button className="topbar__btn" onClick={() => setModal({ kind: "about" })} title="Help and shortcuts">
          <CircleHelp size={15} />
          <span>Help</span>
        </button>
        <button className="topbar__icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title={theme === "dark" ? "Light theme" : "Dark theme"} aria-label="Toggle theme">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {!decorated && !isMac && <WindowControls />}
      </div>
    </header>
  );
}
